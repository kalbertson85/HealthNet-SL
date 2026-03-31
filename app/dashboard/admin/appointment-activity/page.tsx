import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { ROLES } from "@/lib/utils"

export const revalidate = 0

interface AppointmentAuditRow {
  id: string
  created_at: string
  action: string
  old_status: string | null
  new_status: string | null
  actor_user_id: string
  appointment_id: string
  patient_id: string | null
  doctor_id: string | null
}

interface ActorProfile {
  id: string
  full_name: string | null
  role: string | null
}

interface PatientLite {
  id: string
  full_name: string | null
  patient_number: string | null
}

interface AppointmentActivitySearchParams {
  actor?: string
  doctor?: string
  patient?: string
  action?: string
  from?: string
  to?: string
  page?: string
}

export default async function AppointmentActivityPage({
  searchParams,
}: {
  searchParams?: Promise<AppointmentActivitySearchParams>
}) {
  const PAGE_SIZE = 50
  const supabase = await createServerClient()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const role = profile?.role ?? user.role
  if (role !== ROLES.ADMIN && role !== ROLES.FACILITY_ADMIN) {
    redirect("/dashboard")
  }

  const sp = searchParams ? await searchParams : {}

  const actorFilter = (sp.actor || "").trim() || null
  const doctorFilter = (sp.doctor || "").trim() || null
  const patientFilter = (sp.patient || "").trim() || null
  const actionFilter = (sp.action || "").trim() || null
  const fromFilter = (sp.from || "").trim() || null
  const toFilter = (sp.to || "").trim() || null
  const currentPage = Math.max(1, Number.parseInt(sp.page || "1", 10) || 1)
  const offset = (currentPage - 1) * PAGE_SIZE

  let query = supabase
    .from("appointment_audit_logs")
    .select("id, created_at, action, old_status, new_status, actor_user_id, appointment_id, patient_id, doctor_id")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (actorFilter) {
    query = query.eq("actor_user_id", actorFilter)
  }
  if (doctorFilter) {
    query = query.eq("doctor_id", doctorFilter)
  }
  if (patientFilter) {
    query = query.eq("patient_id", patientFilter)
  }
  if (actionFilter) {
    query = query.eq("action", actionFilter)
  }
  if (fromFilter) {
    query = query.gte("created_at", fromFilter)
  }
  if (toFilter) {
    query = query.lte("created_at", toFilter)
  }

  const { data, error } = await query

  if (error) {
    console.error("[v0] Error loading appointment activity list:", error.message || error)
  }

  const rows = (data || []) as AppointmentAuditRow[]
  const hasNextPage = rows.length === PAGE_SIZE

  const actorProfilesById = new Map<string, ActorProfile>()
  const patientsById = new Map<string, PatientLite>()
  const doctorsById = new Map<string, ActorProfile>()

  const actorIds = Array.from(new Set(rows.map((r) => r.actor_user_id).filter(Boolean)))
  const patientIds = Array.from(new Set(rows.map((r) => r.patient_id).filter(Boolean))) as string[]
  const doctorIds = Array.from(new Set(rows.map((r) => r.doctor_id).filter(Boolean))) as string[]

  if (actorIds.length > 0 || doctorIds.length > 0 || patientIds.length > 0) {
    const [actorRes, doctorRes, patientRes] = await Promise.all([
      actorIds.length
        ? supabase.from("profiles").select("id, full_name, role").in("id", actorIds)
        : Promise.resolve({ data: null, error: null }),
      doctorIds.length
        ? supabase.from("profiles").select("id, full_name, role").in("id", doctorIds)
        : Promise.resolve({ data: null, error: null }),
      patientIds.length
        ? supabase.from("patients").select("id, full_name, patient_number").in("id", patientIds)
        : Promise.resolve({ data: null, error: null }),
    ])

    if (actorRes.data) {
      ;(actorRes.data as ActorProfile[]).forEach((actor) => {
        actorProfilesById.set(actor.id, actor)
      })
    }

    if (doctorRes.data) {
      ;(doctorRes.data as ActorProfile[]).forEach((doc) => {
        doctorsById.set(doc.id, doc)
      })
    }

    if (patientRes.data) {
      ;(patientRes.data as PatientLite[]).forEach((p) => {
        patientsById.set(p.id, p)
      })
    }
  }

  const formatDateTime = (value: string | null) => {
    if (!value) return ""
    try {
      return new Date(value).toLocaleString()
    } catch {
      return value
    }
  }

  const renderActor = (actorId: string) => {
    const actor = actorProfilesById.get(actorId)
    if (!actor) return actorId
    if (actor.role) {
      return `${actor.full_name ?? "Unknown"} (${actor.role})`
    }
    return actor.full_name ?? actorId
  }

  const renderDoctor = (doctorId: string | null) => {
    if (!doctorId) return "-"
    const doc = doctorsById.get(doctorId)
    if (!doc) return doctorId
    return doc.full_name ? `Dr. ${doc.full_name}` : doctorId
  }

  const renderPatient = (patientId: string | null) => {
    if (!patientId) return "-"
    const p = patientsById.get(patientId)
    if (!p) return patientId
    if (p.patient_number) {
      return `${p.full_name ?? "Unknown"} (${p.patient_number})`
    }
    return p.full_name ?? patientId
  }

  const buildQueryString = (extra?: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams()
    if (actorFilter) params.set("actor", actorFilter)
    if (doctorFilter) params.set("doctor", doctorFilter)
    if (patientFilter) params.set("patient", patientFilter)
    if (actionFilter) params.set("action", actionFilter)
    if (fromFilter) params.set("from", fromFilter)
    if (toFilter) params.set("to", toFilter)
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (value === undefined) continue
        params.set(key, String(value))
      }
    }
    const qs = params.toString()
    return qs ? `?${qs}` : ""
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Admin
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Appointment activity</h1>
            <p className="text-muted-foreground">
              Read-only view of appointment lifecycle events (created, status changes, cancellations).
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by actor, doctor, patient, action type, and date range.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mx-auto w-full max-w-4xl">
            <form method="GET" className="space-y-4 text-sm">
              {/* Row 1: Actor / Doctor / Patient */}
              <div className="grid gap-3 md:grid-cols-3 items-end">
                <div className="space-y-1">
                  <label htmlFor="actor" className="text-xs font-medium text-muted-foreground">
                    Actor user ID
                  </label>
                  <input
                    id="actor"
                    name="actor"
                    defaultValue={actorFilter || ""}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="doctor" className="text-xs font-medium text-muted-foreground">
                    Doctor ID
                  </label>
                  <input
                    id="doctor"
                    name="doctor"
                    defaultValue={doctorFilter || ""}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="patient" className="text-xs font-medium text-muted-foreground">
                    Patient ID
                  </label>
                  <input
                    id="patient"
                    name="patient"
                    defaultValue={patientFilter || ""}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>

              {/* Row 2: Action / From / To + Apply */}
              <div className="grid gap-3 md:grid-cols-3 items-end">
                <div className="space-y-1">
                  <label htmlFor="action" className="text-xs font-medium text-muted-foreground">
                    Action type
                  </label>
                  <select
                    id="action"
                    name="action"
                    defaultValue={actionFilter || ""}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">All</option>
                    <option value="created">Created</option>
                    <option value="status_updated">Status updated</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
                    From
                  </label>
                  <input
                    id="from"
                    name="from"
                    type="datetime-local"
                    defaultValue={fromFilter || ""}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="to" className="text-xs font-medium text-muted-foreground">
                    To
                  </label>
                  <input
                    id="to"
                    name="to"
                    type="datetime-local"
                    defaultValue={toFilter || ""}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" size="sm">
                  Apply filters
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Recent appointment activity</CardTitle>
              <CardDescription>Showing up to 200 matching entries.</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/api/admin/appointment-activity${buildQueryString()}`} prefetch={false}>
                Export CSV
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Status change</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Appointment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                      No appointment activity found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/50">
                      <TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</TableCell>
                      <TableCell className="text-xs capitalize">{row.action.replace("_", " ")}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex flex-col gap-0.5">
                          <span>{renderPatient(row.patient_id)}</span>
                          {row.patient_id && (
                            <Button
                              asChild
                              size="sm"
                              variant="link"
                              className="h-5 px-0 text-[11px] text-blue-600"
                            >
                              <Link href={`/dashboard/patients/${row.patient_id}`}>View patient</Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex flex-col gap-0.5">
                          <span>{renderDoctor(row.doctor_id)}</span>
                          {row.doctor_id && (
                            <Button
                              asChild
                              size="sm"
                              variant="link"
                              className="h-5 px-0 text-[11px] text-blue-600"
                            >
                              <Link href={`/dashboard/admin/audit-logs?target=${encodeURIComponent(row.doctor_id)}`}>
                                View doctor activity
                              </Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.old_status || row.new_status
                          ? `
                        ${row.old_status ?? "(none)"}  a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0 a0to ${row.new_status ?? "(unchanged)"}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{renderActor(row.actor_user_id)}</TableCell>
                      <TableCell className="text-xs">
                        <Button asChild size="sm" variant="link" className="h-6 px-0 text-[11px]">
                          <Link href={`/dashboard/appointments/${row.appointment_id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {currentPage}
              {rows.length > 0 && `  b7 Showing ${rows.length} event${rows.length === 1 ? "" : "s"}`}
            </span>
            <div className="flex gap-2">
              <Button
                asChild
                size="sm"
                variant="outline"
                disabled={currentPage <= 1}
              >
                <Link href={`/dashboard/admin/appointment-activity${buildQueryString({ page: currentPage - 1 })}`}>
                  Previous
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                disabled={!hasNextPage}
              >
                <Link href={`/dashboard/admin/appointment-activity${buildQueryString({ page: currentPage + 1 })}`}>
                  Next
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
