import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Calendar, FileText, DollarSign, Activity, AlertCircle, TriangleAlert, Pill } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/stat-card"
import { DashboardPageShell } from "@/components/dashboard-page-shell"
import { redirect } from "next/navigation"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can, type PermissionKey } from "@/lib/utils"
import { startPageRenderTimer } from "@/lib/observability/page-performance"
import { Suspense, type ReactNode } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardOnboarding } from "@/components/dashboard-onboarding"
import { DraftResumePanel } from "@/components/draft-resume-panel"
import {
  fetchDashboardAlertInputs,
  fetchDashboardMetrics,
  fetchDashboardRecentActivity,
  fetchDashboardTrendInputs,
  getSlowestDashboardQuery,
  MAX_REVENUE_INVOICE_SCAN,
  MAX_TREND_ROW_SCAN,
  type DashboardQueryTimingRow as QueryTimingRow,
  type DashboardRbacUser as RbacUser,
} from "@/lib/dashboard/queries"

interface TrendPoint {
  label: string
  value: number
}

interface OperationalAlertItem {
  id: string
  title: string
  message: string
  href: string
  cta: string
  tone: "urgent" | "warning"
  icon: ReactNode
}

const SLOW_QUERY_WARN_MS = 1500
const DEBUG_DASHBOARD_QUERY_LOGS = process.env.DASHBOARD_QUERY_DEBUG === "true"

interface QuickActionItem {
  label: string
  href: string
  permission?: PermissionKey
}

const QUICK_ACTIONS: QuickActionItem[] = [
  { label: "Register Patient", href: "/dashboard/patients/new", permission: "patients.create" },
  { label: "Book Appointment", href: "/dashboard/appointments/new", permission: "appointments.manage" },
  { label: "Create Prescription", href: "/dashboard/prescriptions/new", permission: "prescriptions.manage" },
  { label: "Create Invoice", href: "/dashboard/billing/new", permission: "billing.manage" },
  { label: "Open Reports", href: "/dashboard/reports", permission: "reports.view" },
  { label: "Company Insurance", href: "/dashboard/reports/company-insurance", permission: "reports.view" },
]

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("en-GB", { weekday: "short" })
}

function buildSevenDayWindow(today: Date) {
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - index))
    const iso = date.toISOString().split("T")[0]
    return { iso, label: formatDayLabel(date) }
  })
}

function aggregateTrendByKey(
  windowDays: Array<{ iso: string; label: string }>,
  rows: Array<{ key: string | null | undefined; value?: number | null }>,
) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.key) continue
    counts.set(row.key, (counts.get(row.key) || 0) + Number(row.value ?? 1))
  }

  return windowDays.map((day) => ({
    label: day.label,
    value: counts.get(day.iso) || 0,
  }))
}

function MiniTrendCard({
  title,
  description,
  points,
}: {
  title: string
  description: string
  points: TrendPoint[]
}) {
  const maxValue = Math.max(...points.map((point) => point.value), 1)
  const total = points.reduce((sum, point) => sum + point.value, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-3xl font-bold">{total}</div>
        <div className="flex items-end gap-3">
          {points.map((point) => (
            <div key={point.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-28 w-full items-end rounded-md bg-muted/40 px-1 py-1">
                <div
                  className="w-full rounded-sm bg-primary/85 transition-all"
                  style={{ height: `${Math.max(8, Math.round((point.value / maxValue) * 100))}%` }}
                  aria-label={`${point.label}: ${point.value}`}
                  title={`${point.label}: ${point.value}`}
                />
              </div>
              <div className="text-center">
                <p className="text-xs font-medium">{point.value}</p>
                <p className="text-[11px] text-muted-foreground">{point.label}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function OperationalAlertsSection({ alerts }: { alerts: OperationalAlertItem[] }) {
  if (alerts.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Operational alerts</h2>
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/notifications">Open notifications</Link>
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {alerts.map((alert) => (
          <Card
            key={alert.id}
            className={
              alert.tone === "urgent"
                ? "border-red-200 bg-red-50/60"
                : "border-amber-200 bg-amber-50/60"
            }
          >
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className={alert.tone === "urgent" ? "text-red-700" : "text-amber-700"}>{alert.icon}</div>
                  <CardTitle className="text-base">{alert.title}</CardTitle>
                </div>
              </div>
              <CardDescription className="text-sm text-slate-700">{alert.message}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" variant={alert.tone === "urgent" ? "default" : "outline"}>
                <Link href={alert.href}>{alert.cta}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function logDashboardQueryTimings(queryTimings: QueryTimingRow[]) {
  for (const timing of queryTimings) {
    const payload: { query: string; duration_ms: number; rows?: number } = {
      query: timing.label,
      duration_ms: timing.durationMs,
    }
    if (typeof timing.rows === "number") payload.rows = timing.rows
    if (timing.durationMs >= SLOW_QUERY_WARN_MS) {
      console.warn("[dashboard.query]", payload)
    } else if (DEBUG_DASHBOARD_QUERY_LOGS) {
      console.info("[dashboard.query]", payload)
    }
  }
}

async function DashboardMetricsSection({ rbacUser, todayIsoDate }: { rbacUser: RbacUser; todayIsoDate: string }) {
  const sectionPerf = startPageRenderTimer("dashboard.home.metrics", { slowThresholdMs: 1500 })
  const supabase = await createServerClient()
  const queryTimings: QueryTimingRow[] = []

  try {
    const { patientsCount, appointmentsToday, pendingPrescriptions, activeAdmissions, pendingLabTests, revenue, source } =
      await fetchDashboardMetrics(supabase, rbacUser, todayIsoDate, queryTimings)

    logDashboardQueryTimings(queryTimings)
    const slowest = getSlowestDashboardQuery(queryTimings)
    sectionPerf.done({
      query_count: queryTimings.length,
      slowest_query: slowest?.label || null,
      slowest_query_ms: slowest?.durationMs ?? 0,
      revenue_truncated: revenue.revenueTruncated,
      revenue_source: revenue.source,
      source,
    })

    return (
      <div className="space-y-6">
        {revenue.revenueTruncated ? (
          <div className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Revenue is computed from the latest {MAX_REVENUE_INVOICE_SCAN.toLocaleString()} paid invoices while aggregate RPC is unavailable.
          </div>
        ) : null}

        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Key metrics</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Total Patients"
              value={patientsCount.count || 0}
              description="Registered in system"
              icon={<Users className="h-4 w-4 text-muted-foreground" />}
            />

            <StatCard
              title="Today’s Appointments"
              value={appointmentsToday.count || 0}
              description="Scheduled for today"
              icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
            />

            <StatCard
              title="Pending Prescriptions"
              value={pendingPrescriptions.count || 0}
              description="Awaiting dispensing"
              icon={<FileText className="h-4 w-4 text-muted-foreground" />}
            />

            {can(rbacUser, "billing.manage") || can(rbacUser, "reports.view") ? (
              <StatCard
                title="Total Revenue"
                value={<>Le {revenue.revenue.toLocaleString()}</>}
                description={revenue.revenueTruncated ? "Recent paid-invoice window revenue" : "Collected revenue"}
                icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
              />
            ) : null}

            {can(rbacUser, "inpatient.manage") ? (
              <StatCard
                title="Active Admissions"
                value={activeAdmissions.count || 0}
                description="Currently admitted"
                icon={<Activity className="h-4 w-4 text-muted-foreground" />}
              />
            ) : null}

            {can(rbacUser, "lab.manage") ? (
              <StatCard
                title="Pending Lab Tests"
                value={pendingLabTests.count || 0}
                description="Awaiting results"
                icon={<AlertCircle className="h-4 w-4 text-muted-foreground" />}
              />
            ) : null}
          </div>
        </div>
      </div>
    )
  } catch (error) {
    sectionPerf.fail(error, { query_count: queryTimings.length || 6 })
    throw error
  }
}

async function DashboardAlertsStreamSection({ rbacUser }: { rbacUser: RbacUser }) {
  const sectionPerf = startPageRenderTimer("dashboard.home.alerts", { slowThresholdMs: 1200 })
  const supabase = await createServerClient()
  const queryTimings: QueryTimingRow[] = []

  try {
    const { pendingLabCount, pendingRadiologyCount, overdueInvoiceCount, lowStockItems, source } =
      await fetchDashboardAlertInputs(supabase, rbacUser, queryTimings)

    const operationalAlerts: OperationalAlertItem[] = []

    if (lowStockItems.length > 0) {
      const leadMedication = lowStockItems[0]?.medications?.name || "Medication stock"
      operationalAlerts.push({
        id: "low-stock",
        title: "Low stock needs reorder review",
        message:
          lowStockItems.length === 1
            ? `${leadMedication} is at or below reorder level in the current stock snapshot.`
            : `${lowStockItems.length} medicines in the current stock snapshot are at or below reorder level.`,
        href: "/dashboard/pharmacy?stock_filter=low",
        cta: "Review stock",
        tone: "warning",
        icon: <Pill className="h-4 w-4" />,
      })
    }

    if (pendingLabCount > 0 && can(rbacUser, "lab.manage")) {
      operationalAlerts.push({
        id: "pending-lab",
        title: "Pending lab backlog",
        message: `${pendingLabCount.toLocaleString()} lab test${pendingLabCount === 1 ? "" : "s"} are still awaiting completion.`,
        href: "/dashboard/lab?status=pending",
        cta: "Open lab queue",
        tone: pendingLabCount >= 10 ? "urgent" : "warning",
        icon: <AlertCircle className="h-4 w-4" />,
      })
    }

    if (pendingRadiologyCount > 0 && can(rbacUser, "lab.manage")) {
      operationalAlerts.push({
        id: "pending-radiology",
        title: "Radiology queue requires review",
        message: `${pendingRadiologyCount.toLocaleString()} radiology request${pendingRadiologyCount === 1 ? "" : "s"} are pending or scheduled.`,
        href: "/dashboard/radiology",
        cta: "Open radiology",
        tone: pendingRadiologyCount >= 10 ? "urgent" : "warning",
        icon: <Activity className="h-4 w-4" />,
      })
    }

    if (overdueInvoiceCount > 0 && (can(rbacUser, "billing.manage") || can(rbacUser, "reports.view"))) {
      operationalAlerts.push({
        id: "overdue-billing",
        title: "Outstanding invoices need follow-up",
        message: `${overdueInvoiceCount.toLocaleString()} invoice${overdueInvoiceCount === 1 ? "" : "s"} still have an unpaid balance and need billing follow-up.`,
        href: "/dashboard/billing",
        cta: "Review invoices",
        tone: overdueInvoiceCount >= 10 ? "urgent" : "warning",
        icon: <TriangleAlert className="h-4 w-4" />,
      })
    }

    logDashboardQueryTimings(queryTimings)
    const slowest = getSlowestDashboardQuery(queryTimings)
    sectionPerf.done({
      query_count: queryTimings.length,
      slowest_query: slowest?.label || null,
      slowest_query_ms: slowest?.durationMs ?? 0,
      alerts_count: operationalAlerts.length,
      source,
    })

    return <OperationalAlertsSection alerts={operationalAlerts} />
  } catch (error) {
    sectionPerf.fail(error, { query_count: queryTimings.length || 4 })
    throw error
  }
}

async function DashboardTrendsSection({ rbacUser, trendStartDate, trendWindow }: { rbacUser: RbacUser; trendStartDate: string; trendWindow: Array<{ iso: string; label: string }> }) {
  const sectionPerf = startPageRenderTimer("dashboard.home.trends", { slowThresholdMs: 1500 })
  const supabase = await createServerClient()
  const queryTimings: QueryTimingRow[] = []

  try {
    const { patientTrendRows, appointmentTrendRows, revenueTrendRows, source, trendDataTruncated } = await fetchDashboardTrendInputs(
      supabase,
      rbacUser,
      trendStartDate,
      queryTimings,
    )

    const patientTrend = aggregateTrendByKey(
      trendWindow,
      (((patientTrendRows as { data?: Array<{ created_at?: string | null; value?: number | null }> | null }).data || []).map((row) => ({
        key: row.created_at?.split("T")[0],
        value: Number(row.value ?? 1),
      }))) as Array<{ key: string | null | undefined }>,
    )

    const appointmentTrend = aggregateTrendByKey(
      trendWindow,
      (((appointmentTrendRows as { data?: Array<{ appointment_date?: string | null; value?: number | null }> | null }).data || []).map((row) => ({
        key: row.appointment_date,
        value: Number(row.value ?? 1),
      }))) as Array<{ key: string | null | undefined }>,
    )

    const revenueTrend = aggregateTrendByKey(
      trendWindow,
      (((revenueTrendRows as { data?: Array<{ payment_date?: string | null; paid_amount?: number | null }> | null }).data || []).map((row) => ({
        key: row.payment_date ? row.payment_date.split("T")[0] : null,
        value: Number(row.paid_amount || 0),
      }))) as Array<{ key: string | null | undefined; value?: number | null }>,
    )

    logDashboardQueryTimings(queryTimings)
    const slowest = getSlowestDashboardQuery(queryTimings)
    sectionPerf.done({
      query_count: queryTimings.length,
      slowest_query: slowest?.label || null,
      slowest_query_ms: slowest?.durationMs ?? 0,
      trend_truncated: trendDataTruncated,
      source,
    })

    return (
      <div className="space-y-4">
        {trendDataTruncated ? (
          <div className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Trend charts are computed from the latest {MAX_TREND_ROW_SCAN.toLocaleString()} matching records per metric for faster dashboard loads.
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">7-day trends</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MiniTrendCard
            title="Patient registrations"
            description="New patients added over the last 7 days"
            points={patientTrend}
          />
          <MiniTrendCard title="Appointments" description="Scheduled appointments over the last 7 days" points={appointmentTrend} />
          {can(rbacUser, "billing.manage") || can(rbacUser, "reports.view") ? (
            <MiniTrendCard title="Paid revenue" description="Paid invoice totals over the last 7 days" points={revenueTrend} />
          ) : null}
        </div>
      </div>
    )
  } catch (error) {
    sectionPerf.fail(error, { query_count: queryTimings.length || 3 })
    throw error
  }
}

async function RecentActivitySection({
  todayIsoDate,
  canViewPatients,
  canManageAppointments,
}: {
  todayIsoDate: string
  canViewPatients: boolean
  canManageAppointments: boolean
}) {
  const sectionPerf = startPageRenderTimer("dashboard.home.recent_activity", { slowThresholdMs: 1200 })
  const supabase = await createServerClient()
  try {
    const { recentPatients, todayAppointments } = await fetchDashboardRecentActivity(
      supabase,
      todayIsoDate,
      canViewPatients,
      canManageAppointments,
    )

    sectionPerf.done({
      query_count: Number(canViewPatients) + Number(canManageAppointments),
      recent_patients: recentPatients.length,
      today_appointments: todayAppointments.length,
    })

    if (!canViewPatients && !canManageAppointments) {
      return null
    }

    return (
      <div className="order-1 md:order-2 grid gap-4 md:grid-cols-2">
        {canViewPatients ? (
          <Card>
            <CardHeader>
              <CardTitle>Recent Patients</CardTitle>
              <CardDescription>Newly registered patients</CardDescription>
            </CardHeader>
            <CardContent>
              {recentPatients.length > 0 ? (
                <div className="space-y-4">
                  {recentPatients.map((patient) => (
                    <div key={patient.id} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{patient.full_name}</p>
                        <p className="text-sm text-muted-foreground">{patient.patient_number}</p>
                      </div>
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/dashboard/patients/${patient.id}`}>View</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No recent patients</p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {canManageAppointments ? (
          <Card>
            <CardHeader>
              <CardTitle>Today’s Appointments</CardTitle>
              <CardDescription>Upcoming appointments</CardDescription>
            </CardHeader>
            <CardContent>
              {todayAppointments.length > 0 ? (
                <div className="space-y-4">
                  {todayAppointments.map((appointment) => {
                    const patient = Array.isArray(appointment.patients) ? appointment.patients[0] : appointment.patients
                    const doctor = Array.isArray(appointment.profiles) ? appointment.profiles[0] : appointment.profiles
                    return (
                      <div key={appointment.id} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{patient?.full_name || "Unknown"}</p>
                          <p className="text-sm text-muted-foreground">
                            {appointment.appointment_time} - Dr. {doctor?.full_name || "Unassigned"}
                          </p>
                        </div>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/appointments/${appointment.id}`}>View</Link>
                        </Button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No appointments today</p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    )
  } catch (error) {
    sectionPerf.fail(error, { query_count: Number(canViewPatients) + Number(canManageAppointments) })
    throw error
  }
}

function MetricsFallback() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <Skeleton key={idx} className="h-28 w-full" />
        ))}
      </div>
    </div>
  )
}

function AlertsFallback() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, idx) => (
          <Skeleton key={idx} className="h-36 w-full" />
        ))}
      </div>
    </div>
  )
}

function TrendsFallback({ showRevenueTrend }: { showRevenueTrend: boolean }) {
  const count = showRevenueTrend ? 3 : 2
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: count }).map((_, idx) => (
          <Skeleton key={idx} className="h-80 w-full" />
        ))}
      </div>
    </div>
  )
}

function RecentActivityFallback() {
  return (
    <div className="order-1 md:order-2 grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Recent Patients</CardTitle>
          <CardDescription>Loading newly registered patients...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Today’s Appointments</CardTitle>
          <CardDescription>Loading upcoming appointments...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-52" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export default async function DashboardPage() {
  const pagePerf = startPageRenderTimer("dashboard.home", { slowThresholdMs: 3000 })

  try {
    const { user, profile } = await getSessionUserAndProfile()

    if (!user) {
      redirect("/auth/login")
    }

    const rbacUser: RbacUser = {
      id: user.id,
      role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null,
    }
    const canViewPatients = can(rbacUser, "patients.view")
    const canManageAppointments = can(rbacUser, "appointments.manage")
    const canViewRevenue = can(rbacUser, "billing.manage") || can(rbacUser, "reports.view")
    const today = new Date()
    const todayIsoDate = today.toISOString().split("T")[0]
    const trendWindow = buildSevenDayWindow(today)
    const trendStartDate = trendWindow[0]?.iso || todayIsoDate

    pagePerf.done({
      query_count: 0,
      streamed_sections: 4,
      can_view_patients: canViewPatients,
      can_manage_appointments: canManageAppointments,
    })

    return (
      <DashboardPageShell
        title="Dashboard"
        description="High-level overview of patients, appointments, billing, and clinical activity."
      >
        <DashboardOnboarding role={rbacUser.role} />
        <DraftResumePanel />

        <Suspense fallback={<MetricsFallback />}>
          <DashboardMetricsSection rbacUser={rbacUser} todayIsoDate={todayIsoDate} />
        </Suspense>

        <Suspense fallback={<AlertsFallback />}>
          <DashboardAlertsStreamSection rbacUser={rbacUser} />
        </Suspense>

        <Suspense fallback={<TrendsFallback showRevenueTrend={canViewRevenue} />}>
          <DashboardTrendsSection rbacUser={rbacUser} trendStartDate={trendStartDate} trendWindow={trendWindow} />
        </Suspense>

        <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card className="order-2 md:order-1">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Actions available for your role</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.filter((item) => (item.permission ? can(rbacUser, item.permission) : true)).map((item) => (
                <Button key={item.href} asChild variant="outline">
                  <Link href={item.href}>{item.label}</Link>
                </Button>
              ))}
            </CardContent>
          </Card>

          <Suspense fallback={<RecentActivityFallback />}>
            <RecentActivitySection
              todayIsoDate={todayIsoDate}
              canViewPatients={canViewPatients}
              canManageAppointments={canManageAppointments}
            />
          </Suspense>
        </div>
      </DashboardPageShell>
    )
  } catch (error) {
    pagePerf.fail(error, { query_count: 0 })
    throw error
  }
}
