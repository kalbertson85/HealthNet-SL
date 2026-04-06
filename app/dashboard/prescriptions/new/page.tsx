"use client"

import type React from "react"
import { useState, useMemo, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormDraftStatus } from "@/components/form-draft-status"
import { FormHelpTip } from "@/components/form-help-tip"
import { useLocalDraft } from "@/lib/use-local-draft"

interface MedicationItem {
  medication_name: string
  dosage: string
  frequency: string
  duration: string
  quantity: number
  instructions: string
}

interface MedicationOption {
  id: string
  name: string
}

interface PrescriptionDraft {
  patientId: string
  visitId: string
  notes: string
  medications: MedicationItem[]
  newMedicineName: string
}

export default function NewPrescriptionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const supabase = useMemo(() => createClient(), [])

  const initialDraft: PrescriptionDraft = {
    patientId: searchParams.get("patient_id") || "",
    visitId: searchParams.get("visit_id") || "",
    notes: "",
    medications: [{ medication_name: "", dosage: "", frequency: "", duration: "", quantity: 1, instructions: "" }],
    newMedicineName: "",
  }
  const { value: draft, setValue: setDraft, lastSavedAt, resetDraft } = useLocalDraft("draft:prescriptions:new", initialDraft)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [catalogue, setCatalogue] = useState<MedicationOption[]>([])
  const [isLoadingCatalogue, setIsLoadingCatalogue] = useState(true)
  const [isAddingMedicine, setIsAddingMedicine] = useState(false)
  const [isCreatingMedicine, setIsCreatingMedicine] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadMedications = async () => {
      const { data, error } = await supabase.from("medications").select("id, name").order("name")
      if (cancelled) return
      if (error) {
        console.error("[v0] Error loading medication catalogue:", error.message || error)
        setCatalogue([])
      } else {
        setCatalogue((data || []) as MedicationOption[])
      }
      setIsLoadingCatalogue(false)
    }

    void loadMedications()

    return () => {
      cancelled = true
    }
  }, [supabase])

  const addMedication = () => {
    setDraft({
      ...draft,
      medications: [
        ...draft.medications,
        { medication_name: "", dosage: "", frequency: "", duration: "", quantity: 1, instructions: "" },
      ],
    })
  }

  const removeMedication = (index: number) => {
    setDraft({ ...draft, medications: draft.medications.filter((_, i) => i !== index) })
  }

  const updateMedication = (index: number, field: keyof MedicationItem, value: string | number) => {
    const updated = [...draft.medications]
    updated[index] = { ...updated[index], [field]: value }
    setDraft({ ...draft, medications: updated })
  }

  const handleQuickAddMedicine = async () => {
    const name = draft.newMedicineName.trim()
    if (!name) return

    setIsCreatingMedicine(true)
    try {
      const { data, error } = await supabase
        .from("medications")
        .insert({
          name,
          dosage_form: "unspecified",
          strength: "",
          unit: "unit",
          category: "Uncategorized",
          unit_price: 0,
        })
        .select("id, name")
        .single()

      if (error || !data) {
        console.error("[v0] Error quick-adding medication:", error || new Error("No data returned"))
        return
      }

      setCatalogue((prev) => {
        const next = [...prev, data as MedicationOption]
        next.sort((a, b) => a.name.localeCompare(b.name))
        return next
      })

      // If the first medication has no name yet, preselect this new medicine for convenience
      setDraft((current) => {
        if (current.medications.length === 0) {
          return {
            ...current,
            medications: [{ medication_name: name, dosage: "", frequency: "", duration: "", quantity: 1, instructions: "" }],
            newMedicineName: "",
          }
        }
        const copy = [...current.medications]
        if (!copy[0].medication_name) {
          copy[0] = { ...copy[0], medication_name: name }
        }
        return { ...current, medications: copy, newMedicineName: "" }
      })

      setIsAddingMedicine(false)
    } finally {
      setIsCreatingMedicine(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Generate a simple human-readable prescription number
      const generatedPrescriptionNumber = `RX-${Date.now().toString().slice(-6)}`
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login")
        return
      }

      const identifier = draft.patientId.trim()

      // Support either a raw patient UUID (patient_id) or a PT- style patient_number in the same field
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .select("id, patient_number")
        .eq(uuidRegex.test(identifier) ? "id" : "patient_number", identifier)
        .maybeSingle()

      if (patientError) {
        throw patientError
      }

      if (!patient) {
        throw new Error("No patient found with that patient number.")
      }

      // Create prescription (table currently does not have a medications column)
      const { data: prescription, error: prescriptionError } = await supabase
        .from("prescriptions")
        .insert({
          patient_id: patient.id,
          visit_id: draft.visitId || null,
          doctor_id: user.id,
          prescription_number: generatedPrescriptionNumber,
          notes: draft.notes,
          status: "pending",
        })
        .select()
        .single()

      if (prescriptionError) throw prescriptionError

      // Create prescription items
      const items = draft.medications.map((med) => ({
        prescription_id: prescription.id,
        ...med,
      }))

      const { error: itemsError } = await supabase.from("prescription_items").insert(items)

      if (itemsError) throw itemsError

      try {
        await supabase.from("pharmacy_audit_logs").insert({
          prescription_id: prescription.id,
          actor_user_id: user.id,
          action: "created",
          old_status: null,
          new_status: "pending",
          notes: draft.notes || null,
        })
      } catch (auditError) {
        console.error("[v0] Error logging prescription creation:", auditError)
      }

      resetDraft()
      router.push(`/dashboard/prescriptions/${prescription.id}`)
    } catch (error) {
      console.error("[v0] Error creating prescription:", error instanceof Error ? error.message : error)
      alert("Error creating prescription. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/prescriptions">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Prescriptions
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">Create New Prescription</h1>
            <p className="text-pretty text-muted-foreground">Add medications and instructions for a patient</p>
          </div>
        </div>
      </div>

      <FormDraftStatus lastSavedAt={lastSavedAt} onClear={resetDraft} />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Prescription Details</CardTitle>
            <CardDescription>Select patient and add general notes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="patient_id">Patient Number *</Label>
                <FormHelpTip text="Enter the patient number from the chart or patient profile so the prescription links correctly." />
              </div>
              <Input
                id="patient_id"
                value={draft.patientId}
                onChange={(e) => setDraft({ ...draft, patientId: e.target.value })}
                placeholder="Enter patient number (e.g., PT-000123)"
                required
              />
            </div>

            {draft.visitId ? (
              <div className="space-y-2">
                <Label htmlFor="visit_id" className="flex items-center gap-1">
                  Linked Visit
                  <FormHelpTip text="This prescription will be tied to the active visit so pharmacy and billing continue the same encounter." />
                </Label>
                <Input id="visit_id" value={draft.visitId} readOnly className="bg-muted/30" />
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="notes">General Notes</Label>
                <FormHelpTip text="Use general notes for diagnosis context or shared dispensing instructions." />
              </div>
              <Textarea
                id="notes"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Additional instructions or notes..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Medications</CardTitle>
                <CardDescription>Add prescribed medications and dosage instructions</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href="/dashboard/pharmacy">Manage medicines</Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddingMedicine((v) => !v)}
                >
                  {isAddingMedicine ? "Close" : "Quick add medicine"}
                </Button>
              </div>
              <Button type="button" onClick={addMedication} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Medication
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {isAddingMedicine && (
              <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-sm">
                <p className="font-medium">Quick add medicine</p>
                <p className="text-xs text-muted-foreground">
                  This creates a basic catalogue entry (name only with default details). You can refine stock, pricing,
                  and other fields later from the Pharmacy dashboard.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    placeholder="Medication name (e.g. Paracetamol 500mg tablet)"
                    value={draft.newMedicineName}
                    onChange={(e) => setDraft({ ...draft, newMedicineName: e.target.value })}
                    className="sm:max-w-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleQuickAddMedicine}
                    disabled={isCreatingMedicine || !draft.newMedicineName.trim()}
                  >
                    {isCreatingMedicine ? "Adding..." : "Save"}
                  </Button>
                </div>
              </div>
            )}
            {draft.medications.map((med, index) => (
              <div key={index} className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Medication {index + 1}</h3>
                  {draft.medications.length > 1 && (
                    <Button type="button" onClick={() => removeMedication(index)} variant="ghost" size="sm">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Label>Medication Name *</Label>
                      <FormHelpTip text="Select from the medicine catalogue to keep dispensing and stock tracking aligned." />
                    </div>
                    <Select
                      value={med.medication_name}
                      onValueChange={(value) => updateMedication(index, "medication_name", value)}
                      disabled={isLoadingCatalogue}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={
                          isLoadingCatalogue ? "Loading medicines..." : "Select medicine from catalogue"
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogue.map((option) => (
                          <SelectItem key={option.id} value={option.name}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Label>Dosage *</Label>
                      <FormHelpTip text="Record the dose strength to be taken each time, for example 500mg or 2 tablets." />
                    </div>
                    <Input
                      value={med.dosage}
                      onChange={(e) => updateMedication(index, "dosage", e.target.value)}
                      placeholder="e.g., 500mg"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Label>Frequency *</Label>
                      <FormHelpTip text="Record how often the medicine should be taken, for example twice daily." />
                    </div>
                    <Input
                      value={med.frequency}
                      onChange={(e) => updateMedication(index, "frequency", e.target.value)}
                      placeholder="e.g., 3 times daily"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Label>Duration *</Label>
                      <FormHelpTip text="Specify how long the treatment should continue, such as 5 days or 2 weeks." />
                    </div>
                    <Input
                      value={med.duration}
                      onChange={(e) => updateMedication(index, "duration", e.target.value)}
                      placeholder="e.g., 7 days"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Label>Quantity *</Label>
                      <FormHelpTip text="Enter the total quantity to dispense for the full treatment course." />
                    </div>
                    <Input
                      type="number"
                      value={med.quantity}
                      onChange={(e) => updateMedication(index, "quantity", Number.parseInt(e.target.value) || 1)}
                      min="1"
                      required
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Instructions</Label>
                    <Textarea
                      value={med.instructions}
                      onChange={(e) => updateMedication(index, "instructions", e.target.value)}
                      placeholder="e.g., Take with food"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/prescriptions">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Prescription"}
          </Button>
        </div>
      </form>
    </div>
  )
}
