import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Calendar, FileText, DollarSign, Activity, AlertCircle } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/stat-card"
import { DashboardPageShell } from "@/components/dashboard-page-shell"
import { redirect } from "next/navigation"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { startPageRenderTimer } from "@/lib/observability/page-performance"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"

interface TodayAppointmentRow {
  id: string
  appointment_time: string
  patients?: { full_name?: string | null } | { full_name?: string | null }[] | null
  profiles?: { full_name?: string | null } | { full_name?: string | null }[] | null
}

interface RecentPatientRow {
  id: string
  full_name: string | null
  patient_number: string | null
}

interface QueryTimingRow {
  label: string
  durationMs: number
  rows?: number
}

const MAX_REVENUE_INVOICE_SCAN = 1500
const SLOW_QUERY_WARN_MS = 500

async function RecentActivitySection({ todayIsoDate }: { todayIsoDate: string }) {
  const sectionPerf = startPageRenderTimer("dashboard.home.recent_activity", { slowThresholdMs: 600 })
  const supabase = await createServerClient()
  try {
    const [recentPatientsResult, todayAppointmentsResult] = await Promise.all([
      supabase
        .from("patients")
        .select("id, full_name, patient_number")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("appointments")
        .select("id, appointment_time, patients(full_name), profiles(full_name)")
        .eq("appointment_date", todayIsoDate)
        .order("appointment_time", { ascending: true })
        .limit(5),
    ])

    const recentPatients = (recentPatientsResult.data || []) as RecentPatientRow[]
    const todayAppointments = (todayAppointmentsResult.data || []) as TodayAppointmentRow[]

    sectionPerf.done({
      query_count: 2,
      recent_patients: recentPatients.length,
      today_appointments: todayAppointments.length,
    })

    return (
      <div className="order-1 md:order-2 grid gap-4 md:grid-cols-2">
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
      </div>
    )
  } catch (error) {
    sectionPerf.fail(error, { query_count: 2 })
    throw error
  }
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
  const pagePerf = startPageRenderTimer("dashboard.home")
  const supabase = await createServerClient()
  const queryTimings: QueryTimingRow[] = []

  const runTimedQuery = async <T,>(label: string, run: () => Promise<T>, getRows?: (value: T) => number | undefined): Promise<T> => {
    const startedAt = Date.now()
    const result = await run()
    const durationMs = Math.max(0, Date.now() - startedAt)
    queryTimings.push({
      label,
      durationMs,
      rows: getRows ? getRows(result) : undefined,
    })
    return result
  }

  try {
    const { user, profile } = await getSessionUserAndProfile()

    if (!user) {
      redirect("/auth/login")
    }

    const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
    const todayIsoDate = new Date().toISOString().split("T")[0]

    const [patientsCount, appointmentsToday, pendingPrescriptions, totalRevenue, activeAdmissions, pendingLabTests] =
      await Promise.all([
        runTimedQuery("patients.count", () => supabase.from("patients").select("id", { count: "exact", head: true })),
        runTimedQuery("appointments.today.count", () =>
          supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("appointment_date", todayIsoDate)
            .neq("status", "cancelled")
        ),
        runTimedQuery("prescriptions.pending.count", () =>
          supabase.from("prescriptions").select("id", { count: "exact", head: true }).eq("status", "pending")
        ),
        runTimedQuery(
          "invoices.revenue_window",
          () =>
            supabase
              .from("invoices")
              .select("paid_amount")
              .not("payment_date", "is", null)
              .gt("paid_amount", 0)
              .order("payment_date", { ascending: false })
              .limit(MAX_REVENUE_INVOICE_SCAN),
          (result) => (result as { data?: unknown[] | null }).data?.length
        ),
        runTimedQuery("admissions.active.count", () =>
          supabase.from("admissions").select("id", { count: "exact", head: true }).eq("status", "active")
        ),
        runTimedQuery("lab_tests.pending.count", () =>
          supabase.from("lab_tests").select("id", { count: "exact", head: true }).eq("status", "pending")
        ),
      ])

    const revenue = totalRevenue.data?.reduce((sum, invoice) => sum + Number(invoice.paid_amount || 0), 0) || 0
    const revenueTruncated = (totalRevenue.data?.length || 0) >= MAX_REVENUE_INVOICE_SCAN

    const stats = {
      patients: patientsCount.count || 0,
      appointments: appointmentsToday.count || 0,
      prescriptions: pendingPrescriptions.count || 0,
      revenue,
      revenueTruncated,
      admissions: activeAdmissions.count || 0,
      labTests: pendingLabTests.count || 0,
    }

    for (const timing of queryTimings) {
      const payload = { query: timing.label, duration_ms: timing.durationMs, rows: timing.rows ?? null }
      if (timing.durationMs >= SLOW_QUERY_WARN_MS) {
        console.warn("[dashboard.query]", payload)
      } else {
        console.info("[dashboard.query]", payload)
      }
    }

    const slowest = queryTimings.reduce<QueryTimingRow | null>(
      (max, current) => (max === null || current.durationMs > max.durationMs ? current : max),
      null
    )

    pagePerf.done({
      query_count: queryTimings.length,
      slowest_query: slowest?.label || null,
      slowest_query_ms: slowest?.durationMs ?? 0,
      revenue_truncated: stats.revenueTruncated,
    })

    return (
      <DashboardPageShell
        title="Dashboard"
        description="High-level overview of patients, appointments, billing, and clinical activity."
      >
        {stats.revenueTruncated ? (
          <div className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Revenue is computed from the latest {MAX_REVENUE_INVOICE_SCAN.toLocaleString()} paid invoices for performance.
          </div>
        ) : null}

        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Key metrics</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Total Patients"
              value={stats.patients}
              description="Registered in system"
              icon={<Users className="h-4 w-4 text-muted-foreground" />}
            />

            <StatCard
              title="Today’s Appointments"
              value={stats.appointments}
              description="Scheduled for today"
              icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
            />

            <StatCard
              title="Pending Prescriptions"
              value={stats.prescriptions}
              description="Awaiting dispensing"
              icon={<FileText className="h-4 w-4 text-muted-foreground" />}
            />

            <StatCard
              title="Total Revenue"
              value={<>Le {stats.revenue.toLocaleString()}</>}
              description={stats.revenueTruncated ? "Recent paid-invoice window revenue" : "Collected revenue"}
              icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
            />

            <StatCard
              title="Active Admissions"
              value={stats.admissions}
              description="Currently admitted"
              icon={<Activity className="h-4 w-4 text-muted-foreground" />}
            />

            <StatCard
              title="Pending Lab Tests"
              value={stats.labTests}
              description="Awaiting results"
              icon={<AlertCircle className="h-4 w-4 text-muted-foreground" />}
            />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card className="order-2 md:order-1">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Commonly used workflows</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/dashboard/patients/new">Register Patient</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/appointments/new">Book Appointment</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/prescriptions/new">Create Prescription</Link>
              </Button>
              {can(rbacUser, "billing.manage") ? (
                <Button asChild variant="outline">
                  <Link href="/dashboard/billing/new">Create Invoice</Link>
                </Button>
              ) : (
                <Button variant="outline" disabled title="You don't have permission to create invoices.">
                  Create Invoice
                </Button>
              )}
              {can(rbacUser, "reports.view") || can(rbacUser, "admin.export") || can(rbacUser, "admin.settings.manage") ? (
                <Button asChild variant="outline">
                  <Link href="/dashboard/reports/company-insurance">Company Insurance</Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled
                  title="You don't have permission to view the company insurance dashboard."
                >
                  Company Insurance
                </Button>
              )}
            </CardContent>
          </Card>

          <Suspense fallback={<RecentActivityFallback />}>
            <RecentActivitySection todayIsoDate={todayIsoDate} />
          </Suspense>
        </div>
      </DashboardPageShell>
    )
  } catch (error) {
    pagePerf.fail(error, { query_count: queryTimings.length || 6 })
    throw error
  }
}
