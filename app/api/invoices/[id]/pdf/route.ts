
import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"
import { PDFDocument, StandardFonts } from "pdf-lib"

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + "…" : value
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
      `id, invoice_number, subtotal, tax, total, total_amount, paid_amount, paid_status, status, created_at, line_items, visit_id, payer_type, company_id, created_by, notes,
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

  const companyIdForInvoice = (invoice as { company_id?: string | null }).company_id ?? invoice.visits?.assigned_company_id

  const { data: company } = companyIdForInvoice
    ? await supabase
        .from("companies")
        .select("name, address, contact_person, phone, email, terms, invoice_footer_text")
        .eq("id", companyIdForInvoice)
        .maybeSingle()
    : { data: null }

  const { data: settings } = await supabase
    .from("hospital_settings")
    .select("hospital_name, billing_logo_url, address, phone, email")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  const createdAt = invoice.created_at ? new Date(invoice.created_at).toLocaleString() : ""
  const hospitalName = settings?.hospital_name || "Hospital"
  const hospitalAddress = settings?.address || ""
  const hospitalPhone = settings?.phone || ""
  const hospitalEmail = settings?.email || ""
  const visit = invoice.visits as
    | {
        id?: string | null
        diagnosis?: string | null
        patients?: {
          full_name?: string | null
          patient_number?: string | null
          insurance_type?: string | null
          insurance_card_number?: string | null
          insurance_expiry_date?: string | null
          insurance_mobile?: string | null
        } | null
      }
    | null
    | undefined

  const patient = visit?.patients as
    | {
        full_name?: string | null
        patient_number?: string | null
        insurance_type?: string | null
        insurance_card_number?: string | null
        insurance_expiry_date?: string | null
        insurance_mobile?: string | null
      }
    | null
    | undefined

  const patientName = patient?.full_name || ""
  const patientNumber = patient?.patient_number || ""
  const patientInsuranceType = (patient?.insurance_type || "").toLowerCase()
  const patientInsuranceId = patient?.insurance_card_number || ""
  const patientInsuranceExpiry = patient?.insurance_expiry_date || ""
  const patientInsuranceMobile = patient?.insurance_mobile || ""

  const rawVisitId = (visit?.id as string | null) || ((invoice as { visit_id?: string | null }).visit_id || "")
  const visitDisplayId = rawVisitId
    ? (() => {
        const compact = rawVisitId.replace(/-/g, "")
        const suffix = compact.slice(-6).toUpperCase()
        return `VIS-${suffix}`
      })()
    : ""
  const visitDiagnosisRaw = (visit?.diagnosis as string | null) || ""

  let insuranceValidityLabel = ""
  if (patientInsuranceExpiry) {
    const expiryDate = new Date(patientInsuranceExpiry)
    const today = new Date()
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const expiryMidnight = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate())
    insuranceValidityLabel = expiryMidnight.getTime() >= todayMidnight.getTime() ? "Valid" : "Expired"
  }

  const lines: string[] = []

  const payerType = ((invoice as { payer_type?: string | null }).payer_type || "patient") as string

  const normalizedTotalAmount = Number((invoice as { total_amount?: number | null }).total_amount ?? 0)
  const normalizedPaidAmount = Number((invoice as { paid_amount?: number | null }).paid_amount ?? 0)
  const normalizedBalance = Math.max(normalizedTotalAmount - normalizedPaidAmount, 0)

  const paidStatusLabel =
    ((invoice as { status?: string | null }).status || null) ??
    ((invoice as { paid_status?: string | null }).paid_status || "")

  lines.push(hospitalName.toUpperCase())
  if (hospitalAddress) {
    lines.push(hospitalAddress)
  }
  if (hospitalPhone || hospitalEmail) {
    const contactParts = [hospitalPhone && `Tel: ${hospitalPhone}`, hospitalEmail && `Email: ${hospitalEmail}`].filter(
      Boolean,
    ) as string[]
    if (contactParts.length) {
      lines.push(contactParts.join("  ·  "))
    }
  }
  lines.push("INVOICE")
  lines.push("".padEnd(40, "-"))
  lines.push("")
  lines.push(`Invoice #: ${invoice.invoice_number || invoice.id}`)
  if (createdAt) lines.push(`Date: ${createdAt}`)
  lines.push(`Status: ${paidStatusLabel}`)
  lines.push(`Amount paid: Le ${normalizedPaidAmount}`)
  lines.push(`Balance: Le ${normalizedBalance}`)
  const companyFound = Boolean(company)
  lines.push(
    `Debug: payer_type=${payerType}, company_id=${companyIdForInvoice || ""}, company_found=${companyFound}`,
  )
  if (visitDisplayId || visitDiagnosisRaw) {
    lines.push("")
    lines.push("Visit details:")
    if (visitDisplayId) {
      lines.push(`  Visit ID: ${visitDisplayId}`)
    }
    if (payerType !== "company" && visitDiagnosisRaw) {
      lines.push(`  Diagnosis: ${truncate(visitDiagnosisRaw, 80)}`)
    }
  }
  lines.push("")

  if (payerType === "company") {
    lines.push("Bill To (Company):")
    if (company?.name) {
      lines.push(`  ${company.name}`)
    } else if (companyIdForInvoice) {
      lines.push(`  Company ID: ${companyIdForInvoice}`)
    }
    if (company?.address) lines.push(`  ${company.address}`)
    if (company?.contact_person || company?.phone) {
      const parts = [company?.contact_person, company?.phone].filter(Boolean)
      lines.push(`  Contact: ${parts.join(" · ")}`)
    }
    if (company?.email) lines.push(`  Email: ${company.email}`)
    lines.push("")
    if (patientName || patientNumber) {
      lines.push("Patient:")
      if (patientName) lines.push(`  ${patientName}`)
      if (patientNumber) lines.push(`  Patient #: ${patientNumber}`)
      lines.push("")
    }
    if (patientInsuranceType || patientInsuranceId || patientInsuranceExpiry || patientInsuranceMobile) {
      lines.push("Insurance:")
      if (patientInsuranceType) {
        const friendlyType =
          patientInsuranceType === "employee"
            ? "Employee"
            : patientInsuranceType === "dependent"
              ? "Dependent"
              : patientInsuranceType
        lines.push(`  Coverage type: ${friendlyType}`)
      }
      if (patientInsuranceId) {
        lines.push(`  Insurance ID: ${patientInsuranceId}`)
      }
      if (patientInsuranceExpiry) {
        const expiry = new Date(patientInsuranceExpiry)
        lines.push(`  Expiry: ${expiry.toLocaleDateString()}`)
      }
      if (patientInsuranceMobile) {
        lines.push(`  Mobile: ${patientInsuranceMobile}`)
      }
      if (insuranceValidityLabel) {
        lines.push(`  Status: ${insuranceValidityLabel}`)
      }
      lines.push("")
    }
    if (company?.terms) {
      lines.push("Terms:")
      lines.push(company.terms)
      lines.push("")
    }
    if (company?.invoice_footer_text) {
      lines.push("Invoice footer:")
      lines.push(company.invoice_footer_text)
      lines.push("")
    }
  } else if (payerType === "patient" && company) {
    lines.push("Bill To (Patient / Company):")
    lines.push(`  Patient: ${patientName}`)
    if (patientNumber) {
      lines.push(`  Patient #: ${patientNumber}`)
    }
    lines.push(`  Company: ${company.name}`)
    lines.push("")
  } else {
    lines.push("Bill To (Patient):")
    lines.push(`  ${patientName}`)
    if (patientNumber) {
      lines.push(`  Patient #: ${patientNumber}`)
    }
    if (company && company.name) {
      lines.push(`  Employer: ${company.name}`)
    }
    lines.push("")
    if (patientInsuranceType || patientInsuranceId || patientInsuranceExpiry || patientInsuranceMobile) {
      lines.push("Insurance (patient-held):")
      if (patientInsuranceType) {
        const friendlyType =
          patientInsuranceType === "employee"
            ? "Employee"
            : patientInsuranceType === "dependent"
              ? "Dependent"
              : patientInsuranceType
        lines.push(`  Coverage type: ${friendlyType}`)
      }
      if (patientInsuranceId) {
        lines.push(`  Insurance ID: ${patientInsuranceId}`)
      }
      if (patientInsuranceExpiry) {
        const expiry = new Date(patientInsuranceExpiry)
        lines.push(`  Expiry: ${expiry.toLocaleDateString()}`)
      }
      if (patientInsuranceMobile) {
        lines.push(`  Mobile: ${patientInsuranceMobile}`)
      }
      if (insuranceValidityLabel) {
        lines.push(`  Status: ${insuranceValidityLabel}`)
      }
      lines.push("")
    }
  }

  lines.push("Items:")
  lines.push("  Description                   Qty   Unit       Total")
  lines.push("  " + "-".repeat(50))

  interface LineItem {
    description?: string
    quantity?: number
    unit_price?: number
  }

  type InvoiceRowForTotals = {
    subtotal?: number | null
    tax?: number | null
    total?: number | null
    total_amount?: number | null
    line_items?: LineItem[] | null
  }

  const typedInvoice = invoice as InvoiceRowForTotals

  const legacySubtotal = Number(typedInvoice.subtotal ?? typedInvoice.total_amount ?? 0)
  const legacyTax = Number(typedInvoice.tax ?? 0)
  const legacyTotal = Number(typedInvoice.total ?? typedInvoice.total_amount ?? legacySubtotal + legacyTax)

  let items = ((typedInvoice.line_items as LineItem[] | null) || []).filter((item) =>
    Boolean(item && (item.description || item.quantity || item.unit_price)),
  )

  // For legacy invoices that have totals but no structured line_items, create a single summary line
  if (!items.length && legacyTotal > 0) {
    items = [
      {
        description: "Visit charges",
        quantity: 1,
        unit_price: legacyTotal,
      },
    ]
  }

  if (!items.length) {
    lines.push("  (No line items recorded)")
  } else {
    for (const item of items) {
      const desc = truncate(item.description || "Item", 27)
      const qty = item.quantity ?? 0
      const price = item.unit_price ?? 0
      const lineTotal = qty * price
      const descCol = desc.padEnd(27)
      const qtyCol = String(qty).padStart(3)
      const priceCol = String(price).padStart(8)
      const totalCol = String(lineTotal).padStart(9)
      lines.push(`  ${descCol} ${qtyCol}   ${priceCol} ${totalCol}`)
    }
  }

  lines.push("")
  lines.push(`Subtotal: Le ${legacySubtotal}`)
  lines.push(`Tax: Le ${legacyTax}`)
  lines.push(`Total: Le ${legacyTotal}`)
  lines.push("")

  const invoiceNotes = (invoice as { notes?: string | null }).notes || ""
  if (invoiceNotes) {
    lines.push("Notes:")
    for (const noteLine of invoiceNotes.split(/\r?\n/)) {
      lines.push(`  ${noteLine}`)
    }
    lines.push("")
  }

  lines.push("Signatures:")
  lines.push("")
  lines.push("  ____________________________           ____________________________")
  lines.push("  Cashier / Authorized by                Patient / Company representative")
  lines.push("")

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage()
  const font = await pdfDoc.embedFont(StandardFonts.Courier)

  const fontSize = 10
  const lineHeight = 12
  const { height } = page.getSize()
  const margin = 40
  let cursorY = height - margin

  // Draw hospital logo at the top of the first page if available
  if (settings?.billing_logo_url) {
    try {
      const res = await fetch(settings.billing_logo_url)
      if (res.ok) {
        const logoBytes = await res.arrayBuffer()
        let logoImage
        try {
          logoImage = await pdfDoc.embedPng(logoBytes)
        } catch {
          logoImage = await pdfDoc.embedJpg(logoBytes)
        }

        const targetWidth = 120
        const scale = targetWidth / logoImage.width
        const logoWidth = targetWidth
        const logoHeight = logoImage.height * scale

        page.drawImage(logoImage, {
          x: margin,
          y: cursorY - logoHeight,
          width: logoWidth,
          height: logoHeight,
        })

        cursorY -= logoHeight + 16
      }
    } catch (e) {
      console.error("[v0] Error embedding invoice logo", e)
    }
  }

  for (const line of lines) {
    if (cursorY < margin) {
      // add a new page if we run out of space
      const newPage = pdfDoc.addPage()
      cursorY = newPage.getSize().height - margin
      page.drawText("Continued...", {
        x: margin,
        y: margin / 2,
        size: 8,
        font,
      })
    }

    page.drawText(line, {
      x: margin,
      y: cursorY,
      size: fontSize,
      font,
    })
    cursorY -= lineHeight
  }

  const pdfBytes = await pdfDoc.save()

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=invoice_${invoice.invoice_number || id}.pdf`,
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
