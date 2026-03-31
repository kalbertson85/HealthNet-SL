import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function NewMedicationPage() {
  const supabase = await createServerClient()

  async function createMedicationWithStock(formData: FormData) {
    "use server"

    const supabase = await createServerClient()

    const name = (formData.get("name") as string | null)?.trim() || ""
    const dosageForm = ((formData.get("dosage_form") as string | null) || "").trim()
    const form = ((formData.get("form") as string | null) || "").trim() || null
    const strength = ((formData.get("strength") as string | null) || "").trim()
    const unit = ((formData.get("unit") as string | null) || "").trim()
    const category = ((formData.get("category") as string | null) || "").trim()
    const location = ((formData.get("location") as string | null) || "Main Pharmacy").trim()

    const expiryRaw = formData.get("expiry_date") as string | null
    const expiryDate = expiryRaw && expiryRaw.trim() ? expiryRaw : null

    let quantityOnHand = Number(formData.get("quantity_on_hand"))
    if (!Number.isFinite(quantityOnHand) || Number.isNaN(quantityOnHand)) {
      quantityOnHand = 0
    }

    let reorderLevel = Number(formData.get("reorder_level"))
    if (!Number.isFinite(reorderLevel) || Number.isNaN(reorderLevel)) {
      reorderLevel = 0
    }

    let unitPrice = Number(formData.get("unit_price"))
    if (!Number.isFinite(unitPrice) || Number.isNaN(unitPrice)) {
      unitPrice = 0
    }

    if (!name || !dosageForm || !strength || !unit || !category) {
      // Required medication fields missing; return user to form
      redirect("/dashboard/pharmacy/new")
    }

    const { data: medication, error: medicationError } = await supabase
      .from("medications")
      .insert({
        name,
        dosage_form: dosageForm,
        form,
        strength,
        unit,
        category,
        unit_price: unitPrice,
      })
      .select()
      .single()

    if (medicationError || !medication) {
      console.error("[v0] Error creating medication:", medicationError)
      throw medicationError
    }

    const { error: stockError } = await supabase.from("medication_stock").insert({
      medication_id: medication.id,
      location,
      quantity_on_hand: quantityOnHand,
      reorder_level: reorderLevel,
      expiry_date: expiryDate,
    })

    if (stockError) {
      console.error("[v0] Error creating medication stock:", stockError)
      throw stockError
    }

    redirect("/dashboard/pharmacy")
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/pharmacy">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Pharmacy
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Add medication and stock</h1>
            <p className="text-muted-foreground">
              Capture a medication in your formulary and record its initial stock level so it appears on the pharmacy
              dashboard.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Medication details</CardTitle>
          <CardDescription>Basic details used across prescriptions, dispensing, and stock tracking.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createMedicationWithStock} className="space-y-8">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Medication name *</Label>
                <Input id="name" name="name" placeholder="e.g. Paracetamol" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dosage_form">Dosage form *</Label>
                <Input id="dosage_form" name="dosage_form" placeholder="e.g. tablet, syrup, injection" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="strength">Strength *</Label>
                <Input id="strength" name="strength" placeholder="e.g. 500mg, 5mg/5ml" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit *</Label>
                <Input id="unit" name="unit" placeholder="e.g. tablet, ml" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Input id="category" name="category" placeholder="e.g. Analgesic, Antibiotic" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="form">Brand / additional form (optional)</Label>
                <Input id="form" name="form" placeholder="Optional: branded form description" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit_price">Unit price *</Label>
                <Input
                  id="unit_price"
                  name="unit_price"
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="e.g. 200"
                  required
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-base font-semibold">Stock details</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input id="location" name="location" defaultValue="Main Pharmacy" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity_on_hand">Quantity on hand *</Label>
                  <Input
                    id="quantity_on_hand"
                    name="quantity_on_hand"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={0}
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
                    defaultValue={0}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiry_date">Expiry date</Label>
                  <Input id="expiry_date" name="expiry_date" type="date" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/pharmacy">Cancel</Link>
              </Button>
              <Button type="submit">Save medication and stock</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
