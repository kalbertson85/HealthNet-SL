import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Edit, User, Calendar, Clock, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { ensureActiveVisitForPatient, ensureQueueEntryForVisit } from "@/lib/visit-flow"
import { PatientWorkflowPanel } from "@/components/patient-workflow-panel"
import { requireServerActionPermission } from "@/lib/server-action-security"
import { z } from "zod"

interface AppointmentAuditRow {
  id: string
  created_at: string
  action: string
  old_status: string | null
  new_status: string | null
  actor_user_id: string
}

interface ActorProfile {
  id: string
  full_name: string | null
  role: string | null
}

export default async function AppointmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string }>
}) {
  const supabase = await createServerClient()
  const { id } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const errorCode = resolvedSearchParams?.error

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("id, patient_id, doctor_id, appointment_date, appointment_time, status, reason, notes")
    .eq("id", id)
    .maybeSingle()

  if (appointmentError) {
    console.error("[v0] Error loading appointment detail:", appointmentError.message || appointmentError)
  }

  let patient: { full_name?: string | null; patient_number?: string | null; phone_number?: string | null } | null =
    null
  let doctor: { full_name?: string | null; phone_number?: string | null } | null = null
  let linkedVisitId: string | null = null

  if (appointment) {
    const [{ data: patientData }, { data: doctorData }] = await Promise.all([
      supabase
        .from("patients")
        .select("full_name, patient_number, phone_number")
        .eq("id", appointment.patient_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name, phone_number")
        .eq("id", appointment.doctor_id)
        .maybeSingle(),
    ])

    patient = patientData || null
    doctor = doctorData || null

    if (appointment.status === "completed" && appointment.patient_id) {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)

      const { data: visitData } = await supabase
        .from("visits")
        .select("id")
        .eq("patient_id", appointment.patient_id)
        .gte("created_at", startOfDay.toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      linkedVisitId = (visitData?.id as string | null) ?? null
    }
  }

  let auditRows: AppointmentAuditRow[] = []
  const actorProfilesById = new Map<string, ActorProfile>()

  if (appointment) {
    const { data: logs, error: auditError } = await supabase
      .from("appointment_audit_logs")
      .select("id, created_at, action, old_status, new_status, actor_user_id")
      .eq("appointment_id", appointment.id)
      .order("created_at", { ascending: false })

    if (auditError) {
      console.error("[v0] Error loading appointment activity:", auditError.message || auditError)
    } else if (logs) {
      auditRows = logs as AppointmentAuditRow[]

      const distinctActorIds = Array.from(new Set(auditRows.map((r) => r.actor_user_id).filter(Boolean)))
      if (distinctActorIds.length > 0) {
        const { data: actorProfiles, error: actorError } = await supabase
          .from("profiles")
          .select("id, full_name, role")
          .in("id", distinctActorIds)

        if (actorError) {
          console.error("[v0] Error loading appointment activity actors:", actorError.message || actorError)
        } else if (actorProfiles) {
          ;(actorProfiles as ActorProfile[]).forEach((actor) => {
            actorProfilesById.set(actor.id, actor)
          })
        }
      }
    }
  }

  async function updateStatus(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("appointments.manage")
    const parsed = z
      .object({
        status: z.enum(["scheduled", "confirmed", "completed", "cancelled"]),
      })
      .safeParse({
        status: formData.get("status"),
      })
    if (!parsed.success) {
      redirect(`/dashboard/appointments/${id}`)
    }
    const status = parsed.data.status
    const oldStatus = formData.get("old_status") as string | null

    const { data: currentAppointment } = await supabase
      .from("appointments")
      .select("id, status")
      .eq("id", id)
      .maybeSingle()
    if (!currentAppointment) {
      redirect("/dashboard/appointments")
    }
    if (["completed", "cancelled"].includes((currentAppointment.status as string) ?? "")) {
      redirect(`/dashboard/appointments/${id}`)
    }

    const previousStatus = (currentAppointment.status as string | null) ?? null
    const { data: updatedAppointment, error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", id)
      .select("id, patient_id, appointment_date, doctor_id")
      .maybeSingle()

    if (error) {
      console.error("[v0] Error updating appointment status:", error.message || error)
      redirect(`/dashboard/appointments/${id}?error=status_update_failed`)
    }

    if (updatedAppointment) {
      const { error: auditError } = await supabase.from("appointment_audit_logs").insert({
        appointment_id: updatedAppointment.id,
        actor_user_id: user.id,
        patient_id: updatedAppointment.patient_id,
        doctor_id: updatedAppointment.doctor_id,
        action: status === "cancelled" ? "cancelled" : "status_updated",
        old_status: oldStatus ?? previousStatus,
        new_status: status,
      })
      if (auditError) {
        await supabase.from("appointments").update({ status: previousStatus }).eq("id", id)
        redirect(`/dashboard/appointments/${id}?error=audit_log_failed`)
      }
    }

    // When an appointment is marked completed, ensure a visit exists so it can flow into doctor and billing
    if (updatedAppointment && status === "completed") {
      try {
        const patientId = updatedAppointment.patient_id as string | null
        if (patientId) {
          const visitId = await ensureActiveVisitForPatient(supabase, patientId, { facilityCode: "opd" })
          if (visitId) {
            await ensureQueueEntryForVisit(supabase, {
              patientId,
              visitId,
              department: "opd",
              priority: "normal",
              notes: `Appointment completed on ${updatedAppointment.appointment_date}`,
            })
          }
        }
      } catch (visitCreateError) {
        console.error("[v0] Unexpected error while ensuring visit for completed appointment:", visitCreateError)
        await supabase.from("appointments").update({ status: previousStatus }).eq("id", id)
        redirect(`/dashboard/appointments/${id}?error=workflow_sync_failed`)
      }
    }

    redirect(`/dashboard/appointments/${id}`)
  }

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

  if (!appointment) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/appointments">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Appointments
              </Link>
            </Button>
            <div>
              <h1 className="text-balance text-3xl font-bold tracking-tight">Appointment not found</h1>
              <p className="text-pretty text-muted-foreground">
                We couldn&apos;t find details for this appointment. It may have been deleted or you may have an
                outdated link.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const isTerminalStatus = appointment.status === "completed" || appointment.status === "cancelled"

  const errorMessage = (() => {
    switch (errorCode) {
      case "status_update_failed":
        return "Appointment status could not be updated."
      case "audit_log_failed":
        return "Status update was rolled back because audit logging failed."
      case "workflow_sync_failed":
        return "Status update was rolled back because the downstream visit workflow sync failed."
      default:
        return null
    }
  })()

  return (
    <div className="space-y-8">
      {errorMessage && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/appointments">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Appointments
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">Appointment Details</h1>
            <p className="text-pretty text-muted-foreground">
              {new Date(appointment.appointment_date).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}{" "}
              at {appointment.appointment_time}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/dashboard/appointments/${appointment.id}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Status</CardTitle>
            <Badge variant={getStatusColor(appointment.status)}>{appointment.status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isTerminalStatus ? (
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-sm">
              <p className="text-muted-foreground">
                This appointment has been {appointment.status}. Status can no longer be changed. To make any
                adjustments, schedule a new appointment for this patient.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/dashboard/appointments/new?patient_id=${appointment.patient_id}&source=appointment_review&reason=${encodeURIComponent("Follow-up review")}&notes=${encodeURIComponent(`Previous appointment ID: ${appointment.id}`)}`}
                >
                  Schedule follow-up
                </Link>
              </Button>
            </div>
          ) : (
            <form action={updateStatus} className="flex gap-2">
              <input type="hidden" name="old_status" value={appointment.status} />
              <select
                name="status"
                aria-label="Appointment status"
                defaultValue={appointment.status}
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="scheduled">Scheduled</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <Button type="submit" size="sm">
                Update Status
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {appointment.status === "completed" ? (
        <PatientWorkflowPanel
          currentStage="triage"
          patientId={appointment.patient_id}
          visitId={linkedVisitId}
          title="Post-appointment workflow"
          description="Completed appointments should feed into the active visit workflow through triage and the OPD queue."
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Appointment activity</CardTitle>
        </CardHeader>
        <CardContent>
          {auditRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recorded activity yet for this appointment.</p>
          ) : (
            <div className="space-y-3 text-sm">
              {auditRows.map((log) => (
                <div key={log.id} className="flex flex-col gap-1 rounded-md border bg-muted/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium capitalize">{log.action.replace("_", " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                  {(log.old_status || log.new_status) && (
                    <p className="text-xs text-muted-foreground">
                      Status: {log.old_status ?? "(none)"} to {log.new_status ?? "(unchanged)"}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {(() => {
                      const actor = actorProfilesById.get(log.actor_user_id)
                      if (!actor) return `By: ${log.actor_user_id}`
                      if (actor.role) {
                        return `By: ${actor.full_name ?? "Unknown"} (${actor.role})`
                      }
                      return `By: ${actor.full_name ?? log.actor_user_id}`
                    })()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Patient Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Name</p>
              <p className="text-lg font-medium">{patient?.full_name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Patient Number</p>
              <p>{patient?.patient_number}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Phone</p>
              <p>{patient?.phone_number || "N/A"}</p>
            </div>
            <Button asChild variant="outline" size="sm" className="w-full bg-transparent">
              <Link href={`/dashboard/patients/${appointment.patient_id}`}>View Patient Profile</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Doctor Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Name</p>
              <p className="text-lg font-medium">Dr. {doctor?.full_name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Phone</p>
              <p>{doctor?.phone_number || "N/A"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appointment Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Date
              </p>
              <p className="text-lg">
                {new Date(appointment.appointment_date).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Time
              </p>
              <p className="text-lg">{appointment.appointment_time}</p>
            </div>
          </div>
          <Separator />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Reason for Visit</p>
            <p>{appointment.reason || "General consultation"}</p>
          </div>
          {appointment.notes && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Notes</p>
                <p className="text-sm">{appointment.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {appointment.status === "completed" && (
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {linkedVisitId ? (
              <Button asChild variant="outline">
                <Link href={`/dashboard/records/visit/${linkedVisitId}`}>Open visit handoff</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/dashboard/queue/opd">Open OPD queue</Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                href={`/dashboard/appointments/new?patient_id=${appointment.patient_id}&source=appointment_review&reason=${encodeURIComponent("Follow-up review")}&notes=${encodeURIComponent(`Previous appointment ID: ${appointment.id}`)}`}
              >
                Schedule follow-up
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
