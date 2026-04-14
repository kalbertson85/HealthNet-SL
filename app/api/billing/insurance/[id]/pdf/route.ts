import { NextResponse, type NextRequest } from "next/server"
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { enforceTrustedOriginOrReferer } from "@/lib/http/request-security"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"
import { fetchInsuranceBatchDetails } from "@/lib/billing/insurance-batches"
import { createTranslator } from "@/lib/i18n"
import { formatCurrency, formatDate, formatFacilityAddress, type GlobalSettingsInput } from "@/lib/locale-format"
import { requireRole, requireFacilityAccess, parseUuidParam, resolveAuthError } from "@/lib/auth-guard"
import { ROLES } from "@/lib/utils"

const PAGE_MARGIN = 36
const BORDER = rgb(0.84, 0.87, 0.91)
const MUTED = rgb(0.42, 0.46, 0.52)
const HEADER_FILL = rgb(0.95, 0.97, 0.99)
const BRAND = rgb(0.1, 0.31, 0.69)
const TEXT = rgb(0.16, 0.18, 0.2)

type PageState = {
  page: PDFPage
  y: number
}

function addPage(pdfDoc: PDFDocument): PageState {
  const page = pdfDoc.addPage()
  return { page, y: page.getSize().height - PAGE_MARGIN }
}

function ensureSpace(pdfDoc: PDFDocument, state: PageState, needed: number): PageState {
  if (state.y - needed >= PAGE_MARGIN) return state
  return addPage(pdfDoc)
}

function drawText(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = TEXT) {
  page.drawText(text, { x, y, size, font, color })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "insurance_batch_pdf",
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (limited) return limited

  const originGuard = enforceTrustedOriginOrReferer(request)
  if (originGuard) return originGuard

  try {
    const { supabase, user } = await requireRole([ROLES.ADMIN, ROLES.FACILITY_ADMIN, ROLES.CASHIER])
    const { id: rawId } = await params
    const id = parseUuidParam(rawId, "insurance batch id")

    const { data: facilityVisit } = await supabase
      .from("insurance_billing_batch_items")
      .select("visit_id")
      .eq("batch_id", id)
      .not("visit_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (facilityVisit?.visit_id) {
      const { data: visitRow } = await supabase.from("visits").select("facility_id").eq("id", facilityVisit.visit_id).maybeSingle()
      requireFacilityAccess({ user, supabase }, visitRow?.facility_id ?? null)
    }

    const batchDetails = await fetchInsuranceBatchDetails(supabase, id)
    if (!batchDetails) {
      return new NextResponse("Insurance batch not found", { status: 404 })
    }

    const { batch, groupedPatients } = batchDetails
    const { data: settings } = await supabase
      .from("hospital_settings")
      .select("hospital_name, address, address_line_1, address_line_2, city, state_or_province, postal_code, country, phone, email, currency_code, locale, timezone, date_format, time_format, language")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    const t = createTranslator(settings?.language)

    const pdfDoc = await PDFDocument.create()
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    let state = addPage(pdfDoc)
    let { page, y } = state
    const pageWidth = page.getSize().width
    const contentWidth = pageWidth - PAGE_MARGIN * 2

    drawText(page, (settings?.hospital_name || "Hospital").trim(), PAGE_MARGIN, y, 15, bold)
    y -= 18
    for (const line of [formatFacilityAddress(settings as GlobalSettingsInput), settings?.phone ? `Tel: ${settings.phone}` : null, settings?.email ? `Email: ${settings.email}` : null].filter(Boolean) as string[]) {
      drawText(page, line, PAGE_MARGIN, y, 9, regular, MUTED)
      y -= 12
    }

    drawText(page, t("pdf.insuranceInvoice", "Insurance Invoice").toUpperCase(), pageWidth - 205, state.y, 21, bold, BRAND)
    drawText(page, `${t("pdf.batchNumber", "Batch #")}: ${batch.batch_number || batch.id}`, pageWidth - 205, state.y - 24, 10, regular)
    drawText(page, `${t("pdf.status", "Status")}: ${batch.status}`, pageWidth - 205, state.y - 38, 10, bold)
    drawText(page, `${t("pdf.period", "Period")}: ${formatDate(batch.from_date, settings as GlobalSettingsInput)} to ${formatDate(batch.to_date, settings as GlobalSettingsInput)}`, pageWidth - 205, state.y - 52, 9, regular, MUTED)

    y = Math.min(y, state.y - 72)
    page.drawLine({
      start: { x: PAGE_MARGIN, y },
      end: { x: pageWidth - PAGE_MARGIN, y },
      color: BORDER,
      thickness: 1,
    })
    y -= 18

    const boxWidth = (contentWidth - 16) / 2
    for (const [index, block] of [
      {
        title: t("pdf.billTo", "Bill To"),
        rows: [
          { label: t("pdf.provider", "Provider"), value: batch.companyName || "Insurance provider" },
          { label: t("pdf.contact", "Contact"), value: [batch.companyContactPerson, batch.companyPhone].filter(Boolean).join(" · ") || batch.companyEmail || "-" },
          { label: t("pdf.address", "Address"), value: batch.companyAddress || "-" },
          { label: t("settings.email", "Email"), value: batch.companyEmail || "-" },
        ],
      },
      {
        title: t("pdf.batchSummary", "Batch Summary"),
        rows: [
          { label: t("pdf.beneficiaries", "Beneficiaries"), value: String(groupedPatients.length) },
          { label: t("pdf.grandTotal", "Grand total"), value: formatCurrency(batch.total_amount, settings as GlobalSettingsInput) },
          { label: t("pdf.amountPaid", "Amount paid"), value: formatCurrency(batch.paid_amount, settings as GlobalSettingsInput) },
          { label: t("pdf.balance", "Balance"), value: formatCurrency(Math.max(batch.total_amount - batch.paid_amount, 0), settings as GlobalSettingsInput) },
        ],
      },
    ].entries()) {
      const x = PAGE_MARGIN + index * (boxWidth + 16)
      const boxHeight = 94
      page.drawRectangle({
        x,
        y: y - boxHeight,
        width: boxWidth,
        height: boxHeight,
        borderColor: BORDER,
        borderWidth: 1,
      })
      page.drawRectangle({
        x,
        y: y - 24,
        width: boxWidth,
        height: 24,
        color: HEADER_FILL,
      })
      drawText(page, block.title, x + 10, y - 16, 11, bold)
      let rowY = y - 38
      for (const row of block.rows) {
        drawText(page, row.label, x + 10, rowY, 9, bold, MUTED)
        drawText(page, row.value, x + boxWidth * 0.38, rowY, 10, regular)
        rowY -= 15
      }
    }
    y -= 112

    const columns = [
      { label: t("pdf.date", "Date"), x: PAGE_MARGIN + 8 },
      { label: t("pdf.visit", "Visit"), x: PAGE_MARGIN + 72 },
      { label: t("pdf.service", "Service"), x: PAGE_MARGIN + 132 },
      { label: t("pdf.qty", "Qty"), x: PAGE_MARGIN + 385 },
      { label: t("pdf.unit", "Unit"), x: PAGE_MARGIN + 422 },
      { label: t("pdf.total", "Total"), x: PAGE_MARGIN + 490 },
    ]

    for (const group of groupedPatients) {
      state = ensureSpace(pdfDoc, { page, y }, 96)
      page = state.page
      y = state.y

      page.drawRectangle({
        x: PAGE_MARGIN,
        y: y - 24,
        width: contentWidth,
        height: 24,
        color: HEADER_FILL,
        borderColor: BORDER,
        borderWidth: 1,
      })
      const relationshipParts = [
        group.patientNumber,
        group.relationship || null,
        group.principalEmployeeName ? `Principal: ${group.principalEmployeeName}` : null,
      ].filter(Boolean)
      drawText(page, group.patientName, PAGE_MARGIN + 8, y - 16, 11, bold)
      drawText(page, relationshipParts.join(" · "), PAGE_MARGIN + 200, y - 16, 8, regular, MUTED)
      drawText(page, formatCurrency(group.total, settings as GlobalSettingsInput), pageWidth - 118, y - 16, 10, bold)
      y -= 28

      page.drawRectangle({
        x: PAGE_MARGIN,
        y: y - 18,
        width: contentWidth,
        height: 18,
        color: rgb(0.985, 0.99, 0.995),
        borderColor: BORDER,
        borderWidth: 1,
      })
      for (const column of columns) {
        drawText(page, column.label, column.x, y - 12, 8, bold)
      }
      y -= 20

      for (const invoice of group.invoices) {
        const items = invoice.lineItems.length
          ? invoice.lineItems
          : [{ description: invoice.invoiceNumber, quantity: 1, unit_price: invoice.amount, amount: invoice.amount }]

        for (const item of items) {
          state = ensureSpace(pdfDoc, { page, y }, 20)
          page = state.page
          y = state.y

          page.drawRectangle({
            x: PAGE_MARGIN,
            y: y - 16,
            width: contentWidth,
            height: 16,
            borderColor: BORDER,
            borderWidth: 1,
          })
          drawText(page, formatDate(invoice.createdAt, settings as GlobalSettingsInput), columns[0].x, y - 11, 8, regular)
          drawText(page, invoice.visitReference, columns[1].x, y - 11, 8, regular)
          drawText(page, item.description.slice(0, 44), columns[2].x, y - 11, 8, regular)
          drawText(page, String(item.quantity), columns[3].x, y - 11, 8, regular)
          drawText(page, formatCurrency(item.unit_price, settings as GlobalSettingsInput), columns[4].x, y - 11, 8, regular)
          drawText(page, formatCurrency(item.amount, settings as GlobalSettingsInput), columns[5].x, y - 11, 8, regular)
          y -= 18
        }
      }

      drawText(page, `${t("pdf.beneficiarySubtotal", "Beneficiary subtotal")}: ${formatCurrency(group.total, settings as GlobalSettingsInput)}`, PAGE_MARGIN + 8, y - 2, 9, bold, MUTED)
      y -= 22
    }

    state = ensureSpace(pdfDoc, { page, y }, 80)
    page = state.page
    y = state.y

    page.drawRectangle({
      x: pageWidth - 220,
      y: y - 56,
      width: 184,
      height: 56,
      borderColor: BORDER,
      borderWidth: 1,
      color: HEADER_FILL,
    })
    drawText(page, `${t("pdf.grandTotal", "Grand total")}  ${formatCurrency(batch.total_amount, settings as GlobalSettingsInput)}`, pageWidth - 208, y - 16, 10, bold)
    drawText(page, `${t("pdf.amountPaid", "Amount paid")}  ${formatCurrency(batch.paid_amount, settings as GlobalSettingsInput)}`, pageWidth - 208, y - 31, 9, regular)
    drawText(page, `${t("pdf.balance", "Balance")}  ${formatCurrency(Math.max(batch.total_amount - batch.paid_amount, 0), settings as GlobalSettingsInput)}`, pageWidth - 208, y - 45, 9, regular)

    drawText(
      page,
      `${t("pdf.generated", "Generated")} ${new Intl.DateTimeFormat(settings?.locale || "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: settings?.timezone || "UTC" }).format(new Date())}`,
      PAGE_MARGIN,
      y - 50,
      8,
      regular,
      MUTED,
    )

    const pdfBytes = await pdfDoc.save()
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        ...NO_STORE_DOWNLOAD_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${(batch.batch_number || batch.id).replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf"`,
      },
    })
  } catch (error) {
    const authResponse = resolveAuthError(error, request, (status, code, message) => apiError(status, code, message, request))
    if (authResponse) return authResponse
    throw error
  }
}
