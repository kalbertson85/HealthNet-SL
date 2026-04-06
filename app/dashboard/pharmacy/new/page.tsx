import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PharmacyMedicationForm } from "@/components/pharmacy-medication-form"

export default async function NewMedicationPage() {
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

      <PharmacyMedicationForm action={createMedicationWithStock} />
    </div>
  )
}
