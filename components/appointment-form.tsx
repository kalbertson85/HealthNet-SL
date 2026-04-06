"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormDraftStatus } from "@/components/form-draft-status"
import { FormHelpTip } from "@/components/form-help-tip"
import { useLocalDraft } from "@/lib/use-local-draft"

interface AppointmentOption {
  id: string
  full_name: string | null
  patient_number?: string | null
}

interface AppointmentFormState {
  patient_id: string
  doctor_id: string
  appointment_date: string
  appointment_time: string
  reason: string
  notes: string
}

export function AppointmentForm({
  patients,
  doctors,
  defaultPatientId,
  defaultReason,
  defaultNotes,
  action,
}: {
  patients: AppointmentOption[]
  doctors: AppointmentOption[]
  defaultPatientId?: string
  defaultReason?: string
  defaultNotes?: string
  action: (formData: FormData) => void | Promise<void>
}) {
  const initialValue: AppointmentFormState = {
    patient_id: defaultPatientId || "",
    doctor_id: "",
    appointment_date: "",
    appointment_time: "",
    reason: defaultReason || "",
    notes: defaultNotes || "",
  }

  const { value, setValue, lastSavedAt, resetDraft } = useLocalDraft("draft:appointments:new", initialValue)
  const [isSubmitting, setIsSubmitting] = useState(false)

  return (
    <>
      <FormDraftStatus lastSavedAt={lastSavedAt} onClear={resetDraft} />

      <form
        action={async (formData) => {
          setIsSubmitting(true)
          await action(formData)
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Appointment Details</CardTitle>
            <CardDescription>Select patient, doctor, and appointment time</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <input type="hidden" name="patient_id" value={value.patient_id} />
            <input type="hidden" name="doctor_id" value={value.doctor_id} />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label>Patient *</Label>
                  <FormHelpTip text="Choose the patient who will attend this visit. Use the active patient list only." />
                </div>
                <Select value={value.patient_id} onValueChange={(next) => setValue({ ...value, patient_id: next })} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.full_name} ({patient.patient_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label>Doctor *</Label>
                  <FormHelpTip text="Assign the clinician responsible for seeing the patient." />
                </div>
                <Select value={value.doctor_id} onValueChange={(next) => setValue({ ...value, doctor_id: next })} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((doctor) => (
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
                  value={value.appointment_date}
                  onChange={(e) => setValue({ ...value, appointment_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment_time">Appointment Time *</Label>
                <Input
                  id="appointment_time"
                  name="appointment_time"
                  type="time"
                  value={value.appointment_time}
                  onChange={(e) => setValue({ ...value, appointment_time: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="reason">Reason for Visit</Label>
                <FormHelpTip text="Capture the main complaint or service requested so triage and reporting stay clear." />
              </div>
              <Input
                id="reason"
                name="reason"
                placeholder="e.g., General checkup, Follow-up, etc."
                value={value.reason}
                onChange={(e) => setValue({ ...value, reason: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="notes">Additional Notes</Label>
                <FormHelpTip text="Include instructions such as fasting, referral notes, or special preparation." />
              </div>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Any additional information..."
                rows={3}
                value={value.notes}
                onChange={(e) => setValue({ ...value, notes: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/appointments">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Scheduling..." : "Schedule Appointment"}
          </Button>
        </div>
      </form>
    </>
  )
}
