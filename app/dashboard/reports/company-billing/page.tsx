import { redirect } from "next/navigation"
import Link from "next/link"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface CompanyBillingReportsPageProps {
  searchParams: Promise<{ company_id?: string; from?: string; to?: string; status?: string; page?: string }>
}

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
interface CompanyLite {
  id: string
  name: string | null
}
interface PatientLite {
  id: string
  full_name: string | null
  patient_number: string | null
}
interface PrescriptionLite {
  id: string
  visit_id: string | null
  doctor_id: string | null
}
interface DoctorProfileLite {
  id: string
  full_name: string | null
}

const MAX_COMPANY_BILLING_ROWS = 2000
const COMPANY_BILLING_PAGE_SIZE = 100

export default async function CompanyBillingReportsPage({ searchParams }: CompanyBillingReportsPageProps) {
  const supabase = await createServerClient()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }

  if (!can(rbacUser, "reports.view") && !can(rbacUser, "admin.export") && !can(rbacUser, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const sp = await searchParams
  const selectedCompanyId = (sp.company_id || "").trim() || null
  const statusFilter = (sp.status || "all").toLowerCase().trim()
  const fromParam = (sp.from || "").trim()
  const toParam = (sp.to || "").trim()
  const currentPage = Math.max(1, Number.parseInt((sp.page || "1").trim(), 10) || 1)
  const hasActiveFilters = Boolean(selectedCompanyId) || statusFilter !== "all" || Boolean(fromParam) || Boolean(toParam)

  const today = new Date()
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const fromDate = fromParam ? new Date(fromParam) : startOfMonth
  const toDate = toParam ? new Date(toParam) : endOfMonth

  const fromIso = fromDate.toISOString()
  const toIso = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999).toISOString()

  const [{ data: companies }, { data: invoices }] = await Promise.all([
    supabase.from("companies").select("id, name").order("name"),
    supabase
      .from("invoices")
      .select(
        `id, invoice_number, total_amount, paid_amount, status, created_at, payment_date, payer_type, company_id, patient_id, visit_id,
         companies(name)`
      )
      .eq("payer_type", "company")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .limit(MAX_COMPANY_BILLING_ROWS),
  ])

  let filteredInvoices = ((invoices || []) as unknown) as InvoiceRow[]
  const invoicesTruncated = (invoices || []).length >= MAX_COMPANY_BILLING_ROWS

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
      : Promise.resolve({ data: [] as PatientLite[] }),
    visitIds.length
      ? supabase.from("prescriptions").select("id, visit_id, doctor_id").in("visit_id", visitIds)
      : Promise.resolve({ data: [] as PrescriptionLite[] }),
  ])

  const doctorIds = Array.from(
    new Set(
      ((prescriptions || []) as PrescriptionLite[])
        .map((rx) => rx.doctor_id || null)
        .filter((id): id is string => Boolean(id)),
    ),
  )
  const { data: doctorProfiles } = doctorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", doctorIds)
    : { data: [] as DoctorProfileLite[] }

  const patientById = new Map<string, { full_name?: string | null; patient_number?: string | null }>()
  for (const p of (patients || []) as PatientLite[]) {
    patientById.set(p.id, {
      full_name: p.full_name ?? null,
      patient_number: p.patient_number ?? null,
    })
  }

  const doctorIdByVisitId = new Map<string, string>()
  for (const rx of (prescriptions || []) as PrescriptionLite[]) {
    const vId = rx.visit_id ?? null
    const dId = rx.doctor_id ?? null
    if (!vId || !dId) continue
    if (!doctorIdByVisitId.has(vId)) {
      doctorIdByVisitId.set(vId, dId)
    }
  }

  const doctorNameById = new Map<string, string | null>()
  for (const doc of (doctorProfiles || []) as DoctorProfileLite[]) {
    doctorNameById.set(doc.id, doc.full_name ?? null)
  }

  const rows = filteredInvoices.map((inv) => {
    const patient = inv.patient_id ? patientById.get(inv.patient_id) : null
    const visitDoctorId = inv.visit_id ? doctorIdByVisitId.get(inv.visit_id) : null
    const doctorName = visitDoctorId ? doctorNameById.get(visitDoctorId) : null

    const total = Number(inv.total_amount ?? 0)
    const paid = Number(inv.paid_amount ?? 0)
    const balance = Math.max(total - paid, 0)

    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number || "",
      companyName: inv.companies?.name || "Unknown company",
      staffName: patient?.full_name || "Unknown",
      staffNumber: patient?.patient_number || "-",
      doctorName: doctorName || "Unknown",
      visitId: inv.visit_id,
      createdAt: inv.created_at,
      total,
      paid,
      balance,
      status: inv.status || "",
    }
  })

  const totalAmount = rows.reduce((sum, r) => sum + r.total, 0)
  const totalPaid = rows.reduce((sum, r) => sum + r.paid, 0)
  const totalBalance = rows.reduce((sum, r) => sum + r.balance, 0)
  const totalRows = rows.length
  const pageStart = (currentPage - 1) * COMPANY_BILLING_PAGE_SIZE
  const pageEnd = pageStart + COMPANY_BILLING_PAGE_SIZE
  const pageRows = rows.slice(pageStart, pageEnd)
  const hasNextPage = pageEnd < totalRows

  const buildReportQuery = (page: number) => {
    const params = new URLSearchParams()
    if (selectedCompanyId) params.set("company_id", selectedCompanyId)
    if (fromParam) params.set("from", fromParam)
    if (toParam) params.set("to", toParam)
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter)
    if (page > 1) params.set("page", String(page))
    const query = params.toString()
    return query ? `?${query}` : ""
  }

  const formatDate = (value: string | null) => {
    if (!value) return ""
    try {
      return new Date(value).toLocaleDateString()
    } catch {
      return value
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Company billing by staff & doctor</h1>
          <p className="text-sm text-muted-foreground">
            View company-paid invoices grouped per visit, including both the staff member (patient) and prescribing doctor.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/reports">Back to Reports</Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
          >
            <Link
              href={`/dashboard/reports/company-billing/export?${new URLSearchParams({
                ...(selectedCompanyId ? { company_id: selectedCompanyId } : {}),
                ...(fromParam ? { from: fromParam } : {}),
                ...(toParam ? { to: toParam } : {}),
                ...(statusFilter ? { status: statusFilter } : {}),
              }).toString()}`}
              target="_blank"
              rel="noreferrer"
            >
              Export CSV
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 text-sm">
        <div className="space-y-1">
          <label htmlFor="company_id" className="text-xs font-medium text-muted-foreground">
            Company
          </label>
          <select
            id="company_id"
            name="company_id"
            defaultValue={selectedCompanyId || ""}
            className="h-9 min-w-[200px] rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">All companies</option>
            {((companies || []) as CompanyLite[]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
            From (date)
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={fromParam || startOfMonth.toISOString().split("T")[0]}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="to" className="text-xs font-medium text-muted-foreground">
            To (date)
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={toParam || endOfMonth.toISOString().split("T")[0]}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="status" className="text-xs font-medium text-muted-foreground">
            Invoice status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter || "all"}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {hasActiveFilters ? (
            <Button asChild type="button" size="sm" variant="outline">
              <Link href="/dashboard/reports/company-billing">Reset</Link>
            </Button>
          ) : null}
          <Button type="submit" size="sm">
            Apply filters
          </Button>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total billed</CardTitle>
            <CardDescription>Sum of {totalRows} matching invoice(s) in this period.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">Le {totalAmount.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total paid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">Le {totalPaid.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Outstanding balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">Le {totalBalance.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {invoicesTruncated ? (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Showing the first {MAX_COMPANY_BILLING_ROWS.toLocaleString()} invoices for performance. Narrow filters to refine results.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Company invoices by visit</CardTitle>
          <CardDescription>One line per visit, showing both staff member and doctor.</CardDescription>
        </CardHeader>
        <CardContent>
          {totalRows === 0 ? (
            <p className="text-sm text-muted-foreground">
              No company invoices match the selected filters.
              {hasActiveFilters ? (
                <>
                  {" "}
                  <Link href="/dashboard/reports/company-billing" className="text-blue-600 hover:underline">
                    Clear filters
                  </Link>
                  .
                </>
              ) : null}
            </p>
          ) : (
            <div className="overflow-x-auto text-sm">
              <table className="min-w-full border divide-y divide-border text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Company</th>
                    <th className="px-3 py-2 text-left font-medium">Staff (patient)</th>
                    <th className="px-3 py-2 text-left font-medium">Staff #</th>
                    <th className="px-3 py-2 text-left font-medium">Doctor</th>
                    <th className="px-3 py-2 text-left font-medium">Visit ID</th>
                    <th className="px-3 py-2 text-left font-medium">Invoice #</th>
                    <th className="px-3 py-2 text-right font-medium">Total (Le)</th>
                    <th className="px-3 py-2 text-right font-medium">Paid (Le)</th>
                    <th className="px-3 py-2 text-right font-medium">Balance (Le)</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.companyName}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.staffName}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.staffNumber}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.doctorName || "Unknown"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.visitId || "-"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.invoiceNumber}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{row.total.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{row.paid.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{row.balance.toLocaleString()}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalRows > 0 ? (
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Page {currentPage} · Showing {pageRows.length} of {totalRows} invoice{totalRows === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/reports/company-billing${buildReportQuery(currentPage - 1)}`}>Previous</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled>
                    Previous
                  </Button>
                )}
                {hasNextPage ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/reports/company-billing${buildReportQuery(currentPage + 1)}`}>Next</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled>
                    Next
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
