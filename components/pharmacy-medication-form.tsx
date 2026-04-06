"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FormDraftStatus } from "@/components/form-draft-status"
import { FormHelpTip } from "@/components/form-help-tip"
import { useLocalDraft } from "@/lib/use-local-draft"

interface MedicationDraft {
  name: string
  dosage_form: string
  strength: string
  unit: string
  category: string
  form: string
  unit_price: string
  location: string
  quantity_on_hand: string
  reorder_level: string
  expiry_date: string
}

export function PharmacyMedicationForm({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>
}) {
  const initialValue: MedicationDraft = {
    name: "",
    dosage_form: "",
    strength: "",
    unit: "",
    category: "",
    form: "",
    unit_price: "",
    location: "Main Pharmacy",
    quantity_on_hand: "0",
    reorder_level: "0",
    expiry_date: "",
  }

  const { value, setValue, lastSavedAt, resetDraft } = useLocalDraft("draft:pharmacy:new", initialValue)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const update = <K extends keyof MedicationDraft>(field: K, fieldValue: MedicationDraft[K]) => {
    setValue({ ...value, [field]: fieldValue })
  }

  return (
    <>
      <FormDraftStatus
        title="Medication draft"
        description="Medication and stock details are saved locally on this device while you complete the formulary entry."
        lastSavedAt={lastSavedAt}
        onClear={resetDraft}
      />

      <Card>
        <CardHeader>
          <CardTitle>Medication details</CardTitle>
          <CardDescription>Basic details used across prescriptions, dispensing, and stock tracking.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData) => {
              setIsSubmitting(true)
              await action(formData)
            }}
            className="space-y-8"
          >
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="name">Medication name *</Label>
                  <FormHelpTip text="Use the medicine name exactly as it should appear in prescribing and dispensing workflows." />
                </div>
                <Input id="name" name="name" placeholder="e.g. Paracetamol" value={value.name} onChange={(e) => update("name", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="dosage_form">Dosage form *</Label>
                  <FormHelpTip text="Examples include tablet, syrup, injection, or cream. Keep it consistent for search and stock tracking." />
                </div>
                <Input
                  id="dosage_form"
                  name="dosage_form"
                  placeholder="e.g. tablet, syrup, injection"
                  value={value.dosage_form}
                  onChange={(e) => update("dosage_form", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="strength">Strength *</Label>
                <Input id="strength" name="strength" placeholder="e.g. 500mg, 5mg/5ml" value={value.strength} onChange={(e) => update("strength", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit *</Label>
                <Input id="unit" name="unit" placeholder="e.g. tablet, ml" value={value.unit} onChange={(e) => update("unit", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Input id="category" name="category" placeholder="e.g. Analgesic, Antibiotic" value={value.category} onChange={(e) => update("category", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="form">Brand / additional form (optional)</Label>
                <Input id="form" name="form" placeholder="Optional: branded form description" value={value.form} onChange={(e) => update("form", e.target.value)} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="unit_price">Unit price *</Label>
                  <FormHelpTip text="Enter the price per dispensing unit so billing and stock valuation stay accurate." />
                </div>
                <Input
                  id="unit_price"
                  name="unit_price"
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="e.g. 200"
                  value={value.unit_price}
                  onChange={(e) => update("unit_price", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-base font-semibold">Stock details</h2>
                <p className="text-xs text-muted-foreground">
                  Record starting stock now so low-stock alerts and dispensing quantities are correct from the first day.
                </p>
              </div>
              <div className="grid gap-6 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input id="location" name="location" value={value.location} onChange={(e) => update("location", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity_on_hand">Quantity on hand *</Label>
                  <Input
                    id="quantity_on_hand"
                    name="quantity_on_hand"
                    type="number"
                    min={0}
                    step={1}
                    value={value.quantity_on_hand}
                    onChange={(e) => update("quantity_on_hand", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reorder_level">Reorder level</Label>
                  <Input
                    id="reorder_level"
                    name="reorder_level"
                    type="number"
                    min={0}
                    step={1}
                    value={value.reorder_level}
                    onChange={(e) => update("reorder_level", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiry_date">Expiry date</Label>
                  <Input id="expiry_date" name="expiry_date" type="date" value={value.expiry_date} onChange={(e) => update("expiry_date", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/pharmacy">Cancel</Link>
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save medication and stock"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  )
}
