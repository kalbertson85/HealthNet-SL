import { NextResponse, type NextRequest } from "next/server"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"
import { fetchCompanyCoverageMap } from "@/lib/billing/company-coverage"
import { formatCurrency, formatDate, formatFacilityAddress, type GlobalSettingsInput } from "@/lib/locale-format"
import { ROLES } from "@/lib/utils"

const PAGE_MARGIN = 36
const ROW_HEIGHT = 18
const BORDER = rgb(0.83, 0.87, 0.92)
const MUTED = rgb(0.42, 0.46, 0.52)
const HEADER_FILL = rgb(0.95, 0.97, 0.99)
const BRAND = rgb(0.1, 0.31, 0.69)

function parseDateParam(value: string | null, fallback: Date) {
  if (!value) return fallback
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "company_billing_statement_pdf",
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase, user } = await requirePermission(request, "admin.export")
    if (user?.role !== ROLES.ADMIN) {
      return apiError(403, "forbidden", "Forbidden: only admin can export company billing statements", request)
    }
    const { searchParams } = new URL(request.url)
    const companyId = (searchParams.get("company_id") || "").trim()
    if (!companyId) {
      return new NextResponse("Company ID is required", { status: 400 })
    }

    const today = new Date()
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const fromDate = parseDateParam(searchParams.get("from"), startOfMonth)
    const toDate = parseDateParam(searchParams.get("to"), endOfMonth)
    const fromIso = fromDate.toISOString()
    const toIso = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999).toISOString()

    const [{ data: company }, { data: invoicesRaw }, { data: settings }] = await Promise.all([
      supabase
        .from("companies")
        .select("id, name, address, contact_person, phone, email")
        .eq("id", companyId)
        .maybeSingle(),
      supabase
        .from("invoices")
        .select("id, invoice_number, created_at, total_amount, paid_amount, status, patient_id, visit_id")
        .eq("payer_type", "company")
        .eq("company_id", companyId)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: true }),
      supabase
        .from("hospital_settings")
        .select("hospital_name, address, address_line_1, address_line_2, city, state_or_province, postal_code, country, phone, email, currency_code, locale, timezone, date_format, time_format, language")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])

    if (!company) {
      return new NextResponse("Company not found", { status: 404 })
    }

    const invoices = (invoicesRaw || []) as Array<{
      id: string
      invoice_number?: string | null
      created_at?: string | null
      total_amount?: number | null
      paid_amount?: number | null
      status?: string | null
      patient_id?: string | null
      visit_id?: string | null
    }>

    if (invoices.length === 0) {
      return new NextResponse("No company invoices found for the selected period", { status: 404 })
    }

    const patientIds = Array.from(new Set(invoices.map((invoice) => invoice.patient_id).filter((id): id is string => Boolean(id))))
    const coverageMap = await fetchCompanyCoverageMap(supabase, companyId, patientIds)

    const { data: patientsRaw } = patientIds.length
      ? await supabase.from("patients").select("id, full_name, patient_number").in("id", patientIds)
      : { data: [] }

    const patientById = new Map(
      ((patientsRaw || []) as Array<{ id: string; full_name?: string | null; patient_number?: string | null }>).map((patient) => [
        patient.id,
        patient,
      ]),
    )

    const rows = invoices.map((invoice) => {
      const patient = invoice.patient_id ? patientById.get(invoice.patient_id) : null
      const coverage = invoice.patient_id ? coverageMap.get(invoice.patient_id) : null
      const total = Number(invoice.total_amount ?? 0)
      const paid = Number(invoice.paid_amount ?? 0)
      const balance = Math.max(total - paid, 0)
      return {
        date: formatDate(invoice.created_at || null, settings as GlobalSettingsInput),
        beneficiary: patient?.full_name || coverage?.beneficiaryName || "Unknown patient",
        patientNumber: patient?.patient_number || "-",
        relationship: coverage?.relationshipLabel || "Unlinked",
        principalEmployee: coverage?.principalEmployeeName || "Not linked",
        visitReference: invoice.visit_id ? `VIS-${invoice.visit_id.replace(/-/g, "").slice(-6).toUpperCase()}` : "-",
        invoiceNumber: invoice.invoice_number || invoice.id,
        total,
        paid,
        balance,
      }
    })

    const grouped = new Map<string, typeof rows>()
    for (const row of rows) {
      const key = row.principalEmployee
      const bucket = grouped.get(key) || []
      bucket.push(row)
      grouped.set(key, bucket)
    }

    const totalBilled = rows.reduce((sum, row) => sum + row.total, 0)
    const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0)
    const totalOutstanding = rows.reduce((sum, row) => sum + row.balance, 0)

    const pdfDoc = await PDFDocument.create()
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    let page = pdfDoc.addPage()
    let y = page.getSize().height - PAGE_MARGIN
    const pageWidth = page.getSize().width

    const ensureSpace = (needed: number) => {
      if (y - needed >= PAGE_MARGIN) return
      page = pdfDoc.addPage()
      y = page.getSize().height - PAGE_MARGIN
    }

    const draw = (text: string, x: number, size = 10, font = regular, color = rgb(0.16, 0.18, 0.2)) => {
      page.drawText(text, { x, y, size, font, color })
    }

    draw((settings?.hospital_name || "Hospital").trim(), PAGE_MARGIN, 14, bold)
    y -= 18
    for (const line of [formatFacilityAddress(settings as GlobalSettingsInput), settings?.phone ? `Tel: ${settings.phone}` : null, settings?.email ? `Email: ${settings.email}` : null].filter(Boolean) as string[]) {
      draw(line, PAGE_MARGIN, 9, regular, MUTED)
      y -= 12
    }

    draw("COMPANY BILLING STATEMENT", pageWidth - 250, 18, bold, BRAND)
    y -= 12
    draw(`${company.name || "Unknown company"}`, PAGE_MARGIN, 12, bold)
    y -= 14
    for (const line of [company.address, company.contact_person ? `Contact: ${company.contact_person}` : null, company.phone ? `Phone: ${company.phone}` : null, company.email ? `Email: ${company.email}` : null].filter(Boolean) as string[]) {
      draw(line, PAGE_MARGIN, 9, regular, MUTED)
      y -= 12
    }

    y -= 8
    draw(`Period: ${formatDate(fromIso, settings as GlobalSettingsInput)} to ${formatDate(toIso, settings as GlobalSettingsInput)}`, PAGE_MARGIN, 10, bold)
    y -= 14
    draw(`Patients/beneficiaries: ${rows.length}`, PAGE_MARGIN, 9, regular, MUTED)
    draw(`Billed: ${formatCurrency(totalBilled, settings as GlobalSettingsInput)}`, 220, 9, regular, MUTED)
    draw(`Paid: ${formatCurrency(totalPaid, settings as GlobalSettingsInput)}`, 360, 9, regular, MUTED)
    draw(`Outstanding: ${formatCurrency(totalOutstanding, settings as GlobalSettingsInput)}`, 470, 9, regular, MUTED)
    y -= 20

    const columns = [
      { label: "Date", x: PAGE_MARGIN, width: 58 },
      { label: "Beneficiary", x: 96, width: 120 },
      { label: "Relation", x: 220, width: 72 },
      { label: "Principal Employee", x: 296, width: 110 },
      { label: "Visit", x: 410, width: 54 },
      { label: "Invoice", x: 468, width: 68 },
      { label: "Amount", x: 540, width: 55 },
    ]

    const drawTableHeader = () => {
      page.drawRectangle({
        x: PAGE_MARGIN,
        y: y - 14,
        width: pageWidth - PAGE_MARGIN * 2,
        height: 18,
        color: HEADER_FILL,
        borderColor: BORDER,
        borderWidth: 1,
      })
      for (const column of columns) {
        page.drawText(column.label, { x: column.x + 2, y: y - 9, size: 8, font: bold })
      }
      y -= 20
    }

    drawTableHeader()

    for (const [principalEmployee, employeeRows] of grouped.entries()) {
      ensureSpace(32)
      page.drawRectangle({
        x: PAGE_MARGIN,
        y: y - 12,
        width: pageWidth - PAGE_MARGIN * 2,
        height: 16,
        color: rgb(0.985, 0.99, 0.995),
        borderColor: BORDER,
        borderWidth: 1,
      })
      draw(principalEmployee, PAGE_MARGIN + 6, 9, bold)
      y -= 18

      for (const row of employeeRows) {
        ensureSpace(24)
        page.drawRectangle({
          x: PAGE_MARGIN,
          y: y - 12,
          width: pageWidth - PAGE_MARGIN * 2,
          height: 16,
          borderColor: BORDER,
          borderWidth: 1,
        })
        draw(row.date, columns[0].x + 2, 8)
        draw(row.beneficiary.slice(0, 22), columns[1].x + 2, 8)
        draw(row.relationship.slice(0, 12), columns[2].x + 2, 8)
        draw(row.principalEmployee.slice(0, 20), columns[3].x + 2, 8)
        draw(row.visitReference, columns[4].x + 2, 8)
        draw(row.invoiceNumber.slice(0, 12), columns[5].x + 2, 8)
        draw(formatCurrency(row.total), columns[6].x + 2, 8)
        y -= ROW_HEIGHT
      }

      const employeeTotal = employeeRows.reduce((sum, row) => sum + row.total, 0)
      const employeeOutstanding = employeeRows.reduce((sum, row) => sum + row.balance, 0)
      ensureSpace(20)
      draw(`Family total: ${formatCurrency(employeeTotal)}  |  Outstanding: ${formatCurrency(employeeOutstanding)}`, PAGE_MARGIN + 6, 8, bold, MUTED)
      y -= 18
    }

    draw(`Generated on ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`, PAGE_MARGIN, 8, regular, MUTED)

    const pdfBytes = await pdfDoc.save()

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=company_statement_${company.name || company.id}_${fromDate.toISOString().slice(0, 10)}.pdf`,
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export company billing statement PDF", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
