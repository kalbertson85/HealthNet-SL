import Link from "next/link"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { StatCard } from "@/components/stat-card"
import { TableCard } from "@/components/table-card"
import { Button } from "@/components/ui/button"
import { CalendarRange, FileText, Users, Activity } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { startPageRenderTimer } from "@/lib/observability/page-performance"
import { Skeleton } from "@/components/ui/skeleton"

const MAX_MONTHLY_INVOICE_ROWS = 3000
const MAX_FHC_ANALYTICS_ROWS = 3000

interface InvoiceRow {
  total_amount?: number | null
  paid_amount?: number | null
  payment_date?: string | null
  created_at?: string | null
  payer_type?: string | null
  company_id?: string | null
  companies?: {
    name?: string | null
  } | null
}

type FhcVisitsRef = {
  is_free_health_care?: boolean | null
  facility_id?: string | null
  facilities?: { name?: string | null; code?: string | null } | null
} | null

function FhcSectionFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

function upsertCarePath(
  map: Map<string, { name: string; code: string | null; admissions: number; surgeries: number; nursingNotes: number }>,
  visits: FhcVisitsRef,
  field: "admissions" | "surgeries" | "nursingNotes",
) {
  if (!visits?.is_free_health_care) return
  const facilityId = visits.facility_id ?? "(none)"
  const facilityName = visits.facilities?.name ?? "Unknown facility"
  const facilityCode = visits.facilities?.code ?? null
  const existing = map.get(facilityId) || { name: facilityName, code: facilityCode, admissions: 0, surgeries: 0, nursingNotes: 0 }
  existing[field] += 1
  map.set(facilityId, existing)
}

async function FhcAnalyticsSection({ fromParam, toParam }: { fromParam: string; toParam: string }) {
  const sectionPerf = startPageRenderTimer("dashboard.reports.fhc", { slowThresholdMs: 1200 })
  const supabase = await createServerClient()
  const startOfMonthIso = `${fromParam}T00:00:00.000Z`

  try {
    const [{ data: fhcItems }, { data: fhcRadiology }, { data: fhcLab }, { data: fhcAdmissions }, { data: fhcSurgeries }, { data: fhcNursingNotes }] =
      await Promise.all([
        supabase
          .from("invoice_items")
          .select(
            `quantity, unit_price, item_type,
             invoices(created_at, visit_id,
               visits(is_free_health_care, facility_id,
                 facilities(name, code)
               )
             )`,
          )
          .gte("invoices.created_at", startOfMonthIso)
          .limit(MAX_FHC_ANALYTICS_ROWS),
        supabase
          .from("radiology_requests")
          .select(
            `id, status,
             visits(is_free_health_care, facility_id,
               facilities(name)
             )`,
          )
          .gte("created_at", startOfMonthIso)
          .order("created_at", { ascending: false })
          .limit(MAX_FHC_ANALYTICS_ROWS),
        supabase
          .from("lab_tests")
          .select(
            `id, status,
             visits(is_free_health_care, facility_id,
               facilities(name)
             )`,
          )
          .gte("created_at", startOfMonthIso)
          .order("created_at", { ascending: false })
          .limit(MAX_FHC_ANALYTICS_ROWS),
        supabase
          .from("admissions")
          .select(
            `id, admission_date, status,
             visits(is_free_health_care, facility_id,
               facilities(name, code)
             )`,
          )
          .gte("admission_date", startOfMonthIso)
          .order("admission_date", { ascending: false })
          .limit(MAX_FHC_ANALYTICS_ROWS),
        supabase
          .from("surgeries")
          .select(
            `id, status,
             visits(is_free_health_care, facility_id,
               facilities(name, code)
             )`,
          )
          .gte("scheduled_at", startOfMonthIso)
          .order("scheduled_at", { ascending: false })
          .limit(MAX_FHC_ANALYTICS_ROWS),
        supabase
          .from("visit_nursing_notes")
          .select(
            `id, visit_id,
             visits(is_free_health_care, facility_id,
               facilities(name, code)
             )`,
          )
          .gte("performed_at", startOfMonthIso)
          .order("performed_at", { ascending: false })
          .limit(MAX_FHC_ANALYTICS_ROWS),
      ])

    let fhcEconomicCost = 0
    const fhcCostByFacility = new Map<string, { name: string; code: string | null; amount: number }>()
    for (const row of fhcItems || []) {
      const inv = (row.invoices || null) as { visits?: FhcVisitsRef } | null
      const visits = inv?.visits || null
      if (!visits?.is_free_health_care) continue
      if ((row.item_type || "billable") !== "fhc_covered") continue
      const amount = Number(row.quantity ?? 0) * Number(row.unit_price ?? 0)
      if (!Number.isFinite(amount)) continue
      fhcEconomicCost += amount
      const facilityId = visits.facility_id ?? "(none)"
      const facilityName = visits.facilities?.name ?? "Unknown facility"
      const facilityCode = visits.facilities?.code ?? null
      const existing = fhcCostByFacility.get(facilityId) || { name: facilityName, code: facilityCode, amount: 0 }
      existing.amount += amount
      fhcCostByFacility.set(facilityId, existing)
    }

    const fhcCarePathByFacility = new Map<string, { name: string; code: string | null; admissions: number; surgeries: number; nursingNotes: number }>()
    for (const row of fhcAdmissions || []) upsertCarePath(fhcCarePathByFacility, (row.visits || null) as FhcVisitsRef, "admissions")
    for (const row of fhcSurgeries || []) upsertCarePath(fhcCarePathByFacility, (row.visits || null) as FhcVisitsRef, "surgeries")
    for (const row of fhcNursingNotes || []) upsertCarePath(fhcCarePathByFacility, (row.visits || null) as FhcVisitsRef, "nursingNotes")

    const fhcSurgeriesByFacility = new Map<string, { name: string; code: string | null; count: number; completedCount: number }>()
    for (const row of fhcSurgeries || []) {
      const visits = (row.visits || null) as FhcVisitsRef
      if (!visits?.is_free_health_care) continue
      const facilityId = visits.facility_id ?? "(none)"
      const facilityName = visits.facilities?.name ?? "Unknown facility"
      const facilityCode = visits.facilities?.code ?? null
      const existing = fhcSurgeriesByFacility.get(facilityId) || { name: facilityName, code: facilityCode, count: 0, completedCount: 0 }
      existing.count += 1
      if ((row.status || "").toLowerCase() === "completed") existing.completedCount += 1
      fhcSurgeriesByFacility.set(facilityId, existing)
    }

    const fhcRadiologyByFacility = new Map<string, { name: string; count: number }>()
    for (const row of fhcRadiology || []) {
      const visits = (row.visits || null) as { is_free_health_care?: boolean | null; facility_id?: string | null; facilities?: { name?: string | null } | null } | null
      if (!visits?.is_free_health_care) continue
      const facilityId = visits.facility_id ?? "(none)"
      const facilityName = visits.facilities?.name ?? "Unknown facility"
      const existing = fhcRadiologyByFacility.get(facilityId) || { name: facilityName, count: 0 }
      existing.count += 1
      fhcRadiologyByFacility.set(facilityId, existing)
    }

    const fhcLabByFacility = new Map<string, { name: string; count: number }>()
    for (const row of fhcLab || []) {
      const visits = (row.visits || null) as { is_free_health_care?: boolean | null; facility_id?: string | null; facilities?: { name?: string | null } | null } | null
      if (!visits?.is_free_health_care) continue
      const facilityId = visits.facility_id ?? "(none)"
      const facilityName = visits.facilities?.name ?? "Unknown facility"
      const existing = fhcLabByFacility.get(facilityId) || { name: facilityName, count: 0 }
      existing.count += 1
      fhcLabByFacility.set(facilityId, existing)
    }

    const fhcAdmissionsByFacility = new Map<string, { name: string; code: string | null; count: number; admittedCount: number; dischargedCount: number }>()
    for (const row of fhcAdmissions || []) {
      const visits = (row.visits || null) as FhcVisitsRef
      if (!visits?.is_free_health_care) continue
      const facilityId = visits.facility_id ?? "(none)"
      const facilityName = visits.facilities?.name ?? "Unknown facility"
      const facilityCode = visits.facilities?.code ?? null
      const existing =
        fhcAdmissionsByFacility.get(facilityId) || { name: facilityName, code: facilityCode, count: 0, admittedCount: 0, dischargedCount: 0 }
      existing.count += 1
      const status = (row.status || "").toLowerCase()
      if (status === "admitted") existing.admittedCount += 1
      if (status === "discharged") existing.dischargedCount += 1
      fhcAdmissionsByFacility.set(facilityId, existing)
    }

    const monthlyDataTruncated =
      (fhcItems?.length || 0) >= MAX_FHC_ANALYTICS_ROWS ||
      (fhcRadiology?.length || 0) >= MAX_FHC_ANALYTICS_ROWS ||
      (fhcLab?.length || 0) >= MAX_FHC_ANALYTICS_ROWS ||
      (fhcAdmissions?.length || 0) >= MAX_FHC_ANALYTICS_ROWS ||
      (fhcSurgeries?.length || 0) >= MAX_FHC_ANALYTICS_ROWS ||
      (fhcNursingNotes?.length || 0) >= MAX_FHC_ANALYTICS_ROWS

    sectionPerf.done({
      query_count: 6,
      fhc_rows:
        (fhcItems?.length || 0) +
        (fhcRadiology?.length || 0) +
        (fhcLab?.length || 0) +
        (fhcAdmissions?.length || 0) +
        (fhcSurgeries?.length || 0) +
        (fhcNursingNotes?.length || 0),
      monthly_data_truncated: monthlyDataTruncated,
    })

    return (
      <div className="space-y-8">
        {monthlyDataTruncated ? (
          <div className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Some monthly analytics were capped for performance. Use narrower date filters in detailed report pages for full coverage.
          </div>
        ) : null}

        <StatCard
          title="FHC economic cost (month)"
          value={`Le ${fhcEconomicCost.toLocaleString()}`}
          description="Economic value of FHC-covered items this month"
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
        />

        <TableCard title="FHC economic cost by facility (month)" description="Economic value of FHC-covered items this month by facility.">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Facility</th>
                <th className="py-2 font-medium text-right">FHC economic cost (Le)</th>
              </tr>
            </thead>
            <tbody>
              {fhcCostByFacility.size === 0 ? (
                <tr>
                  <td colSpan={2} className="py-4 text-center text-xs text-muted-foreground">No FHC-covered items recorded this month.</td>
                </tr>
              ) : (
                Array.from(fhcCostByFacility.entries()).map(([id, entry]) => (
                  <tr key={id} className="border-b last:border-0">
                    <td className="py-2 text-sm">
                      {entry.code ? (
                        <Link href={`/dashboard/reports/free-health-care?facility=${encodeURIComponent(entry.code)}`} className="underline-offset-2 hover:underline">
                          {entry.name}
                        </Link>
                      ) : (
                        entry.name
                      )}
                    </td>
                    <td className="py-2 text-right text-sm">{entry.amount.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="mt-3 flex justify-end">
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/reports/free-health-care/facility-cost/export?from=${fromParam}&to=${toParam}`}>Export CSV</Link>
            </Button>
          </div>
        </TableCard>

        <TableCard title="FHC care-path coverage by facility (month)" description="For FHC visits this month: admissions, surgery, and nursing notes by facility.">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Facility</th>
                <th className="py-2 font-medium text-right">FHC admissions</th>
                <th className="py-2 font-medium text-right">FHC surgeries</th>
                <th className="py-2 font-medium text-right">FHC nursing notes</th>
              </tr>
            </thead>
            <tbody>
              {fhcCarePathByFacility.size === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-xs text-muted-foreground">No FHC care-path activity recorded this month.</td>
                </tr>
              ) : (
                Array.from(fhcCarePathByFacility.entries()).map(([id, entry]) => (
                  <tr key={id} className="border-b last:border-0">
                    <td className="py-2 text-sm">{entry.name}</td>
                    <td className="py-2 text-right text-sm">{entry.admissions}</td>
                    <td className="py-2 text-right text-sm">{entry.surgeries}</td>
                    <td className="py-2 text-right text-sm">{entry.nursingNotes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableCard>

        <div className="grid gap-4 md:grid-cols-2">
          <TableCard title="Radiology FHC visits by facility (month)" description="Free Health Care radiology requests this month by facility.">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Facility</th>
                  <th className="py-2 font-medium text-right">FHC radiology requests</th>
                </tr>
              </thead>
              <tbody>
                {fhcRadiologyByFacility.size === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-4 text-center text-xs text-muted-foreground">No FHC radiology requests recorded this month.</td>
                  </tr>
                ) : (
                  Array.from(fhcRadiologyByFacility.entries()).map(([id, entry]) => (
                    <tr key={id} className="border-b last:border-0">
                      <td className="py-2 text-sm">{entry.name}</td>
                      <td className="py-2 text-right text-sm">{entry.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableCard>

          <TableCard title="Lab FHC tests by facility (month)" description="Free Health Care lab tests this month by facility.">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Facility</th>
                  <th className="py-2 font-medium text-right">FHC lab tests</th>
                </tr>
              </thead>
              <tbody>
                {fhcLabByFacility.size === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-4 text-center text-xs text-muted-foreground">No FHC lab tests recorded this month.</td>
                  </tr>
                ) : (
                  Array.from(fhcLabByFacility.entries()).map(([id, entry]) => (
                    <tr key={id} className="border-b last:border-0">
                      <td className="py-2 text-sm">{entry.name}</td>
                      <td className="py-2 text-right text-sm">{entry.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableCard>
        </div>

        <TableCard title="FHC admissions by facility (month)" description="Inpatient admissions linked to FHC visits this month by facility.">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Facility</th>
                <th className="py-2 font-medium text-right">Total FHC admissions</th>
                <th className="py-2 font-medium text-right">Currently admitted</th>
                <th className="py-2 font-medium text-right">Discharged</th>
              </tr>
            </thead>
            <tbody>
              {fhcAdmissionsByFacility.size === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-xs text-muted-foreground">No FHC-linked admissions recorded this month.</td>
                </tr>
              ) : (
                Array.from(fhcAdmissionsByFacility.entries()).map(([id, entry]) => (
                  <tr key={id} className="border-b last:border-0">
                    <td className="py-2 text-sm">{entry.name}</td>
                    <td className="py-2 text-right text-sm">{entry.count}</td>
                    <td className="py-2 text-right text-sm">{entry.admittedCount}</td>
                    <td className="py-2 text-right text-sm">{entry.dischargedCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableCard>
      </div>
    )
  } catch (error) {
    sectionPerf.fail(error, { query_count: 6 })
    throw error
  }
}

export default async function ReportsPage() {
  const pagePerf = startPageRenderTimer("dashboard.reports")
  const supabase = await createServerClient()

  try {
    const { user, profile } = await getSessionUserAndProfile()
    if (!user) redirect("/auth/login")

    const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
    if (!can(rbacUser, "reports.view") && !can(rbacUser, "admin.export") && !can(rbacUser, "admin.settings.manage")) {
      redirect("/dashboard")
    }

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    thirtyDaysAgo.setHours(0, 0, 0, 0)

    const [{ data: invoices }, newPatientsCount, completedVisitsCount, pendingLabTestsCount] = await Promise.all([
      supabase
        .from("invoices")
        .select("total_amount, paid_amount, payment_date, created_at, payer_type, company_id, companies(name)")
        .gte("created_at", startOfMonth.toISOString())
        .order("created_at", { ascending: false })
        .limit(MAX_MONTHLY_INVOICE_ROWS),
      supabase.from("patients").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo.toISOString()),
      supabase.from("visits").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo.toISOString()).eq("visit_status", "completed"),
      supabase.from("lab_tests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ])

    const now = new Date()
    const fromParam = startOfMonth.toISOString().slice(0, 10)
    const toParam = now.toISOString().slice(0, 10)

    let monthlyRevenue = 0
    const companyOutstandingMap = new Map<string, { name: string; outstanding: number }>()
    for (const row of (invoices || []) as InvoiceRow[]) {
      const total = Number(row.total_amount ?? 0)
      const paid = Number(row.paid_amount ?? 0)
      const paymentDate = row.payment_date ? new Date(row.payment_date) : null
      if (paymentDate && paymentDate >= startOfMonth && paymentDate <= now) {
        monthlyRevenue += paid
      }
      const payerType = (row.payer_type ?? "patient").toLowerCase()
      const companyId = row.company_id ?? null
      if (payerType === "company" && companyId) {
        const outstanding = Math.max(total - paid, 0)
        if (outstanding > 0) {
          const existing = companyOutstandingMap.get(companyId) || { name: row.companies?.name || "Unknown company", outstanding: 0 }
          existing.outstanding += outstanding
          companyOutstandingMap.set(companyId, existing)
        }
      }
    }

    const topCompanies = Array.from(companyOutstandingMap.entries()).sort((a, b) => b[1].outstanding - a[1].outstanding).slice(0, 5)
    pagePerf.done({
      query_count: 4,
      invoice_rows: invoices?.length || 0,
      new_patients: newPatientsCount.count || 0,
      completed_visits: completedVisitsCount.count || 0,
    })

    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">High-level analytics across patients, billing, and clinical activity.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Monthly Revenue" value={`Le ${monthlyRevenue.toLocaleString()}`} description="Total revenue this month" icon={<FileText className="h-4 w-4 text-muted-foreground" />} />
          <StatCard title="New Patients (30d)" value={newPatientsCount.count ?? 0} description="Recently registered patients" icon={<Users className="h-4 w-4 text-muted-foreground" />} />
          <StatCard title="Completed Visits (30d)" value={completedVisitsCount.count ?? 0} description="Finished appointments" icon={<Activity className="h-4 w-4 text-muted-foreground" />} />
          <StatCard title="Pending Lab Tests" value={pendingLabTestsCount.count ?? 0} description="Awaiting results" icon={<CalendarRange className="h-4 w-4 text-muted-foreground" />} />
        </div>

        <Suspense fallback={<FhcSectionFallback />}>
          <FhcAnalyticsSection fromParam={fromParam} toParam={toParam} />
        </Suspense>

        <TableCard title="Top companies by outstanding balance" description="Largest unpaid company balances this month.">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Company</th>
                <th className="py-2 font-medium text-right">Outstanding (Le)</th>
                <th className="py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {topCompanies.length === 0 ? (
                <tr><td colSpan={3} className="py-4 text-center text-xs text-muted-foreground">No outstanding company balances for this period.</td></tr>
              ) : (
                topCompanies.map(([companyId, entry]) => (
                  <tr key={companyId} className="border-b last:border-0">
                    <td className="py-2 text-sm">{entry.name}</td>
                    <td className="py-2 text-right text-sm">{entry.outstanding.toLocaleString()}</td>
                    <td className="py-2 text-right text-xs">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/billing?company_id=${companyId}`}>View invoices</Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableCard>

        <div className="flex flex-col gap-3 md:flex-row">
          <div className="flex flex-1 items-center justify-between rounded-lg border bg-card p-4">
            <div>
              <h2 className="text-sm font-medium">Company insurance dashboard</h2>
              <p className="text-xs text-muted-foreground">View per-company employees, dependents, valid/expired cards, and visits this month.</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/reports/company-insurance">Open dashboard</Link>
            </Button>
          </div>

          <div className="flex flex-1 items-center justify-between rounded-lg border bg-card p-4">
            <div>
              <h2 className="text-sm font-medium">Company billing by staff &amp; doctor</h2>
              <p className="text-xs text-muted-foreground">View company-paid invoices by visit, including employee and prescribing doctor.</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/reports/company-billing">Open report</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  } catch (error) {
    pagePerf.fail(error, { query_count: 4 })
    throw error
  }
}
