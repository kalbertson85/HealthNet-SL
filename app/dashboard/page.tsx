import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Calendar, FileText, DollarSign, Activity, AlertCircle } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/stat-card"
import { redirect } from "next/navigation"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"

interface TodayAppointmentRow {
  id: string
  appointment_time: string
  patients?: { full_name?: string | null } | null
  profiles?: { full_name?: string | null } | null
}

export default async function DashboardPage() {
  const supabase = await createServerClient()

  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }

  // Fetch dashboard statistics with error handling
  const fetchStats = async () => {
    try {
      const [patientsCount, appointmentsToday, pendingPrescriptions, totalRevenue, activeAdmissions, pendingLabTests] =
        await Promise.all([
          supabase.from("patients").select("id", { count: "exact", head: true }),
          supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("appointment_date", new Date().toISOString().split("T")[0])
            .neq("status", "cancelled"),
          supabase.from("prescriptions").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("invoices").select("total_amount"),
          supabase.from("admissions").select("id", { count: "exact", head: true }).eq("status", "active"),
          supabase.from("lab_tests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        ])

      const revenue = totalRevenue.data?.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0) || 0

      return {
        patients: patientsCount.count || 0,
        appointments: appointmentsToday.count || 0,
        prescriptions: pendingPrescriptions.count || 0,
        revenue,
        admissions: activeAdmissions.count || 0,
        labTests: pendingLabTests.count || 0,
      }
    } catch (error) {
      console.error("[v0] Error fetching dashboard stats:", error)
      return {
        patients: 0,
        appointments: 0,
        prescriptions: 0,
        revenue: 0,
        admissions: 0,
        labTests: 0,
      }
    }
  }

  // Fetch recent activity with error handling
  const fetchRecentActivity = async () => {
    try {
      const { data: recentPatients } = await supabase
        .from("patients")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5)

      const { data: todayAppointments } = await supabase
        .from("appointments")
        .select("*, patients(full_name), profiles(full_name)")
        .eq("appointment_date", new Date().toISOString().split("T")[0])
        .order("appointment_time", { ascending: true })
        .limit(5)

      return {
        recentPatients: recentPatients || [],
        todayAppointments: todayAppointments || [],
      }
    } catch (error) {
      console.error("[v0] Error fetching recent activity:", error)
      return {
        recentPatients: [],
        todayAppointments: [],
      }
    }
  }

  const stats = await fetchStats()
  const { recentPatients, todayAppointments } = await fetchRecentActivity()

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-balance text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-pretty text-muted-foreground">
          High-level overview of patients, appointments, billing, and clinical activity.
        </p>
      </div>

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
            value={
              <>
                Le {stats.revenue.toLocaleString()}
              </>
            }
            description="All-time revenue"
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
                {todayAppointments.map((appointment: TodayAppointmentRow) => (
                  <div key={appointment.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{appointment.patients?.full_name || "Unknown"}</p>
                      <p className="text-sm text-muted-foreground">
                        {appointment.appointment_time} - Dr. {appointment.profiles?.full_name || "Unassigned"}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/dashboard/appointments/${appointment.id}`}>View</Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No appointments today</p>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  )
}
