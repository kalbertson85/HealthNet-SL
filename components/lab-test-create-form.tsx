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

interface PatientOption {
  id: string
  full_name: string | null
  patient_number: string | null
}

interface LabDraft {
  patient_id: string
  test_category: string
  test_type: string
  priority: string
  notes: string
}

export function LabTestCreateForm({
  patients,
  defaultPatientId,
  action,
}: {
  patients: PatientOption[]
  defaultPatientId?: string
  action: (formData: FormData) => void | Promise<void>
}) {
  const initialValue: LabDraft = {
    patient_id: defaultPatientId || "",
    test_category: "",
    test_type: "",
    priority: "routine",
    notes: "",
  }

  const { value, setValue, lastSavedAt, resetDraft } = useLocalDraft("draft:lab:new", initialValue)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const update = <K extends keyof LabDraft>(field: K, fieldValue: LabDraft[K]) => {
    setValue({ ...value, [field]: fieldValue })
  }

  return (
    <>
      <FormDraftStatus
        title="Lab order draft"
        description="Lab order details are saved locally on this device while you complete the request."
        lastSavedAt={lastSavedAt}
        onClear={resetDraft}
      />

      <form
        action={async (formData) => {
          setIsSubmitting(true)
          await action(formData)
        }}
      >
        <input type="hidden" name="patient_id" value={value.patient_id} />
        <input type="hidden" name="test_category" value={value.test_category} />
        <input type="hidden" name="priority" value={value.priority} />

        <Card>
          <CardHeader>
            <CardTitle>Test Details</CardTitle>
            <CardDescription>Select patient and test information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label>Patient *</Label>
                <FormHelpTip text="Choose the patient first so the order reaches the correct chart and downstream result queue." />
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

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label>Test Category *</Label>
                  <FormHelpTip text="Use the broad lab discipline first, then add the exact test name in the next field." />
                </div>
                <Select value={value.test_category} onValueChange={(next) => update("test_category", next)} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Hematology">Hematology</SelectItem>
                    <SelectItem value="Clinical Chemistry">Clinical Chemistry</SelectItem>
                    <SelectItem value="Microbiology">Microbiology</SelectItem>
                    <SelectItem value="Immunology">Immunology</SelectItem>
                    <SelectItem value="Urinalysis">Urinalysis</SelectItem>
                    <SelectItem value="Parasitology">Parasitology</SelectItem>
                    <SelectItem value="Blood Bank">Blood Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="test_type">Test Type *</Label>
                  <FormHelpTip text="Enter the exact requested test, for example Complete Blood Count or Malaria RDT." />
                </div>
                <Input
                  id="test_type"
                  name="test_type"
                  placeholder="e.g., Complete Blood Count"
                  value={value.test_type}
                  onChange={(e) => update("test_type", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Priority *</Label>
                <Select value={value.priority} onValueChange={(next) => update("priority", next)} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="routine">Routine</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="stat">STAT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="notes">Clinical Notes</Label>
                <FormHelpTip text="Include the clinical indication or relevant context so the lab team understands why the test is being ordered." />
              </div>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Clinical indication or additional information..."
                rows={3}
                value={value.notes}
                onChange={(e) => update("notes", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/lab">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Ordering..." : "Order Test"}
          </Button>
        </div>
      </form>
    </>
  )
}
