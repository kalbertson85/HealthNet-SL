import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { shouldSendSms, sendSms } from "@/lib/notifications/sms"

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams?: Promise<{ patient_id?: string; error?: string }>
}) {
  const supabase = await createServerClient()
  const sp = searchParams ? await searchParams : {}

  // Fetch patients and doctors
  const [{ data: patients }, { data: doctors }] = await Promise.all([
    supabase.from("patients").select("id, full_name, patient_number").eq("status", "active").order("full_name"),
    supabase.from("profiles").select("id, full_name").eq("role", "doctor").order("full_name"),
  ])

  async function createAppointment(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect("/auth/login")
    }

    const appointmentDate = (formData.get("appointment_date") as string | null) ?? ""
    const appointmentTime = (formData.get("appointment_time") as string | null) ?? ""

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
      patient_id: formData.get("patient_id") as string,
      doctor_id: formData.get("doctor_id") as string,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      reason: formData.get("reason") as string,
      notes: formData.get("notes") as string,
      status: "scheduled",
      created_by: user.id,
    }

    const { data, error } = await supabase.from("appointments").insert(appointmentData).select().single()

    if (error) {
      console.error("[v0] Error creating appointment:", error)
      throw error
    }

    try {
      await supabase.from("appointment_audit_logs").insert({
        appointment_id: data.id,
        actor_user_id: user.id,
        patient_id: appointmentData.patient_id,
        doctor_id: appointmentData.doctor_id,
        action: "created",
        old_status: null,
        new_status: appointmentData.status,
      })
    } catch (auditError) {
      console.error("[v0] Error logging appointment creation:", auditError)
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
            <h1 className="text-balance text-3xl font-bold tracking-tight">Schedule New Appointment</h1>
            <p className="text-pretty text-muted-foreground">Book a new appointment for a patient</p>
          </div>
        </div>
      </div>

      <form action={createAppointment}>
        <Card>
          <CardHeader>
            <CardTitle>Appointment Details</CardTitle>
            <CardDescription>Select patient, doctor, and appointment time</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Patient *</Label>
                <Select name="patient_id" defaultValue={sp.patient_id} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients?.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.full_name} ({patient.patient_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Doctor *</Label>
                <Select name="doctor_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors?.map((doctor) => (
                      <SelectItem key={doctor.id} value={doctor.id}>
                        Dr. {doctor.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment_date">Appointment Date *</Label>
                <Input
                  id="appointment_date"
                  name="appointment_date"
                  type="date"
                  min={new Date().toISOString().split("T")[0]}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment_time">Appointment Time *</Label>
                <Input id="appointment_time" name="appointment_time" type="time" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Visit</Label>
              <Input id="reason" name="reason" placeholder="e.g., General checkup, Follow-up, etc." />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea id="notes" name="notes" placeholder="Any additional information..." rows={3} />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/appointments">Cancel</Link>
          </Button>
          <Button type="submit">Schedule Appointment</Button>
        </div>
      </form>
    </div>
  )
}
