import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Link from "next/link"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"

export const revalidate = 0

interface ControlledDrugRow {
  id: string
  quantity: number
  balance_after: number | null
  transaction_type: string
  dose: string | null
  route: string | null
  reason: string | null
  recorded_at: string
  ward_name: string | null
  medications?: { name?: string | null; strength?: string | null; form?: string | null } | null
  patients?: { full_name?: string | null; patient_number?: string | null } | null
}

interface MedicationOption {
  id: string
  name: string | null
  strength: string | null
  form: string | null
}

export default async function ControlledDrugsPage() {
  const supabase = await createServerClient()

  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "pharmacy.manage")) {
    redirect("/dashboard")
  }

  const { data: recentEntries } = await supabase
    .from("controlled_drug_register")
    .select(
      `id, quantity, balance_after, transaction_type, dose, route, reason, recorded_at, ward_name,
       medications(name, strength, form),
       patients(full_name, patient_number)`,
    )
    .order("recorded_at", { ascending: false })
    .limit(50)

  const entries = (recentEntries || []) as ControlledDrugRow[]

  const { data: medicationsData } = await supabase
    .from("medications")
    .select("id, name, strength, form")
    .order("name")
    .limit(200)

  const medications = (medicationsData || []) as MedicationOption[]

  async function recordEntry(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const { user, profile } = await getSessionUserAndProfile()

    if (!user) {
      redirect("/auth/login")
    }

    const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
    if (!can(rbacUser, "pharmacy.manage")) {
      redirect("/dashboard")
    }

    const medicationId = (formData.get("medication_id") as string | null) ?? null
    const transactionType = (formData.get("transaction_type") as string | null) ?? null
    const quantityRaw = (formData.get("quantity") as string | null) ?? null
    const wardName = ((formData.get("ward_name") as string | null) ?? "").trim() || null
    const dose = ((formData.get("dose") as string | null) ?? "").trim() || null
    const route = ((formData.get("route") as string | null) ?? "").trim() || null
    const reason = ((formData.get("reason") as string | null) ?? "").trim() || null
    const prescriptionNumber = ((formData.get("prescription_number") as string | null) ?? "").trim() || null

    if (!medicationId || !transactionType || !quantityRaw) {
      redirect("/dashboard/pharmacy/controlled-drugs")
    }

    const quantity = Number.parseInt(quantityRaw, 10)
    if (!Number.isFinite(quantity) || quantity === 0) {
      redirect("/dashboard/pharmacy/controlled-drugs")
    }

    let patientId: string | null = null
    let visitId: string | null = null
    let prescriptionId: string | null = null

    if (prescriptionNumber) {
      const { data: prescription } = await supabase
        .from("prescriptions")
        .select("id, patient_id, visit_id, prescription_number")
        .eq("prescription_number", prescriptionNumber)
        .limit(1)
        .maybeSingle()

      if (prescription) {
        prescriptionId = prescription.id as string
        patientId = (prescription.patient_id as string | null) ?? null
        visitId = (prescription.visit_id as string | null) ?? null
      }
    }

    // Naive balance tracking: look up last balance for this medication and adjust.
    let balanceAfter: number | null = null
    const { data: lastEntry } = await supabase
      .from("controlled_drug_register")
      .select("balance_after")
      .eq("medication_id", medicationId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastBalance = (lastEntry?.balance_after as number | null) ?? 0

    let newBalance = lastBalance
    if (transactionType === "issue") {
      newBalance = lastBalance - quantity
    } else if (transactionType === "return") {
      newBalance = lastBalance + quantity
    } else if (transactionType === "adjustment") {
      newBalance = lastBalance + quantity
    }

    balanceAfter = newBalance

    const { error: insertError } = await supabase.from("controlled_drug_register").insert({
      medication_id: medicationId,
      transaction_type: transactionType,
      quantity,
      balance_after: balanceAfter,
      patient_id: patientId,
      visit_id: visitId,
      prescription_id: prescriptionId,
      ward_name: wardName,
      dose,
      route,
      reason,
      administered_by: user.id,
      recorded_at: new Date().toISOString(),
    })

    if (insertError) {
      console.error("[pharmacy] Error inserting controlled drug register entry:", insertError.message || insertError)
      redirect("/dashboard/pharmacy/controlled-drugs")
    }

    // Also adjust medication_stock so physical stock aligns with the register for the main pharmacy location
    const delta =
      transactionType === "issue"
        ? -quantity
        : transactionType === "return" || transactionType === "adjustment"
          ? quantity
          : 0

    if (delta !== 0) {
      const { data: stockRow } = await supabase
        .from("medication_stock")
        .select("id, quantity_on_hand")
        .eq("medication_id", medicationId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()

      if (stockRow) {
        const currentQty = Number(stockRow.quantity_on_hand ?? 0)
        const newQty = Math.max(0, currentQty + delta)

        await supabase
          .from("medication_stock")
          .update({ quantity_on_hand: newQty })
          .eq("id", stockRow.id as string)
      }
    }

    redirect("/dashboard/pharmacy/controlled-drugs")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Controlled drug register</h1>
          <p className="text-muted-foreground text-sm">
            Log issues and returns of controlled medicines, linked to prescriptions where possible.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/pharmacy">Back to Pharmacy</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Record a controlled drug entry</CardTitle>
          <CardDescription>Capture each issue or return with enough detail for audit.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={recordEntry} className="grid gap-4 md:grid-cols-4 md:items-end text-sm">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="medication_id">Medication</Label>
              <Select name="medication_id" required>
                <SelectTrigger id="medication_id">
                  <SelectValue placeholder="Select medication" />
                </SelectTrigger>
                <SelectContent>
                  {medications.map((med) => {
                    const labelParts = [med.name, med.strength, med.form].filter(Boolean)
                    return (
                      <SelectItem key={med.id} value={med.id}>
                        {labelParts.join(" ") || "Unnamed"}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="transaction_type">Type</Label>
              <Select name="transaction_type" required>
                <SelectTrigger id="transaction_type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="issue">Issue</SelectItem>
                  <SelectItem value="return">Return</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" name="quantity" type="number" min={1} required />
            </div>

            <div className="space-y-1">
              <Label htmlFor="ward_name">Ward / location (optional)</Label>
              <Input id="ward_name" name="ward_name" placeholder="e.g. Surgical Ward" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="dose">Dose (optional)</Label>
              <Input id="dose" name="dose" placeholder="e.g. 10mg IV" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="route">Route (optional)</Label>
              <Input id="route" name="route" placeholder="e.g. IV" />
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="reason">Reason / notes (optional)</Label>
              <Input
                id="reason"
                name="reason"
                placeholder="e.g. Dose issued for night shift, stock check adjustment, etc."
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="prescription_number">Prescription # (optional)</Label>
              <Input
                id="prescription_number"
                name="prescription_number"
                placeholder="Link to an existing prescription if applicable"
              />
            </div>

            <div className="md:col-span-4 flex justify-end">
              <Button type="submit">Save entry</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent controlled drug entries</CardTitle>
          <CardDescription>Last 50 controlled drug movements for quick review.</CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries recorded yet.</p>
          ) : (
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Time</TableHead>
                  <TableHead>Medication</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Ward</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const medParts = [
                    entry.medications?.name,
                    entry.medications?.strength,
                    entry.medications?.form,
                  ].filter(Boolean)

                  return (
                    <TableRow key={entry.id}>
                      <TableCell>{new Date(entry.recorded_at).toLocaleString()}</TableCell>
                      <TableCell>{medParts.join(" ") || "Unknown"}</TableCell>
                      <TableCell className="capitalize">{entry.transaction_type}</TableCell>
                      <TableCell>{entry.quantity}</TableCell>
                      <TableCell>{entry.balance_after ?? "-"}</TableCell>
                      <TableCell>
                        {entry.patients?.full_name || "-"}
                        {entry.patients?.patient_number && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({entry.patients.patient_number})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{entry.ward_name || "-"}</TableCell>
                      <TableCell>{entry.reason || "-"}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
