import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PharmacyMedicationForm } from "@/components/pharmacy-medication-form"
import { requireServerActionPermission } from "@/lib/server-action-security"
import { z } from "zod"

export default async function NewMedicationPage(props: { searchParams?: Promise<{ error?: string }> }) {
  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const errorCode = resolvedSearchParams?.error
  const errorMessage =
    errorCode === "create_failed"
      ? "Medication could not be created."
      : errorCode === "stock_create_failed"
        ? "Medication stock could not be created. Medication creation was rolled back."
        : null

  async function createMedicationWithStock(formData: FormData) {
    "use server"

    const { supabase } = await requireServerActionPermission("pharmacy.manage")
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(200),
        dosage_form: z.string().trim().min(1).max(100),
        form: z.string().trim().max(100).optional(),
        strength: z.string().trim().min(1).max(100),
        unit: z.string().trim().min(1).max(50),
        category: z.string().trim().min(1).max(100),
        location: z.string().trim().max(200).optional(),
        expiry_date: z.string().trim().optional(),
        quantity_on_hand: z.coerce.number().min(0).max(1000000).optional(),
        reorder_level: z.coerce.number().min(0).max(1000000).optional(),
        unit_price: z.coerce.number().min(0).max(1000000000).optional(),
      })
      .safeParse({
        name: formData.get("name"),
        dosage_form: formData.get("dosage_form"),
        form: formData.get("form"),
        strength: formData.get("strength"),
        unit: formData.get("unit"),
        category: formData.get("category"),
        location: formData.get("location"),
        expiry_date: formData.get("expiry_date"),
        quantity_on_hand: formData.get("quantity_on_hand"),
        reorder_level: formData.get("reorder_level"),
        unit_price: formData.get("unit_price"),
      })
    if (!parsed.success) {
      redirect("/dashboard/pharmacy/new")
    }

    const name = parsed.data.name
    const dosageForm = parsed.data.dosage_form
    const form = parsed.data.form || null
    const strength = parsed.data.strength
    const unit = parsed.data.unit
    const category = parsed.data.category
    const location = parsed.data.location?.trim() || "Main Pharmacy"

    const expiryRaw = parsed.data.expiry_date ?? null
    const expiryDate = expiryRaw && expiryRaw.trim() ? expiryRaw : null

    const quantityOnHand = parsed.data.quantity_on_hand ?? 0
    const reorderLevel = parsed.data.reorder_level ?? 0
    const unitPrice = parsed.data.unit_price ?? 0

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
      redirect("/dashboard/pharmacy/new?error=create_failed")
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
      await supabase.from("medications").delete().eq("id", medication.id)
      redirect("/dashboard/pharmacy/new?error=stock_create_failed")
    }

    redirect("/dashboard/pharmacy")
  }

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
