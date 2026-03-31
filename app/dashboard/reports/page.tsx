import Link from "next/link"
import { redirect } from "next/navigation"
import { StatCard } from "@/components/stat-card"
import { TableCard } from "@/components/table-card"
import { Button } from "@/components/ui/button"
import { CalendarRange, FileText, Users, Activity } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"

export default async function ReportsPage() {
  const supabase = await createServerClient()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

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

  const [
    { data: invoices },
    newPatientsCount,
    completedVisitsCount,
    pendingLabTestsCount,
    { data: fhcItems },
    { data: fhcRadiology },
    { data: fhcLab },
    { data: fhcAdmissions },
    { data: fhcSurgeries },
    { data: fhcNursingNotes },
  ] = await Promise.all([
      supabase
        .from("invoices")
        .select("total_amount, paid_amount, status, payment_date, created_at, payer_type, company_id, companies(name)")
        .gte("created_at", startOfMonth.toISOString()),
      supabase.from("patients").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo.toISOString()),
      supabase
        .from("visits")
        .select("id", { count: "exact", head: true })
        .gte("created_at", thirtyDaysAgo.toISOString())
        .eq("visit_status", "completed"),
      supabase.from("lab_tests").select("id", { count: "exact", head: true }).eq("status", "pending"),
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
        .gte("invoices.created_at", startOfMonth.toISOString()),
      supabase
        .from("radiology_requests")
        .select(
          `id, status,
           visits(is_free_health_care, facility_id,
             facilities(name)
           )`,
        )
        .gte("created_at", startOfMonth.toISOString()),
      supabase
        .from("lab_tests")
        .select(
          `id, status,
           visits(is_free_health_care, facility_id,
             facilities(name)
           )`,
        )
        .gte("created_at", startOfMonth.toISOString()),
      supabase
        .from("admissions")
        .select(
          `id, admission_date, status,
           visits(is_free_health_care, facility_id,
             facilities(name, code)
           )`,
        )
        .gte("admission_date", startOfMonth.toISOString()),
      supabase
        .from("surgeries")
        .select(
          `id, status,
           visits(is_free_health_care, facility_id,
             facilities(name, code)
           )`,
        )
        .gte("scheduled_at", startOfMonth.toISOString()),
      supabase
        .from("visit_nursing_notes")
        .select(
          `id, visit_id,
           visits(is_free_health_care, facility_id,
             facilities(name, code)
           )`,
        )
        .gte("performed_at", startOfMonth.toISOString()),
    ])

  const now = new Date()

  const fromParam = startOfMonth.toISOString().slice(0, 10)
  const toParam = now.toISOString().slice(0, 10)

  let monthlyRevenue = 0
  const companyOutstandingMap = new Map<string, { name: string; outstanding: number }>()

  interface InvoiceRow {
    total_amount?: number | null
    paid_amount?: number | null
    payment_date?: string | null
    created_at?: string | null
    status?: string | null
    payer_type?: string | null
    company_id?: string | null
    companies?: {
      name?: string | null
    } | null
  }

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
        const existing = companyOutstandingMap.get(companyId) || {
          name: row.companies?.name || "Unknown company",
          outstanding: 0,
        }
        existing.outstanding += outstanding
        companyOutstandingMap.set(companyId, existing)
      }
    }
  }

  const topCompanies = Array.from(companyOutstandingMap.entries())
    .sort((a, b) => b[1].outstanding - a[1].outstanding)
    .slice(0, 5)

  const newPatients = newPatientsCount.count ?? 0
  const completedVisits = completedVisitsCount.count ?? 0
  const pendingLabTests = pendingLabTestsCount.count ?? 0

  // FHC admissions by facility (month)
  const fhcAdmissionsByFacility = new Map<
    string,
    { name: string; code: string | null; count: number; admittedCount: number; dischargedCount: number }
  >()

  for (const row of fhcAdmissions || []) {
    const visits = (row.visits || null) as
      | { is_free_health_care?: boolean | null; facility_id?: string | null; facilities?: { name?: string | null; code?: string | null } | null }
      | null
    if (!visits?.is_free_health_care) continue

    const facilityId = (visits.facility_id as string | null) ?? "(none)"
    const facilityName = (visits.facilities?.name as string | null) ?? "Unknown facility"
    const facilityCode = (visits.facilities?.code as string | null) ?? null

    const existing =
      fhcAdmissionsByFacility.get(facilityId) ||
      { name: facilityName, code: facilityCode, count: 0, admittedCount: 0, dischargedCount: 0 }

    existing.count += 1
    const status = (row.status as string | null)?.toLowerCase() ?? ""
    if (status === "admitted") existing.admittedCount += 1
    if (status === "discharged") existing.dischargedCount += 1

    fhcAdmissionsByFacility.set(facilityId, existing)
  }

  // FHC surgeries by facility (month)
  const fhcSurgeriesByFacility = new Map<
    string,
    { name: string; code: string | null; count: number; completedCount: number }
  >()

  for (const row of fhcSurgeries || []) {
    const visits = (row.visits || null) as
      | { is_free_health_care?: boolean | null; facility_id?: string | null; facilities?: { name?: string | null; code?: string | null } | null }
      | null
    if (!visits?.is_free_health_care) continue

    const facilityId = (visits.facility_id as string | null) ?? "(none)"
    const facilityName = (visits.facilities?.name as string | null) ?? "Unknown facility"
    const facilityCode = (visits.facilities?.code as string | null) ?? null

    const existing =
      fhcSurgeriesByFacility.get(facilityId) ||
      { name: facilityName, code: facilityCode, count: 0, completedCount: 0 }

    existing.count += 1
    const status = (row.status as string | null)?.toLowerCase() ?? ""
    if (status === "completed") existing.completedCount += 1

    fhcSurgeriesByFacility.set(facilityId, existing)
  }

  // Radiology FHC by facility (counts)
  const fhcRadiologyByFacility = new Map<string, { name: string; count: number }>()
  for (const row of fhcRadiology || []) {
    const visits = (row.visits || null) as
      | { is_free_health_care?: boolean | null; facility_id?: string | null; facilities?: { name?: string | null } | null }
      | null
    if (!visits?.is_free_health_care) continue

    const facilityId = (visits.facility_id as string | null) ?? "(none)"
    const facilityName = (visits.facilities?.name as string | null) ?? "Unknown facility"
    const existing = fhcRadiologyByFacility.get(facilityId) || { name: facilityName, count: 0 }
    existing.count += 1
    fhcRadiologyByFacility.set(facilityId, existing)
  }

  // Lab FHC by facility (counts)
  const fhcLabByFacility = new Map<string, { name: string; count: number }>()
  for (const row of fhcLab || []) {
    const visits = (row.visits || null) as
      | { is_free_health_care?: boolean | null; facility_id?: string | null; facilities?: { name?: string | null } | null }
      | null
    if (!visits?.is_free_health_care) continue

    const facilityId = (visits.facility_id as string | null) ?? "(none)"
    const facilityName = (visits.facilities?.name as string | null) ?? "Unknown facility"
    const existing = fhcLabByFacility.get(facilityId) || { name: facilityName, count: 0 }
    existing.count += 1
    fhcLabByFacility.set(facilityId, existing)
  }

  // Economic value of FHC-covered items this month (facility/government cost), regardless of who pays
  let fhcEconomicCost = 0
  const fhcCostByFacility = new Map<string, { name: string; code: string | null; amount: number }>()

  for (const row of fhcItems || []) {
    const inv = (row.invoices || null) as
      | { created_at?: string | null; visits?: { is_free_health_care?: boolean; facility_id?: string | null; facilities?: { name?: string | null; code?: string | null } | null } | null }
      | null
    if (!inv || !inv.visits || !inv.visits.is_free_health_care) continue

    const itemType = (row.item_type as string | null) || "billable"
    if (itemType !== "fhc_covered") continue

    const qty = Number(row.quantity ?? 0)
    const unit = Number(row.unit_price ?? 0)
    if (!Number.isFinite(qty) || !Number.isFinite(unit)) continue

    const amount = qty * unit
    fhcEconomicCost += amount

    const facilityId = (inv.visits?.facility_id as string | null) ?? "(none)"
    const facilityName = (inv.visits?.facilities?.name as string | null) ?? "Unknown facility"
    const facilityCode = (inv.visits?.facilities?.code as string | null) ?? null
    const existing = fhcCostByFacility.get(facilityId) || { name: facilityName, code: facilityCode, amount: 0 }
    existing.amount += amount
    fhcCostByFacility.set(facilityId, existing)
  }

  // FHC care-path coverage by facility (month)
  const fhcCarePathByFacility = new Map<
    string,
    {
      name: string
      code: string | null
      admissions: number
      surgeries: number
      nursingNotes: number
    }
  >()

  const upsertCarePath = (
    visits:
      | { is_free_health_care?: boolean | null; facility_id?: string | null; facilities?: { name?: string | null; code?: string | null } | null }
      | null,
    field: "admissions" | "surgeries" | "nursingNotes",
  ) => {
    if (!visits?.is_free_health_care) return

    const facilityId = (visits.facility_id as string | null) ?? "(none)"
    const facilityName = (visits.facilities?.name as string | null) ?? "Unknown facility"
    const facilityCode = (visits.facilities?.code as string | null) ?? null

    const existing =
      fhcCarePathByFacility.get(facilityId) ||
      { name: facilityName, code: facilityCode, admissions: 0, surgeries: 0, nursingNotes: 0 }

    existing[field] += 1
    fhcCarePathByFacility.set(facilityId, existing)
  }

  for (const row of fhcAdmissions || []) {
    const visits = (row.visits || null) as
      | { is_free_health_care?: boolean | null; facility_id?: string | null; facilities?: { name?: string | null; code?: string | null } | null }
      | null
    upsertCarePath(visits, "admissions")
  }

  for (const row of fhcSurgeries || []) {
    const visits = (row.visits || null) as
      | { is_free_health_care?: boolean | null; facility_id?: string | null; facilities?: { name?: string | null; code?: string | null } | null }
      | null
    upsertCarePath(visits, "surgeries")
  }

  for (const row of fhcNursingNotes || []) {
    const visits = (row.visits || null) as
      | { is_free_health_care?: boolean | null; facility_id?: string | null; facilities?: { name?: string | null; code?: string | null } | null }
      | null
    upsertCarePath(visits, "nursingNotes")
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          High-level analytics across patients, billing, and clinical activity.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Monthly Revenue"
          value={`Le ${monthlyRevenue.toLocaleString()}`}
          description="Total revenue this month"
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="FHC economic cost (month)"
          value={`Le ${fhcEconomicCost.toLocaleString()}`}
          description="Economic value of FHC-covered items this month"
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="New Patients (30d)"
          value={newPatients}
          description="Recently registered patients"
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Completed Visits (30d)"
          value={completedVisits}
          description="Finished appointments"
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Pending Lab Tests"
          value={pendingLabTests}
          description="Awaiting results"
          icon={<CalendarRange className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <TableCard
        title="FHC economic cost by facility (month)"
        description="Economic value of FHC-covered items this month by facility."
      >
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
                <td colSpan={2} className="py-4 text-center text-xs text-muted-foreground">
                  No FHC-covered items recorded this month.
                </td>
              </tr>
            ) : (
              Array.from(fhcCostByFacility.entries()).map(([id, entry]) => (
                <tr key={id} className="border-b last:border-0">
                  <td className="py-2 text-sm">
                    {entry.code ? (
                      <Link
                        href={`/dashboard/reports/free-health-care?facility=${encodeURIComponent(entry.code)}`}
                        className="underline-offset-2 hover:underline"
                      >
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
            <Link
              href={`/dashboard/reports/free-health-care/facility-cost/export?from=${fromParam}&to=${toParam}`}
            >
              Export CSV
            </Link>
          </Button>
        </div>
      </TableCard>

      <TableCard
        title="FHC care-path coverage by facility (month)"
        description="For Free Health Care visits this month: how many reached admissions, surgery, and had nursing notes recorded, by facility."
      >
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
                <td colSpan={4} className="py-4 text-center text-xs text-muted-foreground">
                  No FHC care-path activity recorded this month.
                </td>
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

      <TableCard
        title="FHC surgeries by facility (month)"
        description="Surgical procedures linked to Free Health Care visits this month by facility."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">Facility</th>
              <th className="py-2 font-medium text-right">Total FHC surgeries</th>
              <th className="py-2 font-medium text-right">Completed</th>
              <th className="py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {fhcSurgeriesByFacility.size === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-xs text-muted-foreground">
                  No FHC-linked surgeries recorded this month.
                </td>
              </tr>
            ) : (
              Array.from(fhcSurgeriesByFacility.entries()).map(([id, entry]) => (
                <tr key={id} className="border-b last:border-0">
                  <td className="py-2 text-sm">{entry.name}</td>
                  <td className="py-2 text-right text-sm">{entry.count}</td>
                  <td className="py-2 text-right text-sm">{entry.completedCount}</td>
                  <td className="py-2 text-right text-xs">
                    {entry.code ? (
                      <Link
                        href={`/dashboard/reports/free-health-care?facility=${encodeURIComponent(
                          entry.code,
                        )}&service_type=surgeries`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View FHC report
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">No facility code</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableCard>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <TableCard
          title="Radiology FHC visits by facility (month)"
          description="Free Health Care radiology requests this month by facility."
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Facility</th>
                <th className="py-2 font-medium text-right">FHC radiology requests</th>
                <th className="py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {fhcRadiologyByFacility.size === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-xs text-muted-foreground">
                    No FHC radiology requests recorded this month.
                  </td>
                </tr>
              ) : (
                Array.from(fhcRadiologyByFacility.entries()).map(([id, entry]) => (
                  <tr key={id} className="border-b last:border-0">
                    <td className="py-2 text-sm">{entry.name}</td>
                    <td className="py-2 text-right text-sm">{entry.count}</td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/dashboard/reports/free-health-care?facility=${encodeURIComponent(id)}&service_type=radiology_requests`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View FHC report
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableCard>

        <TableCard
          title="Lab FHC tests by facility (month)"
          description="Free Health Care lab tests this month by facility."
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Facility</th>
                <th className="py-2 font-medium text-right">FHC lab tests</th>
                <th className="py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {fhcLabByFacility.size === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-xs text-muted-foreground">
                    No FHC lab tests recorded this month.
                  </td>
                </tr>
              ) : (
                Array.from(fhcLabByFacility.entries()).map(([id, entry]) => (
                  <tr key={id} className="border-b last:border-0">
                    <td className="py-2 text-sm">{entry.name}</td>
                    <td className="py-2 text-right text-sm">{entry.count}</td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/dashboard/reports/free-health-care?facility=${encodeURIComponent(id)}&service_type=lab_tests`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View FHC report
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableCard>
      </div>

      <TableCard
        title="FHC admissions by facility (month)"
        description="Inpatient admissions linked to Free Health Care visits this month by facility."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">Facility</th>
              <th className="py-2 font-medium text-right">Total FHC admissions</th>
              <th className="py-2 font-medium text-right">Currently admitted</th>
              <th className="py-2 font-medium text-right">Discharged</th>
              <th className="py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {fhcAdmissionsByFacility.size === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-xs text-muted-foreground">
                  No FHC-linked admissions recorded this month.
                </td>
              </tr>
            ) : (
              Array.from(fhcAdmissionsByFacility.entries()).map(([id, entry]) => (
                <tr key={id} className="border-b last:border-0">
                  <td className="py-2 text-sm">{entry.name}</td>
                  <td className="py-2 text-right text-sm">{entry.count}</td>
                  <td className="py-2 text-right text-sm">{entry.admittedCount}</td>
                  <td className="py-2 text-right text-sm">{entry.dischargedCount}</td>
                  <td className="py-2 text-right text-xs">
                    {entry.code ? (
                      <Link
                        href={`/dashboard/reports/free-health-care?facility=${encodeURIComponent(
                          entry.code,
                        )}&status=admitted`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View FHC report
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">No facility code</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableCard>

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
              <tr>
                <td colSpan={3} className="py-4 text-center text-xs text-muted-foreground">
                  No outstanding company balances for this period.
                </td>
              </tr>
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

      <TableCard title="Generated Reports" description="Recently generated or exported reports">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Type</th>
              <th className="py-2 font-medium">Period</th>
              <th className="py-2 font-medium">Created at</th>
              <th className="py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5} className="py-6 text-center text-muted-foreground">
                No reports generated yet
              </td>
            </tr>
          </tbody>
        </table>
      </TableCard>

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="flex flex-1 items-center justify-between rounded-lg border bg-card p-4">
          <div>
            <h2 className="text-sm font-medium">Company insurance dashboard</h2>
            <p className="text-xs text-muted-foreground">
              View per-company employees, dependents, valid/expired cards, and visits this month.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/reports/company-insurance">Open dashboard</Link>
          </Button>
        </div>

        <div className="flex flex-1 items-center justify-between rounded-lg border bg-card p-4">
          <div>
            <h2 className="text-sm font-medium">Company billing by staff &amp; doctor</h2>
            <p className="text-xs text-muted-foreground">
              View company-paid invoices by visit, including both the employee (patient) and prescribing doctor.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/reports/company-billing">Open report</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="flex flex-1 items-center justify-between rounded-lg border bg-card p-4">
          <div>
            <h2 className="text-sm font-medium">Free Health Care activity</h2>
            <p className="text-xs text-muted-foreground">
              View visits covered under Sierra Leone Free Health Care by category, age band, and outcome.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/reports/free-health-care">Open report</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
