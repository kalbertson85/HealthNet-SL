"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormDraftStatus } from "@/components/form-draft-status"
import { FormHelpTip } from "@/components/form-help-tip"
import { useLocalDraft } from "@/lib/use-local-draft"

interface PatientOption {
  id: string
  full_name: string | null
  patient_number: string | null
}

interface EmergencyDraft {
  patient_id: string
  triage_level: string
  arrival_mode: string
  ambulance_vehicle: string
  ambulance_crew: string
  ambulance_treatment: string
  ambulance_call_to_arrival: string
  chief_complaint: string
  notes: string
}

export function EmergencyIntakeForm({
  patients,
  action,
}: {
  patients: PatientOption[]
  action: (formData: FormData) => void | Promise<void>
}) {
  const initialValue: EmergencyDraft = {
    patient_id: "",
    triage_level: "red",
    arrival_mode: "",
    ambulance_vehicle: "",
    ambulance_crew: "",
    ambulance_treatment: "",
    ambulance_call_to_arrival: "",
    chief_complaint: "",
    notes: "",
  }

  const { value, setValue, lastSavedAt, resetDraft } = useLocalDraft("draft:emergency:new", initialValue)
  const [isSubmitting, setIsSubmitting] = useState(false)

  return (
    <>
      <FormDraftStatus
        title="Emergency intake draft"
        description="Emergency triage details are saved locally on this device until the case is submitted."
        lastSavedAt={lastSavedAt}
        onClear={resetDraft}
      />

      <form
        action={async (formData) => {
          setIsSubmitting(true)
          await action(formData)
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Emergency Details</CardTitle>
            <CardDescription>Select patient, triage level, and capture key information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <input type="hidden" name="patient_id" value={value.patient_id} />
            <input type="hidden" name="triage_level" value={value.triage_level} />
            <input type="hidden" name="arrival_mode" value={value.arrival_mode} />

            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="patient_id">Patient *</Label>
                <FormHelpTip text="Select the patient before recording triage so the emergency record links to the correct chart." />
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

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="triage_level">Triage Level *</Label>
                  <FormHelpTip text="Use the highest appropriate triage level based on the initial emergency assessment." />
                </div>
                <Select value={value.triage_level} onValueChange={(next) => setValue({ ...value, triage_level: next })} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select triage level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="red">Critical (Red)</SelectItem>
                    <SelectItem value="orange">Emergency (Orange)</SelectItem>
                    <SelectItem value="yellow">Urgent (Yellow)</SelectItem>
                    <SelectItem value="green">Minor (Green)</SelectItem>
                    <SelectItem value="blue">Non-Urgent (Blue)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="arrival_mode">Arrival Mode</Label>
                  <FormHelpTip text="Track whether the patient arrived by walk-in, ambulance, referral, or another route." />
                </div>
                <Select value={value.arrival_mode} onValueChange={(next) => setValue({ ...value, arrival_mode: next })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select arrival mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walk_in">Walk-in</SelectItem>
                    <SelectItem value="ambulance">Ambulance</SelectItem>
                    <SelectItem value="referred">Referred</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm font-medium">Ambulance details (optional)</p>
              <p className="text-xs text-muted-foreground">
                If the patient arrived by ambulance, capture handover details for audit and future reporting.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ambulance_vehicle">Ambulance / Vehicle ID</Label>
                  <Input
                    id="ambulance_vehicle"
                    name="ambulance_vehicle"
                    placeholder="e.g. AMB-01"
                    value={value.ambulance_vehicle}
                    onChange={(e) => setValue({ ...value, ambulance_vehicle: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ambulance_crew">Crew Name(s)</Label>
                  <Input
                    id="ambulance_crew"
                    name="ambulance_crew"
                    placeholder="e.g. Nurse Kargbo, Driver Conteh"
                    value={value.ambulance_crew}
                    onChange={(e) => setValue({ ...value, ambulance_crew: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ambulance_treatment">Pre-hospital treatment</Label>
                  <Textarea
                    id="ambulance_treatment"
                    name="ambulance_treatment"
                    rows={2}
                    placeholder="e.g. Oxygen, IV fluids, splinting"
                    value={value.ambulance_treatment}
                    onChange={(e) => setValue({ ...value, ambulance_treatment: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ambulance_call_to_arrival">Call to arrival time (min)</Label>
                  <Input
                    id="ambulance_call_to_arrival"
                    name="ambulance_call_to_arrival"
                    type="number"
                    min={0}
                    placeholder="e.g. 18"
                    value={value.ambulance_call_to_arrival}
                    onChange={(e) => setValue({ ...value, ambulance_call_to_arrival: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="chief_complaint">Chief Complaint *</Label>
                <FormHelpTip text="Record the main emergency complaint clearly so handover and prioritization stay accurate." />
              </div>
              <Textarea
                id="chief_complaint"
                name="chief_complaint"
                required
                rows={3}
                placeholder="Briefly describe the main issue or reason for emergency visit..."
                value={value.chief_complaint}
                onChange={(e) => setValue({ ...value, chief_complaint: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="notes">Additional Notes</Label>
                <FormHelpTip text="Add initial observations, vital signs, or any context that will help the receiving team." />
              </div>
              <Textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="Any additional observations, vital signs, or context..."
                value={value.notes}
                onChange={(e) => setValue({ ...value, notes: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/emergency">Cancel</Link>
          </Button>
          <Button type="submit" className="bg-red-600 hover:bg-red-700" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Emergency"}
          </Button>
        </div>
      </form>
    </>
  )
}
