import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface FhcRow {
  id: string
  created_at: string
  visit_status: string
  is_free_health_care: boolean
  payer_category: string | null
  free_health_category: string
  date_of_birth: string | null
  full_name: string | null
  facility_name: string | null
  facility_code: string | null
}
interface VisitReportRow {
  id: string
  created_at: string
  visit_status: string | null
  is_free_health_care: boolean | null
  payer_category: string | null
  patients:
    | { full_name?: string | null; date_of_birth?: string | null; free_health_category?: string | null }
    | Array<{ full_name?: string | null; date_of_birth?: string | null; free_health_category?: string | null }>
    | null
  facilities:
    | { name?: string | null; code?: string | null }
    | Array<{ name?: string | null; code?: string | null }>
    | null
}

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null
  try {
    const birth = new Date(dob)
    const years = Math.floor((Date.now() - birth.getTime()) / 31557600000)
    return Number.isFinite(years) ? years : null
  } catch {
    return null
  }
}

function ageBand(age: number | null): string {
  if (age == null) return "unknown"
  if (age < 5) return "0-4"
  if (age < 18) return "5-17"
  if (age < 50) return "18-49"
  if (age < 65) return "50-64"
  return "65+"
}

function categoryLabel(cat: string): string {
  switch (cat) {
    case "u5":
      return "Under 5 years"
    case "pregnant":
      return "Pregnant women"
    case "lactating":
      return "Lactating mothers"
    case "none":
    default:
      return "Not FHC"
  }
}

export const revalidate = 0

export default async function FreeHealthCareReportPage(props: {
  searchParams?: Promise<{ from?: string; to?: string; category?: string; status?: string; facility?: string; service_type?: string }>
}) {
  const supabase = await createServerClient()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }

  if (!can(rbacUser, "reports.view") && !can(rbacUser, "admin.export") && !can(rbacUser, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const fromParam = (resolvedSearchParams?.from || "").trim()
  const toParam = (resolvedSearchParams?.to || "").trim()
  const categoryFilter = (resolvedSearchParams?.category || "all").trim().toLowerCase()
  const statusFilter = (resolvedSearchParams?.status || "all").trim().toLowerCase()
  const facilityFilter = (resolvedSearchParams?.facility || "all").trim()
  const serviceType = (resolvedSearchParams?.service_type || "").trim()

  const toDate = toParam ? new Date(toParam) : new Date()
  const fromDate = fromParam ? new Date(fromParam) : (() => {
    const d = new Date(toDate)
    d.setDate(d.getDate() - 30)
    d.setHours(0, 0, 0, 0)
    return d
  })()

  const fromIso = fromDate.toISOString()
  const toIso = new Date(
    toDate.getFullYear(),
    toDate.getMonth(),
    toDate.getDate(),
    23,
    59,
    59,
    999,
  ).toISOString()

  let visitIdsForServiceType: string[] | null = null
  if (serviceType === "radiology_requests" || serviceType === "lab_tests") {
    const { data: serviceRows } = await supabase
      .from(serviceType)
      .select("visit_id")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
    visitIdsForServiceType = (serviceRows || []).map((r: { visit_id: string | null }) => r.visit_id as string).filter(Boolean)
  }

  const { data, error } = await supabase
    .from("visits")
    .select(
      `id, created_at, visit_status, is_free_health_care, payer_category,
       patients(full_name, date_of_birth, free_health_category),
       facilities(name, code)`
    )
    .eq("is_free_health_care", true)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[fhc-report] Error loading FHC visits:", error.message || error)
  }

  const mappedRows: FhcRow[] = ((data || []) as VisitReportRow[]).map((row) => {
    const p = Array.isArray(row.patients) ? row.patients[0] : row.patients
    const f = Array.isArray(row.facilities) ? row.facilities[0] : row.facilities
    return {
      id: row.id,
      created_at: row.created_at,
      visit_status: row.visit_status || "",
      is_free_health_care: Boolean(row.is_free_health_care),
      payer_category: row.payer_category ?? null,
      free_health_category: p?.free_health_category ?? "none",
      date_of_birth: p?.date_of_birth ?? null,
      full_name: p?.full_name ?? null,
      facility_name: f?.name ?? null,
      facility_code: f?.code ?? null,
    }
  })

  const rows: FhcRow[] = mappedRows.filter((row) => {
    if (categoryFilter !== "all" && row.free_health_category !== categoryFilter) {
      return false
    }

    if (statusFilter !== "all") {
      const status = row.visit_status.toLowerCase()
      if (statusFilter === "completed" && status !== "completed") return false
      if (statusFilter === "admitted" && status !== "admitted") return false
      if (statusFilter === "pending" && status === "completed") return false
      if (statusFilter === "pending" && status === "admitted") return false
    }

    if (facilityFilter !== "all") {
      const code = (row.facility_code || "").trim()
      if (!code || code !== facilityFilter) return false
    }

    if (visitIdsForServiceType && !visitIdsForServiceType.includes(row.id)) {
      return false
    }

    return true
  })

  type SummaryKey = `${string}|${string}`

  const summaryMap = new Map<SummaryKey, { count: number; completed: number; admitted: number; pending: number }>()

  for (const row of rows) {
    const age = ageFromDob(row.date_of_birth)
    const band = ageBand(age)
    const cat = row.free_health_category || "none"
    const key: SummaryKey = `${cat}|${band}`

    const bucket = summaryMap.get(key) || { count: 0, completed: 0, admitted: 0, pending: 0 }
    bucket.count += 1

    if (row.visit_status === "completed") bucket.completed += 1
    else if (row.visit_status === "admitted") bucket.admitted += 1
    else bucket.pending += 1

    summaryMap.set(key, bucket)
  }

  const summaryRows = Array.from(summaryMap.entries()).map(([key, bucket]) => {
    const [cat, band] = key.split("|")
    return {
      category: cat,
      ageBand: band,
      ...bucket,
    }
  })

  // Summary by facility (for the facility card)
  const facilitySummaryMap = new Map<
    string,
    { code: string; name: string; count: number }
  >()

  for (const row of rows) {
    const code = (row.facility_code || "(none)").trim()
    const name = (row.facility_name || "Unknown facility").trim() || "Unknown facility"

    const key = code || "(none)"
    const existing =
      facilitySummaryMap.get(key) || {
        code: code === "(none)" ? "" : code,
        name,
        count: 0,
      }

    existing.count += 1
    facilitySummaryMap.set(key, existing)
  }

  const facilitySummary = Array.from(facilitySummaryMap.values())

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Free Health Care Activity</h1>
        <p className="text-muted-foreground text-sm">
          Visits covered under Sierra Leone Free Health Care, summarised by category, age band, and outcome. Defaults to
          the last 30 days if no dates are selected.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Adjust date range and focus on specific FHC categories or visit outcomes.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="GET" className="grid gap-3 md:grid-cols-4 md:items-end text-sm">
            <div className="space-y-1">
              <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
                From date
              </label>
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={fromParam || fromIso.split("T")[0]}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="to" className="text-xs font-medium text-muted-foreground">
                To date
              </label>
              <input
                id="to"
                name="to"
                type="date"
                defaultValue={toParam || toIso.split("T")[0]}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="category" className="text-xs font-medium text-muted-foreground">
                FHC category
              </label>
              <select
                id="category"
                name="category"
                defaultValue={categoryFilter || "all"}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
              >
                <option value="all">All</option>
                <option value="u5">Under 5 years</option>
                <option value="pregnant">Pregnant women</option>
                <option value="lactating">Lactating mothers</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="status" className="text-xs font-medium text-muted-foreground">
                Outcome / status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={statusFilter || "all"}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
              >
                <option value="all">All</option>
                <option value="completed">Completed</option>
                <option value="admitted">Admitted</option>
                <option value="pending">Pending / other</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="facility" className="text-xs font-medium text-muted-foreground">
                Facility (code)
              </label>
              <input
                id="facility"
                name="facility"
                type="text"
                placeholder="e.g. OPD-1"
                defaultValue={facilityFilter === "all" ? "" : facilityFilter}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
              />
            </div>
            <div className="mt-2 flex gap-2 md:col-span-4">
              <button
                type="submit"
                className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent"
              >
                Apply filters
              </button>
              <a
                href={`/dashboard/reports/free-health-care/export?from=${encodeURIComponent(
                  fromIso,
                )}&to=${encodeURIComponent(toIso)}&category=${encodeURIComponent(
                  categoryFilter,
                )}&status=${encodeURIComponent(statusFilter)}&facility=${encodeURIComponent(facilityFilter)}&service_type=${encodeURIComponent(serviceType)}`}
                className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent"
              >
                Export CSV
              </a>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Summary by facility</CardTitle>
          <CardDescription>Total FHC visits in the selected period by facility.</CardDescription>
        </CardHeader>
        <CardContent>
          {facilitySummary.length === 0 ? (
            <p className="text-sm text-muted-foreground">No FHC visits in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">Facility</th>
                    <th className="py-2 font-medium text-right">Total FHC visits</th>
                  </tr>
                </thead>
                <tbody>
                  {facilitySummary.map((row) => (
                    <tr key={row.code} className="border-b last:border-0">
                      <td className="py-2 text-sm">{row.name}</td>
                      <td className="py-2 text-right text-sm">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Summary by category and age band</CardTitle>
          <CardDescription>
            Counts of FHC visits in the last 30 days by Free Health Care category, age band, and current visit outcome.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summaryRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Free Health Care visits recorded in the last 30 days.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">Category</th>
                    <th className="py-2 font-medium">Age band</th>
                    <th className="py-2 font-medium text-right">Total visits</th>
                    <th className="py-2 font-medium text-right">Completed</th>
                    <th className="py-2 font-medium text-right">Admitted</th>
                    <th className="py-2 font-medium text-right">Pending / other</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row) => (
                    <tr key={`${row.category}-${row.ageBand}`} className="border-b last:border-0">
                      <td className="py-2 text-sm">{categoryLabel(row.category)}</td>
                      <td className="py-2 text-sm">{row.ageBand}</td>
                      <td className="py-2 text-right text-sm">{row.count}</td>
                      <td className="py-2 text-right text-sm">{row.completed}</td>
                      <td className="py-2 text-right text-sm">{row.admitted}</td>
                      <td className="py-2 text-right text-sm">{row.pending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent FHC visits</CardTitle>
          <CardDescription>Most recent Free Health Care visits with category, age band, and current status.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Free Health Care visits to show.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {rows.slice(0, 50).map((row) => {
                const age = ageFromDob(row.date_of_birth)
                const band = ageBand(age)
                return (
                  <div key={row.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <p className="font-medium">{row.full_name || "Unknown patient"}</p>
                      <p className="text-xs text-muted-foreground">
                        {categoryLabel(row.free_health_category)}
                        {" · Age band "}
                        {band}
                        {row.facility_name && ` · ${row.facility_name}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs">
                      <Badge variant="outline">{row.visit_status}</Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(row.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
