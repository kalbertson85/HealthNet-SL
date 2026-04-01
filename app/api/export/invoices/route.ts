import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

const EXPORT_ROW_LIMIT = 5_000

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_export_invoices",
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "admin.export")

    const { data: fetchedInvoices, error } = await supabase
      .from("invoices")
      .select(`
        invoice_number,
        total_amount,
        amount_paid,
        status,
        due_date,
        created_at,
        patient:patients(patient_number, first_name, last_name)
      `)
      .order("created_at", { ascending: false })
      .limit(EXPORT_ROW_LIMIT + 1)

    if (error) {
      return new NextResponse("Error fetching data", { status: 500 })
    }

    const isTruncated = (fetchedInvoices || []).length > EXPORT_ROW_LIMIT
    const invoices = (fetchedInvoices || []).slice(0, EXPORT_ROW_LIMIT)

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
        invoice.amount_paid,
        invoice.total_amount - invoice.amount_paid,
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
