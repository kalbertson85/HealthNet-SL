import { NextResponse, type NextRequest } from "next/server"
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"
import { fetchInsuranceBatchDetails } from "@/lib/billing/insurance-batches"

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

function formatCurrency(value: number) {
  return `Le ${new Intl.NumberFormat("en-SL", { maximumFractionDigits: 0 }).format(value)}`
}

function formatDate(value: string | null) {
  if (!value) return "-"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "insurance_batch_pdf",
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "billing.manage")
    const { id } = await params

    const batchDetails = await fetchInsuranceBatchDetails(supabase, id)
    if (!batchDetails) {
      return new NextResponse("Insurance batch not found", { status: 404 })
    }

    const { batch, groupedPatients } = batchDetails
    const { data: settings } = await supabase
      .from("hospital_settings")
      .select("hospital_name, address, phone, email")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    const pdfDoc = await PDFDocument.create()
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    let state = addPage(pdfDoc)
    let { page, y } = state
    const pageWidth = page.getSize().width
    const contentWidth = pageWidth - PAGE_MARGIN * 2

    drawText(page, (settings?.hospital_name || "Hospital").trim(), PAGE_MARGIN, y, 15, bold)
    y -= 18
    for (const line of [settings?.address, settings?.phone ? `Tel: ${settings.phone}` : null, settings?.email ? `Email: ${settings.email}` : null].filter(Boolean) as string[]) {
      drawText(page, line, PAGE_MARGIN, y, 9, regular, MUTED)
      y -= 12
    }

    drawText(page, "INSURANCE INVOICE", pageWidth - 205, state.y, 21, bold, BRAND)
    drawText(page, `Batch #: ${batch.batch_number || batch.id}`, pageWidth - 205, state.y - 24, 10, regular)
    drawText(page, `Status: ${batch.status}`, pageWidth - 205, state.y - 38, 10, bold)
    drawText(page, `Period: ${formatDate(batch.from_date)} to ${formatDate(batch.to_date)}`, pageWidth - 205, state.y - 52, 9, regular, MUTED)

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
        title: "Bill To",
        rows: [
          { label: "Provider", value: batch.companyName || "Insurance provider" },
          { label: "Contact", value: [batch.companyContactPerson, batch.companyPhone].filter(Boolean).join(" · ") || batch.companyEmail || "-" },
          { label: "Address", value: batch.companyAddress || "-" },
          { label: "Email", value: batch.companyEmail || "-" },
        ],
      },
      {
        title: "Batch Summary",
        rows: [
          { label: "Beneficiaries", value: String(groupedPatients.length) },
          { label: "Grand total", value: formatCurrency(batch.total_amount) },
          { label: "Amount paid", value: formatCurrency(batch.paid_amount) },
          { label: "Balance", value: formatCurrency(Math.max(batch.total_amount - batch.paid_amount, 0)) },
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
      { label: "Date", x: PAGE_MARGIN + 8 },
      { label: "Visit", x: PAGE_MARGIN + 72 },
      { label: "Service", x: PAGE_MARGIN + 132 },
      { label: "Qty", x: PAGE_MARGIN + 385 },
      { label: "Unit", x: PAGE_MARGIN + 422 },
      { label: "Total", x: PAGE_MARGIN + 490 },
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
      drawText(page, formatCurrency(group.total), pageWidth - 118, y - 16, 10, bold)
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
          drawText(page, formatDate(invoice.createdAt), columns[0].x, y - 11, 8, regular)
          drawText(page, invoice.visitReference, columns[1].x, y - 11, 8, regular)
          drawText(page, item.description.slice(0, 44), columns[2].x, y - 11, 8, regular)
          drawText(page, String(item.quantity), columns[3].x, y - 11, 8, regular)
          drawText(page, formatCurrency(item.unit_price), columns[4].x, y - 11, 8, regular)
          drawText(page, formatCurrency(item.amount), columns[5].x, y - 11, 8, regular)
          y -= 18
        }
      }

      drawText(page, `Beneficiary subtotal: ${formatCurrency(group.total)}`, PAGE_MARGIN + 8, y - 2, 9, bold, MUTED)
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
    drawText(page, `Grand total  ${formatCurrency(batch.total_amount)}`, pageWidth - 208, y - 16, 10, bold)
    drawText(page, `Paid  ${formatCurrency(batch.paid_amount)}`, pageWidth - 208, y - 31, 9, regular)
    drawText(page, `Balance  ${formatCurrency(Math.max(batch.total_amount - batch.paid_amount, 0))}`, pageWidth - 208, y - 45, 9, regular)

    drawText(
      page,
      `Generated ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`,
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
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    throw error
  }
}
