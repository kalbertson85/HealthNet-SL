"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { FormDraftStatus } from "@/components/form-draft-status"
import { FormHelpTip } from "@/components/form-help-tip"
import { useLocalDraft } from "@/lib/use-local-draft"

interface SurgeryDraft {
  procedure_name: string
  procedure_type: string
  scheduled_at: string
  notes: string
}

export function SurgeryCreateForm({
  visitId,
  patientId,
  action,
}: {
  visitId: string
  patientId: string
  action: (formData: FormData) => void | Promise<void>
}) {
  const initialValue: SurgeryDraft = {
    procedure_name: "",
    procedure_type: "",
    scheduled_at: "",
    notes: "",
  }

  const { value, setValue, lastSavedAt, resetDraft } = useLocalDraft("draft:surgery:new", initialValue)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const update = <K extends keyof SurgeryDraft>(field: K, fieldValue: SurgeryDraft[K]) => {
    setValue({ ...value, [field]: fieldValue })
  }

  return (
    <>
      <FormDraftStatus
        title="Surgery draft"
        description="Procedure details are saved locally on this device until the surgery record is created."
        lastSavedAt={lastSavedAt}
        onClear={resetDraft}
      />

      <form
        action={async (formData) => {
          setIsSubmitting(true)
          await action(formData)
        }}
        className="space-y-6"
      >
        <input type="hidden" name="visit_id" value={visitId} />
        <input type="hidden" name="patient_id" value={patientId} />

        <Card>
          <CardHeader>
            <CardTitle>Procedure Details</CardTitle>
            <CardDescription>Key information about this surgery.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="procedure_name">Procedure name *</Label>
                <FormHelpTip text="Use the standard operation name that should appear in the surgical log and patient record." />
              </div>
              <Input
                id="procedure_name"
                name="procedure_name"
                required
                placeholder="e.g. Appendectomy"
                value={value.procedure_name}
                onChange={(e) => update("procedure_name", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="procedure_type">Procedure type (optional)</Label>
                <FormHelpTip text="Use this for classification such as emergency or elective so theatre demand is easier to review later." />
              </div>
              <Input
                id="procedure_type"
                name="procedure_type"
                placeholder="e.g. Emergency, Elective"
                value={value.procedure_type}
                onChange={(e) => update("procedure_type", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scheduled_at">Scheduled date &amp; time (optional)</Label>
              <Input
                id="scheduled_at"
                name="scheduled_at"
                type="datetime-local"
                value={value.scheduled_at}
                onChange={(e) => update("scheduled_at", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="notes">Notes (optional)</Label>
                <FormHelpTip text="Capture planning details, surgical concerns, or handover notes for the theatre team." />
              </div>
              <Textarea
                id="notes"
                name="notes"
                rows={4}
                placeholder="Key operative notes or planning details..."
                value={value.notes}
                onChange={(e) => update("notes", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/surgery">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Surgery"}
          </Button>
        </div>
      </form>
    </>
  )
}
