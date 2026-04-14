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
import {
  fetchFhcAnalytics,
  fetchReportsSummary,
  fetchTopCompanies,
  parseReportDate,
} from "@/lib/reports/queries"
import { getGlobalSettings } from "@/lib/global-settings"
import { formatCurrency } from "@/lib/locale-format"

function ReportSummaryFallback() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, idx) => (
        <Skeleton key={idx} className="h-24 w-full" />
      ))}
    </div>
  )
}

function TopCompaniesFallback() {
  return <Skeleton className="h-80 w-full" />
}

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

async function ReportsSummarySection({ fromIso, toIso, fromParam, toParam }: { fromIso: string; toIso: string; fromParam: string; toParam: string }) {
  const sectionPerf = startPageRenderTimer("dashboard.reports.summary", { slowThresholdMs: 1200 })
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()

  try {
    const { monthlyRevenue, paidInvoiceRows, newPatientsCount, completedVisitsCount, pendingLabTestsCount, source } =
      await fetchReportsSummary(supabase, fromIso, toIso)

    sectionPerf.done({
      query_count: 4,
      paid_invoice_rows: paidInvoiceRows.length || 0,
      new_patients: newPatientsCount.count || 0,
      completed_visits: completedVisitsCount.count || 0,
      source,
    })

    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Revenue" value={formatCurrency(monthlyRevenue, settings)} description={`Paid invoices from ${fromParam} to ${toParam}`} icon={<FileText className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="New Patients" value={newPatientsCount.count ?? 0} description={`Registered from ${fromParam} to ${toParam}`} icon={<Users className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Completed Visits" value={completedVisitsCount.count ?? 0} description={`Finished visits from ${fromParam} to ${toParam}`} icon={<Activity className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Pending Lab Tests" value={pendingLabTestsCount.count ?? 0} description="Awaiting results" icon={<CalendarRange className="h-4 w-4 text-muted-foreground" />} />
      </div>
    )
  } catch (error) {
    sectionPerf.fail(error, { query_count: 4 })
    throw error
  }
}

async function TopCompaniesSection({ fromIso, toIso }: { fromIso: string; toIso: string }) {
  const sectionPerf = startPageRenderTimer("dashboard.reports.top_companies", { slowThresholdMs: 1200 })
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()

  try {
    const { companyInvoiceRows, topCompanies, source } = await fetchTopCompanies(supabase, fromIso, toIso)

    sectionPerf.done({
      query_count: 1,
      company_invoice_rows: companyInvoiceRows.length || 0,
      top_companies: topCompanies.length,
      source,
    })

    return (
      <TableCard title="Top companies by outstanding balance" description="Largest unpaid company balances this month.">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">Company</th>
              <th className="py-2 font-medium text-right">Outstanding</th>
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
                  <td className="py-2 text-right text-sm">{formatCurrency(entry.outstanding, settings)}</td>
                  <td className="py-2 text-right text-xs">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/billing?company_id=${companyId}`}>Open company billing view</Link>
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableCard>
    )
  } catch (error) {
    sectionPerf.fail(error, { query_count: 1 })
    throw error
  }
}

async function FhcAnalyticsSection({ fromParam, toParam }: { fromParam: string; toParam: string }) {
  const sectionPerf = startPageRenderTimer("dashboard.reports.fhc", { slowThresholdMs: 1200 })
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()
  const publicCoverageLabel = settings.publicCoverageLabel
  const startOfRangeIso = `${fromParam}T00:00:00.000Z`
  const endOfRangeIso = `${toParam}T23:59:59.999Z`

  try {
    const {
      economicCostTotal,
      costByFacility,
      carePathByFacility,
      radiologyByFacility,
      labByFacility,
      admissionsByFacility,
      monthlyDataTruncated,
      rowCount,
      source,
    } = await fetchFhcAnalytics(supabase, startOfRangeIso, endOfRangeIso)

    sectionPerf.done({
      query_count: source === "rpc" ? 1 : 6,
      fhc_rows: rowCount,
      monthly_data_truncated: monthlyDataTruncated,
      source,
    })

    return (
      <div className="space-y-8">
        {monthlyDataTruncated ? (
          <div className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Some monthly analytics were capped for performance. Use narrower date filters in detailed report pages for full coverage.
          </div>
        ) : null}

        <StatCard
          title={`${publicCoverageLabel} economic cost (month)`}
          value={formatCurrency(economicCostTotal, settings)}
          description={`Economic value of ${publicCoverageLabel.toLowerCase()} items this month`}
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
        />

        <TableCard
          title={`${publicCoverageLabel} economic cost by facility (month)`}
          description={`Economic value of ${publicCoverageLabel.toLowerCase()} items this month by facility.`}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Facility</th>
                <th className="py-2 font-medium text-right">{publicCoverageLabel} economic cost</th>
              </tr>
            </thead>
            <tbody>
              {costByFacility.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-4 text-center text-xs text-muted-foreground">No {publicCoverageLabel.toLowerCase()} items recorded this month.</td>
                </tr>
              ) : (
                costByFacility.map((entry) => (
                  <tr key={entry.facilityId} className="border-b last:border-0">
                    <td className="py-2 text-sm">
                      {entry.code ? (
                        <Link href={`/dashboard/reports/free-health-care?facility=${encodeURIComponent(entry.code)}`} className="underline-offset-2 hover:underline">
                          {entry.name}
                        </Link>
                      ) : (
                        entry.name
                      )}
                    </td>
                    <td className="py-2 text-right text-sm">{formatCurrency(entry.amount, settings)}</td>
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

        <TableCard
          title={`${publicCoverageLabel} care-path coverage by facility (month)`}
          description={`For ${publicCoverageLabel.toLowerCase()} visits this month: admissions, surgery, and nursing notes by facility.`}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Facility</th>
                <th className="py-2 font-medium text-right">{publicCoverageLabel} admissions</th>
                <th className="py-2 font-medium text-right">{publicCoverageLabel} surgeries</th>
                <th className="py-2 font-medium text-right">{publicCoverageLabel} nursing notes</th>
              </tr>
            </thead>
            <tbody>
              {carePathByFacility.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-xs text-muted-foreground">No {publicCoverageLabel.toLowerCase()} care-path activity recorded this month.</td>
                </tr>
              ) : (
                carePathByFacility.map((entry) => (
                  <tr key={entry.facilityId} className="border-b last:border-0">
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
        <TableCard
          title={`Radiology ${publicCoverageLabel.toLowerCase()} visits by facility (month)`}
          description={`${publicCoverageLabel} radiology requests this month by facility.`}
        >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Facility</th>
                  <th className="py-2 font-medium text-right">{publicCoverageLabel} radiology requests</th>
                </tr>
              </thead>
              <tbody>
                {radiologyByFacility.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-4 text-center text-xs text-muted-foreground">No {publicCoverageLabel.toLowerCase()} radiology requests recorded this month.</td>
                  </tr>
                ) : (
                  radiologyByFacility.map((entry) => (
                    <tr key={entry.facilityId} className="border-b last:border-0">
                      <td className="py-2 text-sm">{entry.name}</td>
                      <td className="py-2 text-right text-sm">{entry.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableCard>

        <TableCard
          title={`Lab ${publicCoverageLabel.toLowerCase()} tests by facility (month)`}
          description={`${publicCoverageLabel} lab tests this month by facility.`}
        >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Facility</th>
                  <th className="py-2 font-medium text-right">{publicCoverageLabel} lab tests</th>
                </tr>
              </thead>
              <tbody>
                {labByFacility.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-4 text-center text-xs text-muted-foreground">No {publicCoverageLabel.toLowerCase()} lab tests recorded this month.</td>
                  </tr>
                ) : (
                  labByFacility.map((entry) => (
                    <tr key={entry.facilityId} className="border-b last:border-0">
                      <td className="py-2 text-sm">{entry.name}</td>
                      <td className="py-2 text-right text-sm">{entry.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableCard>
        </div>

        <TableCard
          title={`${publicCoverageLabel} admissions by facility (month)`}
          description={`Inpatient admissions linked to ${publicCoverageLabel.toLowerCase()} visits this month by facility.`}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Facility</th>
                <th className="py-2 font-medium text-right">Total {publicCoverageLabel} admissions</th>
                <th className="py-2 font-medium text-right">Currently admitted</th>
                <th className="py-2 font-medium text-right">Discharged</th>
              </tr>
            </thead>
            <tbody>
              {admissionsByFacility.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-xs text-muted-foreground">No {publicCoverageLabel.toLowerCase()} linked admissions recorded this month.</td>
                </tr>
              ) : (
                admissionsByFacility.map((entry) => (
                  <tr key={entry.facilityId} className="border-b last:border-0">
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
    sectionPerf.fail(error, { query_count: 1 })
    throw error
  }
}

export default async function ReportsPage(props: { searchParams?: Promise<{ from?: string; to?: string }> }) {
  const pagePerf = startPageRenderTimer("dashboard.reports")

  try {
    const { user, profile } = await getSessionUserAndProfile()
    if (!user) redirect("/auth/login")

    const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
    if (!can(rbacUser, "reports.view") && !can(rbacUser, "admin.export") && !can(rbacUser, "admin.settings.manage")) {
      redirect("/dashboard")
    }

    const now = new Date()
    const defaultStart = new Date()
    defaultStart.setDate(1)
    defaultStart.setHours(0, 0, 0, 0)
    const searchParams = props.searchParams ? await props.searchParams : undefined
    const fromDate = parseReportDate(searchParams?.from, defaultStart)
    const toBaseDate = parseReportDate(searchParams?.to, now)
    const toDate = new Date(toBaseDate)
    toDate.setHours(23, 59, 59, 999)
    const fromParam = fromDate.toISOString().slice(0, 10)
    const toParam = toDate.toISOString().slice(0, 10)
    const fromIso = fromDate.toISOString()
    const toIso = toDate.toISOString()

    pagePerf.done({
      query_count: 0,
      streamed_sections: 3,
      from: fromParam,
      to: toParam,
    })

    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">High-level analytics across patients, billing, and clinical activity.</p>
        </div>

        <form method="GET" className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4 text-sm">
          <div className="space-y-1">
            <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={fromParam}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="to" className="text-xs font-medium text-muted-foreground">
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={toParam}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm">
              Apply range
            </Button>
            <Button asChild type="button" size="sm" variant="outline">
              <Link href="/dashboard/reports">Reset</Link>
            </Button>
          </div>
        </form>

        <Suspense fallback={<ReportSummaryFallback />}>
          <ReportsSummarySection fromIso={fromIso} toIso={toIso} fromParam={fromParam} toParam={toParam} />
        </Suspense>

        <Suspense fallback={<TopCompaniesFallback />}>
          <TopCompaniesSection fromIso={fromIso} toIso={toIso} />
        </Suspense>

        <Suspense fallback={<FhcSectionFallback />}>
          <FhcAnalyticsSection fromParam={fromParam} toParam={toParam} />
        </Suspense>

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
    pagePerf.fail(error, { query_count: 0 })
    throw error
  }
}
