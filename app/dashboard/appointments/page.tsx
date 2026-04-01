import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Calendar } from "lucide-react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableCard } from "@/components/table-card"

export const revalidate = 0

const PAGE_SIZE = 50
const PAGE_SCAN_LIMIT = 500

interface AppointmentRow {
  id: string
  appointment_date: string
  appointment_time: string
  status: string
  reason: string | null
  patients?:
    | {
        full_name?: string | null
        patient_number?: string | null
      }
    | Array<{
        full_name?: string | null
        patient_number?: string | null
      }>
    | null
  doctor_id: string
}

interface AppointmentsPageSearchParams {
  doctor_id?: string
  from?: string
  to?: string
  status?: string
  page?: string
}

function normalizePatient(
  relation: AppointmentRow["patients"],
): { full_name?: string | null; patient_number?: string | null } | null {
  if (!relation) {
    return null
  }
  return Array.isArray(relation) ? (relation[0] ?? null) : relation
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams?: Promise<AppointmentsPageSearchParams>
}) {
  const supabase = await createServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // Require authentication to view appointments
    return null
  }

  const sp = searchParams ? await searchParams : {}

  // Get today's date in YYYY-MM-DD format for grouping into Today vs Upcoming
  const today = new Date().toISOString().split("T")[0]

  const doctorFilterId = (sp.doctor_id || "").trim() || null
  const fromDate = (sp.from || "").trim()
  const toDate = (sp.to || "").trim()
  const statusFilter = (sp.status || "all").trim().toLowerCase()
  const parsedPage = Number.parseInt(sp.page || "1", 10)
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE
  const scanCapReached = to >= PAGE_SCAN_LIMIT

  const buildPageHref = (page: number) => {
    const qs = new URLSearchParams()
    if (doctorFilterId) {
      qs.set("doctor_id", doctorFilterId)
    }
    if (fromDate) {
      qs.set("from", fromDate)
    }
    if (toDate) {
      qs.set("to", toDate)
    }
    if (statusFilter && statusFilter !== "all") {
      qs.set("status", statusFilter)
    }
    if (page > 1) {
      qs.set("page", String(page))
    }
    const queryString = qs.toString()
    return queryString ? `/dashboard/appointments?${queryString}` : "/dashboard/appointments"
  }

  let appointmentsQuery = supabase
    .from("appointments")
    .select(`
      id,
      appointment_date,
      appointment_time,
      status,
      reason,
      doctor_id,
      patients(full_name, patient_number)
    `)

  // Ensure we only load appointments created by the current user, matching
  // how new appointments are inserted and likely RLS policies.
  appointmentsQuery = appointmentsQuery.eq("created_by", user.id)

  if (fromDate) {
    appointmentsQuery = appointmentsQuery.gte("appointment_date", fromDate)
  }

  if (toDate) {
    appointmentsQuery.lte("appointment_date", toDate)
  }

  if (doctorFilterId) {
    appointmentsQuery.eq("doctor_id", doctorFilterId)
  }

  if (statusFilter && statusFilter !== "all") {
    appointmentsQuery.eq("status", statusFilter)
  }

  const [
    { data: appointments, error: appointmentsError },
    { data: doctors, error: doctorsError },
  ] = await Promise.all([
    appointmentsQuery
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true })
      .range(from, Math.min(to, PAGE_SCAN_LIMIT) - 1),
    supabase.from("profiles").select("id, full_name").eq("role", "doctor").order("full_name"),
  ])

  if (appointmentsError) {
    console.error("[v0] Error loading appointments list:", appointmentsError.message || appointmentsError)
  }

  if (doctorsError) {
    console.error("[v0] Error loading appointment doctors list:", doctorsError.message || doctorsError)
  }

  const doctorsById = new Map<string, string | null>()
  ;(doctors || []).forEach((doc: { id: string; full_name: string | null }) => {
    doctorsById.set(doc.id, doc.full_name)
  })

  const todaysAppointments = (appointments || []).filter(
    (apt: AppointmentRow) => apt.appointment_date === today,
  )

  // Show all other appointments (past or future) in the Upcoming section so newly
  // created appointments are always visible, even if there are date/time
  // discrepancies between client and server.
  const upcomingAppointments = (appointments || []).filter(
    (apt: AppointmentRow) => apt.appointment_date !== today,
  )
  const hasNextPage = (appointments?.length || 0) === PAGE_SIZE && !scanCapReached

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "default"
      case "confirmed":
        return "default"
      case "completed":
        return "secondary"
      case "cancelled":
        return "destructive"
      default:
        return "secondary"
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Appointments</h1>
          <p className="text-pretty text-muted-foreground">Manage patient appointments and schedules</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/appointments/new">
            <Plus className="mr-2 h-4 w-4" />
            New Appointment
          </Link>
        </Button>
      </div>

      <div className="mx-auto w-full max-w-4xl">
        <form method="GET" className="space-y-4 text-sm">
          {/* Row 1: Doctor / From / To */}
          <div className="grid gap-3 md:grid-cols-3 items-end">
            <div className="space-y-1">
              <label htmlFor="doctor_id" className="text-xs font-medium text-muted-foreground">
                Doctor
              </label>
              <select
                id="doctor_id"
                name="doctor_id"
                defaultValue={doctorFilterId || ""}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">All doctors</option>
                {(doctors || []).map((doc: { id: string; full_name: string | null }) => (
                  <option key={doc.id} value={doc.id}>
                    Dr. {doc.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
                From date
              </label>
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={fromDate}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                defaultValue={toDate}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </div>

          {/* Row 2: Status + Apply */}
          <div className="grid gap-3 md:grid-cols-3 items-end">
            <div className="space-y-1">
              <label htmlFor="status" className="text-xs font-medium text-muted-foreground">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={statusFilter || "all"}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="all">All statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div />
            <div className="flex justify-end">
              <Button type="submit" size="sm" variant="outline">
                Apply filters
              </Button>
            </div>
          </div>
        </form>
      </div>
      {scanCapReached ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Showing the first {PAGE_SCAN_LIMIT} matching appointments. Narrow your filters to inspect older records.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Today’s Appointments</CardTitle>
              <CardDescription>
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/appointments">
                <Calendar className="mr-2 h-4 w-4" />
                View All
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <TableCard title="Today’s Appointments" description="All appointments scheduled for today">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {todaysAppointments && todaysAppointments.length > 0 ? (
                  todaysAppointments.map((appointment: AppointmentRow) => (
                    <TableRow key={appointment.id}>
                      <TableCell className="font-medium">{appointment.appointment_time}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{normalizePatient(appointment.patients)?.full_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {normalizePatient(appointment.patients)?.patient_number}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{doctorsById.get(appointment.doctor_id) ?? "-"}</TableCell>
                      <TableCell>{appointment.reason || "General consultation"}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(appointment.status)}>{appointment.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/appointments/${appointment.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No appointments scheduled for today
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableCard>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Upcoming Appointments</CardTitle>
              <CardDescription>Appointments scheduled after today</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TableCard title="Upcoming Appointments" description="Future scheduled appointments">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingAppointments && upcomingAppointments.length > 0 ? (
                  upcomingAppointments.map((appointment: AppointmentRow) => (
                    <TableRow key={appointment.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(appointment.appointment_date).toLocaleDateString("en-US", {
                          weekday: "short",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="font-medium">{appointment.appointment_time}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{normalizePatient(appointment.patients)?.full_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {normalizePatient(appointment.patients)?.patient_number}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{doctorsById.get(appointment.doctor_id) ?? "-"}</TableCell>
                      <TableCell>{appointment.reason || "General consultation"}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(appointment.status)}>{appointment.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/appointments/${appointment.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No upcoming appointments
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="mt-4 flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                Page {currentPage}
                {scanCapReached ? ` of max ${Math.ceil(PAGE_SCAN_LIMIT / PAGE_SIZE)}` : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="outline" disabled={currentPage <= 1}>
                  <Link href={buildPageHref(currentPage - 1)}>Previous</Link>
                </Button>
                <Button asChild size="sm" variant="outline" disabled={!hasNextPage}>
                  <Link href={buildPageHref(currentPage + 1)}>Next</Link>
                </Button>
              </div>
            </div>
          </TableCard>
        </CardContent>
      </Card>
    </div>
  )
}
