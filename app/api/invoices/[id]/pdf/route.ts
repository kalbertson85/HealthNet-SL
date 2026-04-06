import { NextResponse, type NextRequest } from "next/server"
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"
import { fetchCompanyCoverageMap } from "@/lib/billing/company-coverage"

const PAGE_MARGIN = 40
const SECTION_GAP = 18
const LINE_GAP = 6
const FONT_SIZE_BODY = 10
const FONT_SIZE_SMALL = 9
const FONT_SIZE_HEADING = 18
const FONT_SIZE_LABEL = 9
const BRAND_BLUE = rgb(0.1, 0.31, 0.69)
const TEXT_COLOR = rgb(0.15, 0.17, 0.2)
const MUTED_TEXT = rgb(0.4, 0.45, 0.52)
const BORDER_COLOR = rgb(0.84, 0.87, 0.91)
const LIGHT_FILL = rgb(0.96, 0.97, 0.99)

type LineItem = {
  description?: string | null
  quantity?: number | null
  unit_price?: number | null
}

type InvoiceRecord = {
  id: string
  invoice_number?: string | null
  patient_id?: string | null
  subtotal?: number | null
  tax?: number | null
  total?: number | null
  total_amount?: number | null
  paid_amount?: number | null
  paid_status?: string | null
  status?: string | null
  created_at?: string | null
  line_items?: LineItem[] | null
  visit_id?: string | null
  payer_type?: string | null
  company_id?: string | null
  created_by?: string | null
  notes?: string | null
  visits?: {
    id?: string | null
    diagnosis?: string | null
    assigned_company_id?: string | null
    patients?: {
      full_name?: string | null
      patient_number?: string | null
      insurance_type?: string | null
      insurance_card_number?: string | null
      insurance_expiry_date?: string | null
      insurance_mobile?: string | null
    } | null
  } | null
}

type CompanyRecord = {
  name?: string | null
  address?: string | null
  contact_person?: string | null
  phone?: string | null
  email?: string | null
  terms?: string | null
  invoice_footer_text?: string | null
} | null

type HospitalSettings = {
  hospital_name?: string | null
  billing_logo_url?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
} | null

type PageState = {
  page: PDFPage
  y: number
}

function formatCurrency(value: number): string {
  return `Le ${new Intl.NumberFormat("en-SL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)}`
}

function formatDateTime(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text.trim()) return []
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }

    if (current) {
      lines.push(current)
      current = word
      continue
    }

    let chunk = ""
    for (const char of word) {
      const next = chunk + char
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        chunk = next
      } else {
        if (chunk) lines.push(chunk)
        chunk = char
      }
    }
    current = chunk
  }

  if (current) lines.push(current)
  return lines
}

function addPage(pdfDoc: PDFDocument): PageState {
  const page = pdfDoc.addPage()
  return { page, y: page.getSize().height - PAGE_MARGIN }
}

function ensureSpace(pdfDoc: PDFDocument, state: PageState, neededHeight: number): PageState {
  if (state.y - neededHeight >= PAGE_MARGIN) return state
  return addPage(pdfDoc)
}

function drawTextLine(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = TEXT_COLOR,
) {
  page.drawText(text, { x, y, font, size, color })
}

function drawWrappedBlock(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  size: number,
  color = TEXT_COLOR,
  lineHeight = size + 3,
): number {
  const lines = wrapText(text, font, size, width)
  let cursor = y
  for (const line of lines) {
    drawTextLine(page, line, x, cursor, font, size, color)
    cursor -= lineHeight
  }
  return cursor
}

function drawInfoBox(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  title: string,
  rows: Array<{ label: string; value: string }>,
  fonts: { regular: PDFFont; bold: PDFFont },
): number {
  const titleHeight = 16
  const rowHeight = 15
  const height = 14 + titleHeight + rows.length * rowHeight

  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
    color: rgb(1, 1, 1),
  })
  page.drawRectangle({
    x,
    y: y - titleHeight - 6,
    width,
    height: titleHeight + 6,
    color: LIGHT_FILL,
  })

  drawTextLine(page, title, x + 12, y - 16, fonts.bold, FONT_SIZE_BODY)

  let cursor = y - 34
  for (const row of rows) {
    drawTextLine(page, row.label, x + 12, cursor, fonts.bold, FONT_SIZE_LABEL, MUTED_TEXT)
    drawTextLine(page, row.value || "-", x + width * 0.38, cursor, fonts.regular, FONT_SIZE_BODY)
    cursor -= rowHeight
  }

  return y - height
}

function drawSectionTitle(page: PDFPage, title: string, x: number, y: number, bold: PDFFont): number {
  drawTextLine(page, title, x, y, bold, 12)
  page.drawLine({
    start: { x, y: y - 4 },
    end: { x: x + 120, y: y - 4 },
    color: BORDER_COLOR,
    thickness: 1,
  })
  return y - 18
}

function drawKeyValueLines(
  page: PDFPage,
  rows: Array<{ label: string; value: string }>,
  x: number,
  y: number,
  width: number,
  fonts: { regular: PDFFont; bold: PDFFont },
): number {
  let cursor = y
  const labelWidth = 82
  for (const row of rows) {
    drawTextLine(page, row.label, x, cursor, fonts.bold, FONT_SIZE_LABEL, MUTED_TEXT)
    const nextY = drawWrappedBlock(page, row.value || "-", x + labelWidth, cursor, width - labelWidth, fonts.regular, FONT_SIZE_BODY)
    cursor = nextY - LINE_GAP
  }
  return cursor
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_invoice_pdf",
    maxRequests: 60,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "billing.manage")
    const { id } = await params

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select(
        `id, invoice_number, patient_id, subtotal, tax, total, total_amount, paid_amount, paid_status, status, created_at, line_items, visit_id, payer_type, company_id, created_by, notes,
         visits (
           id,
           diagnosis,
           assigned_company_id,
           patients (full_name, patient_number, insurance_type, insurance_card_number, insurance_expiry_date, insurance_mobile)
         )`,
      )
      .eq("id", id)
      .maybeSingle()

    if (error || !invoice) {
      return new NextResponse("Invoice not found", { status: 404 })
    }

    const typedInvoice = invoice as InvoiceRecord

    const companyIdForInvoice = typedInvoice.company_id ?? typedInvoice.visits?.assigned_company_id ?? null

    const { data: company } = companyIdForInvoice
      ? await supabase
          .from("companies")
          .select("name, address, contact_person, phone, email, terms, invoice_footer_text")
          .eq("id", companyIdForInvoice)
          .maybeSingle()
      : { data: null as CompanyRecord }

    const { data: settings } = await supabase
      .from("hospital_settings")
      .select("hospital_name, billing_logo_url, address, phone, email")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    const typedCompany = company as CompanyRecord
    const typedSettings = settings as HospitalSettings
    const payerType = (typedInvoice.payer_type || "patient").toLowerCase()
    const coverageMap =
      payerType === "company" && companyIdForInvoice && typedInvoice.patient_id
        ? await fetchCompanyCoverageMap(supabase, companyIdForInvoice, [typedInvoice.patient_id])
        : new Map()

    const pdfDoc = await PDFDocument.create()
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const state = addPage(pdfDoc)
    let page = state.page
    let y = state.y

    const hospitalName = typedSettings?.hospital_name?.trim() || "Hospital"
    const createdAt = formatDateTime(typedInvoice.created_at)
    const patient = typedInvoice.visits?.patients ?? null
    const patientName = patient?.full_name?.trim() || "Unknown patient"
    const patientNumber = patient?.patient_number?.trim() || "Not assigned"
    const coverage = typedInvoice.patient_id ? coverageMap.get(typedInvoice.patient_id) : null
    const totalAmount = Number(typedInvoice.total ?? typedInvoice.total_amount ?? 0)
    const subtotal = Number(typedInvoice.subtotal ?? typedInvoice.total_amount ?? 0)
    const tax = Number(typedInvoice.tax ?? 0)
    const paidAmount = Number(typedInvoice.paid_amount ?? 0)
    const balance = Math.max(totalAmount - paidAmount, 0)
    const invoiceStatus = ((typedInvoice.status || typedInvoice.paid_status || "pending") as string).replace(/_/g, " ")
    const visitId = typedInvoice.visits?.id || typedInvoice.visit_id || ""
    const visitReference = visitId ? `VIS-${visitId.replace(/-/g, "").slice(-6).toUpperCase()}` : "Not linked"

    let logoHeight = 0
    if (typedSettings?.billing_logo_url) {
      try {
        const res = await fetch(typedSettings.billing_logo_url)
        if (res.ok) {
          const bytes = await res.arrayBuffer()
          let logoImage
          try {
            logoImage = await pdfDoc.embedPng(bytes)
          } catch {
            logoImage = await pdfDoc.embedJpg(bytes)
          }
          const targetWidth = 110
          const scale = targetWidth / logoImage.width
          logoHeight = logoImage.height * scale
          page.drawImage(logoImage, {
            x: PAGE_MARGIN,
            y: y - logoHeight,
            width: targetWidth,
            height: logoHeight,
          })
        }
      } catch (logoError) {
        console.error("[v0] Error embedding invoice logo", logoError)
      }
    }

    const headerTop = y
    const headerLeft = PAGE_MARGIN + (logoHeight > 0 ? 126 : 0)
    drawTextLine(page, hospitalName, headerLeft, headerTop - 8, boldFont, 14)
    let hospitalInfoY = headerTop - 26
    for (const line of [typedSettings?.address, typedSettings?.phone ? `Tel: ${typedSettings.phone}` : null, typedSettings?.email ? `Email: ${typedSettings.email}` : null].filter(Boolean) as string[]) {
      drawTextLine(page, line, headerLeft, hospitalInfoY, regularFont, FONT_SIZE_BODY, MUTED_TEXT)
      hospitalInfoY -= 13
    }

    drawTextLine(page, "INVOICE", 430, headerTop - 8, boldFont, FONT_SIZE_HEADING, BRAND_BLUE)
    drawTextLine(page, `Status: ${invoiceStatus}`, 430, headerTop - 30, boldFont, FONT_SIZE_BODY)
    drawTextLine(page, `Invoice #: ${typedInvoice.invoice_number || typedInvoice.id}`, 430, headerTop - 44, regularFont, FONT_SIZE_BODY)
    if (createdAt) {
      drawTextLine(page, createdAt, 430, headerTop - 58, regularFont, FONT_SIZE_BODY, MUTED_TEXT)
    }

    y = Math.min(headerTop - Math.max(logoHeight, 56) - 18, hospitalInfoY - 6)
    page.drawLine({
      start: { x: PAGE_MARGIN, y },
      end: { x: page.getSize().width - PAGE_MARGIN, y },
      color: BORDER_COLOR,
      thickness: 1,
    })
    y -= SECTION_GAP

    const boxWidth = (page.getSize().width - PAGE_MARGIN * 2 - 16) / 2
    const billToRows = payerType === "company"
      ? [
          { label: "Company", value: typedCompany?.name?.trim() || "Company-linked billing" },
          { label: "Contact", value: [typedCompany?.contact_person, typedCompany?.phone].filter(Boolean).join(" · ") || typedCompany?.email || "-" },
          { label: "Address", value: typedCompany?.address?.trim() || "-" },
          { label: "Email", value: typedCompany?.email?.trim() || "-" },
        ]
      : [
          { label: "Patient", value: patientName },
          { label: "Patient #", value: patientNumber },
          { label: "Payer", value: payerType === "patient" ? "Patient self-pay" : payerType || "Patient" },
          { label: "Company", value: typedCompany?.name?.trim() || "-" },
        ]

    const patientRows = [
      { label: "Name", value: patientName },
      { label: "Patient #", value: patientNumber },
      { label: "Coverage", value: patient?.insurance_type ? String(patient.insurance_type).replace(/^./, (c) => c.toUpperCase()) : "-" },
      {
        label: "Insurance ID",
        value: patient?.insurance_card_number?.trim() || "-",
      },
    ]

    const leftBottom = drawInfoBox(page, PAGE_MARGIN, y, boxWidth, payerType === "company" ? "Bill To" : "Billing Details", billToRows, {
      regular: regularFont,
      bold: boldFont,
    })
    const rightBottom = drawInfoBox(page, PAGE_MARGIN + boxWidth + 16, y, boxWidth, "Patient", patientRows, {
      regular: regularFont,
      bold: boldFont,
    })
    y = Math.min(leftBottom, rightBottom) - SECTION_GAP

    y = drawSectionTitle(page, "Visit Information", PAGE_MARGIN, y, boldFont)
    y = drawKeyValueLines(
      page,
      payerType === "company"
        ? [
            { label: "Visit Ref", value: visitReference },
            { label: "Covered Person", value: patientName },
            {
              label: "Relationship",
              value: coverage?.relationshipLabel || "-",
            },
            {
              label: "Principal Employee",
              value: coverage?.principalEmployeeName || "-",
            },
          ]
        : [
            { label: "Visit Ref", value: visitReference },
            { label: "Payer Type", value: payerType ? payerType.replace(/^./, (c) => c.toUpperCase()) : "Patient" },
            { label: "Diagnosis", value: typedInvoice.visits?.diagnosis?.trim() || "Not recorded" },
          ],
      PAGE_MARGIN,
      y,
      page.getSize().width - PAGE_MARGIN * 2,
      { regular: regularFont, bold: boldFont },
    )
    y -= 8

    const typedItems = (typedInvoice.line_items || []).filter((item) => item && (item.description || item.quantity || item.unit_price))
    const items = typedItems.length
      ? typedItems.map((item) => ({
          description: item.description?.trim() || "Item",
          quantity: Number(item.quantity ?? 0),
          unitPrice: Number(item.unit_price ?? 0),
        }))
      : totalAmount > 0
        ? [{ description: "Visit charges", quantity: 1, unitPrice: totalAmount }]
        : []

    const tableHeaderHeight = 24
    const rowHeight = 20
    const tableHeight = tableHeaderHeight + Math.max(items.length, 1) * rowHeight + 8
    ;({ page, y } = ensureSpace(pdfDoc, { page, y }, tableHeight + 80))

    const fullWidth = page.getSize().width - PAGE_MARGIN * 2
    const colX = {
      description: PAGE_MARGIN + 12,
      qty: PAGE_MARGIN + fullWidth - 180,
      unit: PAGE_MARGIN + fullWidth - 120,
      total: PAGE_MARGIN + fullWidth - 60,
    }

    drawSectionTitle(page, "Invoice Items", PAGE_MARGIN, y, boldFont)
    page.drawRectangle({
      x: PAGE_MARGIN,
      y: y - 24,
      width: fullWidth,
      height: 24,
      color: LIGHT_FILL,
      borderColor: BORDER_COLOR,
      borderWidth: 1,
    })
    drawTextLine(page, "Description", colX.description, y - 16, boldFont, FONT_SIZE_LABEL)
    drawTextLine(page, "Qty", colX.qty, y - 16, boldFont, FONT_SIZE_LABEL)
    drawTextLine(page, "Unit", colX.unit, y - 16, boldFont, FONT_SIZE_LABEL)
    drawTextLine(page, "Total", colX.total, y - 16, boldFont, FONT_SIZE_LABEL)
    y -= 24

    if (!items.length) {
      page.drawRectangle({
        x: PAGE_MARGIN,
        y: y - rowHeight,
        width: fullWidth,
        height: rowHeight,
        borderColor: BORDER_COLOR,
        borderWidth: 1,
      })
      drawTextLine(page, "No line items recorded", colX.description, y - 14, regularFont, FONT_SIZE_BODY, MUTED_TEXT)
      y -= rowHeight
    } else {
      for (const item of items) {
        page.drawRectangle({
          x: PAGE_MARGIN,
          y: y - rowHeight,
          width: fullWidth,
          height: rowHeight,
          borderColor: BORDER_COLOR,
          borderWidth: 1,
        })
        const lineTotal = item.quantity * item.unitPrice
        drawTextLine(page, item.description, colX.description, y - 14, regularFont, FONT_SIZE_BODY)
        drawTextLine(page, String(item.quantity), colX.qty, y - 14, regularFont, FONT_SIZE_BODY)
        drawTextLine(page, formatCurrency(item.unitPrice), colX.unit, y - 14, regularFont, FONT_SIZE_BODY)
        drawTextLine(page, formatCurrency(lineTotal), colX.total, y - 14, regularFont, FONT_SIZE_BODY)
        y -= rowHeight
      }
    }
    y -= SECTION_GAP

    const totalsWidth = 210
    const totalsX = page.getSize().width - PAGE_MARGIN - totalsWidth
    page.drawRectangle({
      x: totalsX,
      y: y - 76,
      width: totalsWidth,
      height: 76,
      borderColor: BORDER_COLOR,
      borderWidth: 1,
      color: LIGHT_FILL,
    })
    const totalsRows = [
      ["Subtotal", formatCurrency(subtotal)],
      ["Tax", formatCurrency(tax)],
      ["Amount paid", formatCurrency(paidAmount)],
      ["Balance", formatCurrency(balance)],
    ] as const
    let totalsY = y - 16
    for (const [label, value] of totalsRows) {
      drawTextLine(page, label, totalsX + 12, totalsY, label === "Balance" ? boldFont : regularFont, FONT_SIZE_BODY)
      drawTextLine(page, value, totalsX + 120, totalsY, label === "Balance" ? boldFont : regularFont, FONT_SIZE_BODY)
      totalsY -= 15
    }
    drawTextLine(page, "Invoice total", PAGE_MARGIN, y - 20, boldFont, 11)
    drawTextLine(page, formatCurrency(totalAmount), PAGE_MARGIN, y - 40, boldFont, 16, BRAND_BLUE)
    y -= 94

    if (typedInvoice.notes?.trim()) {
      ;({ page, y } = ensureSpace(pdfDoc, { page, y }, 90))
      y = drawSectionTitle(page, "Notes", PAGE_MARGIN, y, boldFont)
      y = drawWrappedBlock(page, typedInvoice.notes.trim(), PAGE_MARGIN, y, fullWidth, regularFont, FONT_SIZE_BODY)
      y -= SECTION_GAP
    }

    if (typedCompany?.terms?.trim()) {
      ;({ page, y } = ensureSpace(pdfDoc, { page, y }, 90))
      y = drawSectionTitle(page, "Billing Terms", PAGE_MARGIN, y, boldFont)
      y = drawWrappedBlock(page, typedCompany.terms.trim(), PAGE_MARGIN, y, fullWidth, regularFont, FONT_SIZE_SMALL, MUTED_TEXT)
      y -= SECTION_GAP
    }

    ;({ page, y } = ensureSpace(pdfDoc, { page, y }, 80))
    const signatureY = y - 10
    page.drawLine({ start: { x: PAGE_MARGIN + 10, y: signatureY }, end: { x: PAGE_MARGIN + 220, y: signatureY }, color: BORDER_COLOR, thickness: 1 })
    page.drawLine({ start: { x: PAGE_MARGIN + 300, y: signatureY }, end: { x: PAGE_MARGIN + 510, y: signatureY }, color: BORDER_COLOR, thickness: 1 })
    drawTextLine(page, "Prepared by / Cashier", PAGE_MARGIN + 10, signatureY - 14, regularFont, FONT_SIZE_SMALL, MUTED_TEXT)
    drawTextLine(page, payerType === "company" ? "Company representative" : "Patient / Representative", PAGE_MARGIN + 300, signatureY - 14, regularFont, FONT_SIZE_SMALL, MUTED_TEXT)

    const footerText = typedCompany?.invoice_footer_text?.trim() || `Generated on ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`
    drawTextLine(page, footerText, PAGE_MARGIN, 28, regularFont, 8, MUTED_TEXT)

    const pdfBytes = await pdfDoc.save()

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=invoice_${typedInvoice.invoice_number || id}.pdf`,
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export invoice PDF", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
