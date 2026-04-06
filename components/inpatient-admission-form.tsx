"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormDraftStatus } from "@/components/form-draft-status"
import { FormHelpTip } from "@/components/form-help-tip"
import { useLocalDraft } from "@/lib/use-local-draft"

interface PatientOption {
  id: string
  full_name: string | null
  patient_number: string | null
}

interface DoctorOption {
  id: string
  full_name: string | null
}

interface WardOption {
  id: string
  name: string | null
  ward_number: string | null
}

interface BedOption {
  id: string
  ward_id: string | null
  bed_number: string | null
  bed_type: string | null
}

interface AdmissionDraft {
  patient_id: string
  doctor_id: string
  bed_id: string
  admission_date: string
  emergency_admission: boolean
  admission_reason: string
  diagnosis: string
  treatment_plan: string
}

export function InpatientAdmissionForm({
  patients,
  doctors,
  wards,
  beds,
  defaultPatientId,
  defaultVisitId,
  action,
}: {
  patients: PatientOption[]
  doctors: DoctorOption[]
  wards: WardOption[]
  beds: BedOption[]
  defaultPatientId?: string
  defaultVisitId?: string
  action: (formData: FormData) => void | Promise<void>
}) {
  const initialValue: AdmissionDraft = {
    patient_id: defaultPatientId || "",
    doctor_id: "",
    bed_id: "",
    admission_date: new Date().toISOString().slice(0, 16),
    emergency_admission: false,
    admission_reason: "",
    diagnosis: "",
    treatment_plan: "",
  }

  const { value, setValue, lastSavedAt, resetDraft } = useLocalDraft("draft:inpatient:new", initialValue)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const update = <K extends keyof AdmissionDraft>(field: K, fieldValue: AdmissionDraft[K]) => {
    setValue({ ...value, [field]: fieldValue })
  }

  return (
    <>
      <FormDraftStatus
        title="Admission draft"
        description="Admission details are saved locally on this device while you complete the bed and treatment plan."
        lastSavedAt={lastSavedAt}
        onClear={resetDraft}
      />

      <form
        action={async (formData) => {
          setIsSubmitting(true)
          await action(formData)
        }}
      >
        <input type="hidden" name="visit_id" value={defaultVisitId || ""} />
        <input type="hidden" name="patient_id" value={value.patient_id} />
        <input type="hidden" name="doctor_id" value={value.doctor_id} />
        <input type="hidden" name="bed_id" value={value.bed_id} />
        <input type="hidden" name="emergency_admission" value={value.emergency_admission ? "on" : ""} />

        <Card>
          <CardHeader>
            <CardTitle>Admission Details</CardTitle>
            <CardDescription>Patient placement and initial inpatient plan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label>Patient *</Label>
                  <FormHelpTip text="Choose the patient being admitted so the ward and bed assignment ties back to the correct chart and visit." />
                </div>
                <Select value={value.patient_id} onValueChange={(next) => update("patient_id", next)} required>
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
                  <Label>Admitting Doctor *</Label>
                  <FormHelpTip text="Assign the clinician accountable for the admission decision and initial plan." />
                </div>
                <Select value={value.doctor_id} onValueChange={(next) => update("doctor_id", next)} required>
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
                <div className="flex items-center gap-1">
                  <Label>Bed Assignment *</Label>
                  <FormHelpTip text="Choose an available bed. The bed will be marked occupied automatically when the admission is saved." />
                </div>
                <Select value={value.bed_id} onValueChange={(next) => update("bed_id", next)} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select bed" />
                  </SelectTrigger>
                  <SelectContent>
                    {beds.map((bed) => {
                      const ward = wards.find((currentWard) => currentWard.id === bed.ward_id)
                      return (
                        <SelectItem key={bed.id} value={bed.id}>
                          {ward?.name} - Bed {bed.bed_number} ({bed.bed_type})
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admission_date">Admission Date *</Label>
                <Input
                  id="admission_date"
                  name="admission_date"
                  type="datetime-local"
                  value={value.admission_date}
                  onChange={(e) => update("admission_date", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="emergency_admission"
                checked={value.emergency_admission}
                onCheckedChange={(checked) => update("emergency_admission", checked === true)}
              />
              <Label htmlFor="emergency_admission" className="text-sm font-normal">
                Emergency Admission
              </Label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="admission_reason">Reason for Admission *</Label>
                <FormHelpTip text="Record the main reason for admission so bed use, inpatient metrics, and clinical handover remain clear." />
              </div>
              <Textarea
                id="admission_reason"
                name="admission_reason"
                placeholder="Brief reason for admission..."
                rows={2}
                value={value.admission_reason}
                onChange={(e) => update("admission_reason", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="diagnosis">Provisional Diagnosis</Label>
              <Textarea
                id="diagnosis"
                name="diagnosis"
                placeholder="Provisional or confirmed diagnosis..."
                rows={2}
                value={value.diagnosis}
                onChange={(e) => update("diagnosis", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="treatment_plan">Treatment Plan</Label>
              <Textarea
                id="treatment_plan"
                name="treatment_plan"
                placeholder="Initial treatment plan..."
                rows={3}
                value={value.treatment_plan}
                onChange={(e) => update("treatment_plan", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/inpatient">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Admitting..." : "Admit Patient"}
          </Button>
        </div>
      </form>
    </>
  )
}
