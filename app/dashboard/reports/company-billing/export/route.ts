import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "report_export_company_billing",
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "admin.export")

  const { searchParams } = new URL(request.url)
  const selectedCompanyId = (searchParams.get("company_id") || "").trim() || null
  const statusFilter = (searchParams.get("status") || "all").toLowerCase().trim()
  const fromParam = (searchParams.get("from") || "").trim()
  const toParam = (searchParams.get("to") || "").trim()

  const today = new Date()
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const fromDate = fromParam ? new Date(fromParam) : startOfMonth
  const toDate = toParam ? new Date(toParam) : endOfMonth

  const fromIso = fromDate.toISOString()
  const toIso = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999).toISOString()

  const [{ data: invoices }, { data: companies }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        `id, invoice_number, total_amount, paid_amount, status, created_at, payment_date, payer_type, company_id, patient_id, visit_id,
         companies(name)`
      )
      .eq("payer_type", "company")
      .gte("created_at", fromIso)
      .lte("created_at", toIso),
    supabase.from("companies").select("id, name"),
  ])

  interface InvoiceRow {
    id: string
    invoice_number: string | null
    total_amount: number | null
    paid_amount: number | null
    status: string | null
    created_at: string | null
    payment_date: string | null
    payer_type: string | null
    company_id: string | null
    patient_id: string | null
    visit_id: string | null
    companies?: { name?: string | null } | null
  }

  let filteredInvoices = ((invoices || []) as unknown) as InvoiceRow[]

  if (selectedCompanyId) {
    filteredInvoices = filteredInvoices.filter((inv) => (inv.company_id as string | null) === selectedCompanyId)
  }

  if (statusFilter !== "all") {
    filteredInvoices = filteredInvoices.filter((inv) => (inv.status || "").toLowerCase() === statusFilter)
  }

  const patientIds = Array.from(
    new Set(filteredInvoices.map((inv) => inv.patient_id).filter((id): id is string => Boolean(id)))
  )
  const visitIds = Array.from(new Set(filteredInvoices.map((inv) => inv.visit_id).filter((id): id is string => Boolean(id))))

  const [{ data: patients }, { data: prescriptions }] = await Promise.all([
    patientIds.length
      ? supabase.from("patients").select("id, full_name, patient_number").in("id", patientIds)
      : Promise.resolve({ data: [] as any[] }),
    visitIds.length
      ? supabase.from("prescriptions").select("id, visit_id, doctor_id").in("visit_id", visitIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const doctorIds = Array.from(
    new Set(
      ((prescriptions || []) as any[])
        .map((rx) => (rx.doctor_id as string | null) || null)
        .filter((id): id is string => Boolean(id)),
    ),
  )

  const { data: doctorProfiles } = doctorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", doctorIds)
    : { data: [] as any[] }

  const patientById = new Map<string, { full_name?: string | null; patient_number?: string | null }>()
  for (const p of (patients || []) as any[]) {
    patientById.set(p.id as string, {
      full_name: (p.full_name as string | null) ?? null,
      patient_number: (p.patient_number as string | null) ?? null,
    })
  }

  const doctorIdByVisitId = new Map<string, string>()
  for (const rx of (prescriptions || []) as any[]) {
    const vId = (rx.visit_id as string | null) ?? null
    const dId = (rx.doctor_id as string | null) ?? null
    if (!vId || !dId) continue
    if (!doctorIdByVisitId.has(vId)) {
      doctorIdByVisitId.set(vId, dId)
    }
  }

  const doctorNameById = new Map<string, string | null>()
  for (const doc of (doctorProfiles || []) as any[]) {
    doctorNameById.set(doc.id as string, (doc.full_name as string | null) ?? null)
  }

  const companyNameById = new Map<string, string | null>()
  for (const c of (companies || []) as any[]) {
    companyNameById.set(c.id as string, (c.name as string | null) ?? null)
  }

  const headers = [
    "Date",
    "Company",
    "StaffName",
    "StaffNumber",
    "DoctorName",
    "VisitId",
    "InvoiceNumber",
    "TotalAmount",
    "PaidAmount",
    "Balance",
    "Status",
  ]

  const lines: string[] = []
  lines.push(headers.join(","))

  const formatDate = (value: string | null) => {
    if (!value) return ""
    try {
      return new Date(value).toISOString().split("T")[0]
    } catch {
      return value
    }
  }

  for (const inv of filteredInvoices) {
    const patient = inv.patient_id ? patientById.get(inv.patient_id) : null
    const visitDoctorId = inv.visit_id ? doctorIdByVisitId.get(inv.visit_id) : null
    const doctorName = visitDoctorId ? doctorNameById.get(visitDoctorId) : null
    const companyName = inv.company_id ? companyNameById.get(inv.company_id) : inv.companies?.name || null

    const total = Number(inv.total_amount ?? 0)
    const paid = Number(inv.paid_amount ?? 0)
    const balance = Math.max(total - paid, 0)

    const row = [
      formatDate(inv.created_at),
      JSON.stringify(companyName ?? ""),
      JSON.stringify(patient?.full_name ?? ""),
      JSON.stringify(patient?.patient_number ?? ""),
      JSON.stringify(doctorName ?? ""),
      inv.visit_id ?? "",
      inv.invoice_number ?? "",
      String(total),
      String(paid),
      String(balance),
      inv.status ?? "",
    ]

    lines.push(row.join(","))
  }

  const csv = lines.join("\n")

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=company_billing_${new Date().toISOString()}.csv`,
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export company billing report", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
