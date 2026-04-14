import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { shouldSendSms, sendSms } from "@/lib/notifications/sms"
import { AppointmentForm } from "@/components/appointment-form"
import { requireServerActionPermission } from "@/lib/server-action-security"
import { z } from "zod"

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams?: Promise<{
    patient_id?: string
    error?: string
    reason?: string
    notes?: string
    source?: string
    visit_id?: string
    admission_id?: string
  }>
}) {
  const supabase = await createServerClient()
  const sp = searchParams ? await searchParams : {}
  const defaultReason = ((sp.reason as string | undefined) || "").trim()
  const source = ((sp.source as string | undefined) || "").trim()
  const visitId = ((sp.visit_id as string | undefined) || "").trim()
  const admissionId = ((sp.admission_id as string | undefined) || "").trim()
  const contextualNotes = ((sp.notes as string | undefined) || "").trim()

  const defaultNotes = (() => {
    const lines = [contextualNotes]
    if (source === "inpatient_discharge") lines.push("Follow-up after inpatient discharge.")
    if (source === "surgery") lines.push("Post-surgery review.")
    if (source === "nursing") lines.push("Follow-up requested from nursing workflow.")
    if (source === "appointment_review") lines.push("Scheduled as a follow-up review appointment.")
    if (admissionId) lines.push(`Admission ID: ${admissionId}`)
    if (visitId) lines.push(`Visit ID: ${visitId}`)
    return lines.filter(Boolean).join("\n")
  })()

  // Fetch patients and doctors
  const [{ data: patients }, { data: doctors }] = await Promise.all([
    supabase.from("patients").select("id, full_name, patient_number").eq("status", "active").order("full_name"),
    supabase.from("profiles").select("id, full_name").eq("role", "doctor").order("full_name"),
  ])

  async function createAppointment(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("appointments.manage")
    const parsed = z
      .object({
        patient_id: z.string().uuid(),
        doctor_id: z.string().uuid(),
        appointment_date: z.string().min(1),
        appointment_time: z.string().min(1),
        reason: z.string().trim().max(2000).optional(),
        notes: z.string().trim().max(5000).optional(),
      })
      .safeParse({
        patient_id: formData.get("patient_id"),
        doctor_id: formData.get("doctor_id"),
        appointment_date: formData.get("appointment_date"),
        appointment_time: formData.get("appointment_time"),
        reason: formData.get("reason"),
        notes: formData.get("notes"),
      })
    if (!parsed.success) {
      redirect("/dashboard/appointments/new?error=invalid_datetime")
    }

    const appointmentDate = parsed.data.appointment_date
    const appointmentTime = parsed.data.appointment_time

    if (!appointmentDate || !appointmentTime) {
      console.error("[v0] Cannot create appointment: missing date or time", {
        appointmentDate,
        appointmentTime,
      })
      redirect("/dashboard/appointments/new?error=invalid_datetime")
    }

    const today = new Date()
    const selectedDate = new Date(appointmentDate)
    const isPastDate = selectedDate.setHours(0, 0, 0, 0) < today.setHours(0, 0, 0, 0)

    if (Number.isNaN(selectedDate.getTime()) || isPastDate) {
      console.error("[v0] Cannot create appointment: invalid or past date", {
        appointmentDate,
      })
      redirect("/dashboard/appointments/new?error=invalid_date")
    }

    const appointmentData = {
      patient_id: parsed.data.patient_id,
      doctor_id: parsed.data.doctor_id,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      reason: parsed.data.reason ?? "",
      notes: parsed.data.notes ?? "",
      status: "scheduled",
      created_by: user.id,
    }

    const { data, error } = await supabase.from("appointments").insert(appointmentData).select().single()

    if (error) {
      console.error("[v0] Error creating appointment:", error)
      redirect("/dashboard/appointments/new?error=create_failed")
    }

    const { error: auditError } = await supabase.from("appointment_audit_logs").insert({
      appointment_id: data.id,
      actor_user_id: user.id,
      patient_id: appointmentData.patient_id,
      doctor_id: appointmentData.doctor_id,
      action: "created",
      old_status: null,
      new_status: appointmentData.status,
    })
    if (auditError) {
      await supabase.from("appointments").delete().eq("id", data.id)
      redirect("/dashboard/appointments/new?error=audit_log_failed")
    }

    // Optional SMS appointment reminder to patient
    if (user?.id) {
      const { data: patient } = await supabase
        .from("patients")
        .select("phone_number, full_name")
        .eq("id", appointmentData.patient_id)
        .maybeSingle()

      if (patient?.phone_number) {
        const canSms = await shouldSendSms(user.id, "appointment_reminder")
        if (canSms) {
          const date = appointmentData.appointment_date
          const time = appointmentData.appointment_time
          const message = `Appointment scheduled for ${date} at ${time} at the facility.`
          void sendSms(patient.phone_number, message)
        }
      }
    }

    redirect(`/dashboard/appointments/${data.id}`)
  }

  const errorMessage = (() => {
    switch (sp.error) {
      case "invalid_datetime":
        return "Please provide both an appointment date and time."
      case "invalid_date":
        return "Appointment date must be today or later."
      case "create_failed":
        return "Appointment could not be created."
      case "audit_log_failed":
        return "Appointment creation was rolled back because audit logging failed."
      default:
        return null
    }
  })()

  const contextMessage = (() => {
    switch (source) {
      case "inpatient_discharge":
        return "This appointment is being booked as discharge follow-up. Keep the review reason and visit references so the next team can continue care cleanly."
      case "surgery":
        return "This appointment is being booked as post-surgery follow-up. Confirm the review timing and keep the visit reference in the notes."
      case "nursing":
        return "This appointment was started from nursing workflow. Use it when ward or bedside care needs a planned outpatient review."
      case "billing":
        return "This appointment is being booked after billing completion. Keep the visit reference so the next team can trace the earlier encounter."
      case "pharmacy":
        return "This appointment is being booked after dispensing. Use it for medication review, response checks, or further clinical follow-up."
      case "extended_care":
        return "This appointment continues care after inpatient, surgical, or ward treatment. Keep the admission and visit references intact."
      case "follow_up":
        return "This appointment continues a completed visit. Keep the linked references so future teams can trace the original encounter."
      case "appointment_review":
        return "This appointment is being scheduled as a follow-up to a completed appointment."
      default:
        return null
    }
  })()

  const pageTitle = source ? "Schedule Follow-up Appointment" : "Schedule New Appointment"
  const pageDescription = source
    ? "Book the next planned review while preserving the earlier visit or admission context."
    : "Book a new appointment for a patient"

  return (
    <div className="space-y-8">
      {errorMessage && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}
      {contextMessage && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {contextMessage}
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
            <h1 className="text-balance text-3xl font-bold tracking-tight">{pageTitle}</h1>
            <p className="text-pretty text-muted-foreground">{pageDescription}</p>
          </div>
        </div>
      </div>

      <AppointmentForm
        patients={patients || []}
        doctors={doctors || []}
        defaultPatientId={sp.patient_id}
        defaultReason={defaultReason}
        defaultNotes={defaultNotes}
        action={createAppointment}
      />
    </div>
  )
}
