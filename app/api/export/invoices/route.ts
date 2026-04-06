import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

const EXPORT_ROW_LIMIT = 5_000

interface InvoiceExportRow {
  invoice_number: string
  total_amount: number
  paid_amount: number | null
  status: string
  due_date: string | null
  created_at: string
  company_id: string | null
  patient?: {
    patient_number?: string | null
    first_name?: string | null
    last_name?: string | null
  } | null
}

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_export_invoices",
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "admin.export")
    const { searchParams } = new URL(request.url)
    const query = (searchParams.get("q") || "").trim().toLowerCase()
    const statusFilter = (searchParams.get("status") || "").trim().toLowerCase()
    const companyFilterId = (searchParams.get("company_id") || "").trim()

    const { data: fetchedInvoices, error } = await supabase
      .from("invoices")
      .select(`
        invoice_number,
        total_amount,
        paid_amount,
        status,
        due_date,
        created_at,
        company_id,
        patient:patients(patient_number, first_name, last_name)
      `)
      .order("created_at", { ascending: false })
      .limit(EXPORT_ROW_LIMIT + 1)

    if (error) {
      return new NextResponse("Error fetching data", { status: 500 })
    }

    const filteredRows = ((fetchedInvoices || []) as InvoiceExportRow[]).filter((invoice) => {
      if (statusFilter && statusFilter !== "all" && (invoice.status || "").toLowerCase() !== statusFilter) {
        return false
      }
      if (companyFilterId && (invoice.company_id || "") !== companyFilterId) {
        return false
      }
      if (!query) return true

      const haystack = [
        invoice.invoice_number,
        invoice.status,
        invoice.patient?.patient_number,
        invoice.patient?.first_name,
        invoice.patient?.last_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(query)
    })

    const isTruncated = filteredRows.length > EXPORT_ROW_LIMIT
    const invoices = filteredRows.slice(0, EXPORT_ROW_LIMIT)

    const headers = [
      "Invoice Number",
      "Patient Number",
      "Patient Name",
      "Total Amount",
      "Amount Paid",
      "Balance",
      "Status",
      "Due Date",
      "Payment Methods",
      "Created At",
    ]

    const csvRows = [headers.join(",")]

    for (const invoice of invoices) {
      const paymentMethods = ""

      const row = [
        invoice.invoice_number,
        invoice.patient?.patient_number || "",
        `${invoice.patient?.first_name || ""} ${invoice.patient?.last_name || ""}`,
        invoice.total_amount,
        invoice.paid_amount,
        Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0),
        invoice.status,
        invoice.due_date || "",
        `"${paymentMethods}"`,
        new Date(invoice.created_at).toISOString(),
      ]
      csvRows.push(row.join(","))
    }

    const csv = csvRows.join("\n")

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=invoices_export_${new Date().toISOString()}.csv`,
        "X-Export-Truncated": String(isTruncated),
        "X-Export-Row-Limit": String(EXPORT_ROW_LIMIT),
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export invoices", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
