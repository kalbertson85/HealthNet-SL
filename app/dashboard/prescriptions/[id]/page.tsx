import { createServerClient } from "@/lib/supabase/server"
import { notFound, redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ensureCan } from "@/lib/utils"
import { logAuditEvent } from "@/lib/audit"

function normalizeSingle<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null
  return Array.isArray(relation) ? (relation[0] ?? null) : relation
}

export default async function PrescriptionDetailPage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string }>
}) {
  const supabase = await createServerClient()
  const { id } = await props.params

  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const errorCode = resolvedSearchParams?.error

  const [{ data: prescription, error: prescriptionError }, { data: items, error: itemsError }, { data: auditRows }] =
    await Promise.all([
      supabase
        .from("prescriptions")
        .select(`
          id, prescription_number, patient_id, doctor_id, status, created_at, dispensed_at, notes, visit_id,
          patients(full_name, patient_number, phone_number)
        `)
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("prescription_items")
        .select("id, prescription_id, medication_name, dosage, frequency, duration, quantity, instructions")
        .eq("prescription_id", id),
      supabase
        .from("pharmacy_audit_logs")
        .select("id, created_at, action, old_status, new_status, notes, actor_user_id")
        .eq("prescription_id", id)
        .order("created_at", { ascending: false }),
    ])

  if (prescriptionError) {
    console.error("[v0] Error loading prescription detail:", prescriptionError.message || prescriptionError)
  }

  let visitStatus: string | null = null
  if ((prescription as { visit_id?: string | null }).visit_id) {
    const { data: visit } = await supabase
      .from("visits")
      .select("visit_status")
      .eq("id", (prescription as { visit_id?: string | null }).visit_id as string)
      .maybeSingle()

    visitStatus = (visit?.visit_status as string | null) ?? null
  }

  if (itemsError) {
    console.error("[v0] Error loading prescription items:", itemsError.message || itemsError)
  }

  if (!prescription) {
    console.warn("[v0] Prescription not found for id:", id)
    notFound()
  }
  const prescriptionRecord = prescription
  const prescriptionPatient = normalizeSingle(
    prescriptionRecord.patients as
      | { full_name?: string | null; patient_number?: string | null; phone_number?: string | null }
      | Array<{ full_name?: string | null; patient_number?: string | null; phone_number?: string | null }>
      | null,
  )

  // Load prescribing doctor's profile separately to avoid ambiguous embedded relationships
  const { data: doctorProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", prescriptionRecord.doctor_id)
    .maybeSingle()

  const rows = (auditRows || []) as {
    id: string
    created_at: string
    action: string
    old_status: string | null
    new_status: string | null
    notes: string | null
    actor_user_id: string
  }[]

  const actorIds = Array.from(new Set(rows.map((r) => r.actor_user_id).filter(Boolean))) as string[]

  const actorProfilesById = new Map<string, { full_name: string | null; role: string | null }>()

  if (actorIds.length > 0) {
    const { data: actorProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("id", actorIds)

    for (const p of actorProfiles || []) {
      actorProfilesById.set(p.id as string, {
        full_name: (p.full_name as string | null) ?? null,
        role: (p.role as string | null) ?? null,
      })
    }
  }

  const formatDateTime = (value: string) => {
    try {
      return new Date(value).toLocaleString()
    } catch {
      return value
    }
  }

  const renderActor = (actorId: string) => {
    const actor = actorProfilesById.get(actorId)
    if (!actor) return actorId
    if (actor.role) {
      return `${actor.full_name ?? "Unknown"} (${actor.role})`
    }
    return actor.full_name ?? actorId
  }

  async function markInProgress() {
    "use server"

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect("/auth/login")
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    ensureCan(
      { id: user.id, role: profile?.role ?? null, facility_id: null },
      "pharmacy.manage",
    )

    if (prescriptionRecord.status !== "pending") {
      console.error("[v0] Cannot mark in progress: prescription is not pending", {
        id,
        status: prescriptionRecord.status,
      })
      redirect(`/dashboard/prescriptions/${id}`)
    }

    await supabase
      .from("prescriptions")
      .update({ status: "in_progress" })
      .eq("id", id)

    try {
      await supabase.from("pharmacy_audit_logs").insert({
        prescription_id: id,
        actor_user_id: user.id,
        action: "status_updated",
        old_status: prescriptionRecord.status,
        new_status: "in_progress",
        notes: null,
        metadata: {
          patient_id: prescriptionRecord.patient_id,
          prescription_number: prescriptionRecord.prescription_number,
        },
      })
    } catch (auditError) {
      console.error("[v0] Error logging prescription status update to in_progress:", auditError)
    }

    await logAuditEvent({
      action: "prescription.status_updated",
      resourceType: "prescription",
      resourceId: id,
      metadata: {
        prescription_number: prescriptionRecord.prescription_number,
        patient_id: prescriptionRecord.patient_id,
        old_status: prescriptionRecord.status,
        new_status: "in_progress",
      },
    })

    redirect(`/dashboard/prescriptions/${id}`)
  }

  async function dispense() {
    "use server"

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect("/auth/login")
    }

    // Enforce that only pharmacy roles/admins can dispense
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    ensureCan(
      { id: user.id, role: profile?.role ?? null, facility_id: null },
      "pharmacy.manage",
    )

    // Do not allow dispensing if prescription is not pending
    if (prescriptionRecord.status !== "pending") {
      console.error("[v0] Cannot dispense: prescription is not pending", {
        id,
        status: prescriptionRecord.status,
      })
      redirect(`/dashboard/prescriptions/${id}?error=not_pending`)
    }

    // Load prescription items
    const { data: items, error: itemsError } = await supabase
      .from("prescription_items")
      .select("id, prescription_id, medication_name, quantity")
      .eq("prescription_id", id)

    if (itemsError || !items || items.length === 0) {
      console.error("[v0] Cannot dispense: no prescription items found", itemsError)
      redirect(`/dashboard/prescriptions/${id}?error=no_items`)
    }

    // Resolve medications by name
    const medicationNames = Array.from(new Set(items.map((item) => item.medication_name).filter(Boolean)))

    const { data: medications, error: medsError } = await supabase
      .from("medications")
      .select("id, name")
      .in("name", medicationNames)

    if (medsError || !medications) {
      console.error("[v0] Cannot dispense: error loading medications", medsError)
      redirect(`/dashboard/prescriptions/${id}`)
    }

    const medicationByName = Object.fromEntries(
      medications.map((m: { id: string; name: string }) => [m.name, m]),
    ) as Record<string, { id: string }>

    // Aggregate required quantities per medication
    const requiredByMedication: Record<string, number> = {}
    for (const item of items) {
      const med = medicationByName[item.medication_name]
      if (!med) {
        console.error("[v0] Cannot dispense: no medication record for", item.medication_name)
        redirect(`/dashboard/prescriptions/${id}?error=medication_not_found`)
      }
      const quantity = Number(item.quantity || 0)
      if (!Number.isFinite(quantity) || quantity <= 0) {
        console.error("[v0] Cannot dispense: invalid quantity for item", {
          prescription_id: id,
          item,
        })
        redirect(`/dashboard/prescriptions/${id}?error=invalid_quantity`)
      }
      requiredByMedication[med.id] = (requiredByMedication[med.id] || 0) + quantity
    }

    const medicationIds = Object.keys(requiredByMedication)

    const { data: stocks, error: stockError } = await supabase
      .from("medication_stock")
      .select("id, medication_id, quantity_on_hand")
      .in("medication_id", medicationIds)

    if (stockError || !stocks) {
      console.error("[v0] Cannot dispense: error loading medication stock", stockError)
      redirect(`/dashboard/prescriptions/${id}?error=stock_error`)
    }

    const stockByMedicationId: Record<string, (typeof stocks)[number]> = {}
    for (const stock of stocks) {
      stockByMedicationId[stock.medication_id] = stock
    }

    // Check stock availability
    const shortages: { medication_id: string; required: number; available: number }[] = []
    for (const [medId, requiredQty] of Object.entries(requiredByMedication)) {
      const stock = stockByMedicationId[medId]
      const available = Number(stock?.quantity_on_hand || 0)
      if (!stock || available < requiredQty) {
        shortages.push({ medication_id: medId, required: requiredQty, available })
      }
    }

    if (shortages.length > 0) {
      console.error("[v0] Cannot dispense: insufficient stock for", shortages)
      redirect(`/dashboard/prescriptions/${id}?error=insufficient_stock`)
    }

    // Deduct stock and record dispense events
    for (const [medId, requiredQty] of Object.entries(requiredByMedication)) {
      const stock = stockByMedicationId[medId]
      const newQty = Number(stock.quantity_on_hand || 0) - requiredQty

      await supabase
        .from("medication_stock")
        .update({ quantity_on_hand: newQty })
        .eq("id", stock.id)
    }

    for (const item of items) {
      const med = medicationByName[item.medication_name]
      const stock = stockByMedicationId[med.id]
      const quantity = Number(item.quantity || 0)

      await supabase.from("dispense_events").insert({
        prescription_id: id,
        patient_id: prescriptionRecord.patient_id,
        medication_id: med.id,
        source_stock_id: stock.id,
        quantity_dispensed: quantity,
        dispensed_by: user.id,
      })
    }

    await supabase
      .from("prescriptions")
      .update({
        status: "dispensed",
        dispensed_at: new Date().toISOString(),
        dispensed_by: user.id,
      })
      .eq("id", id)

    try {
      await supabase.from("pharmacy_audit_logs").insert({
        prescription_id: id,
        actor_user_id: user.id,
        action: "dispensed",
        old_status: prescriptionRecord.status,
        new_status: "dispensed",
        notes: null,
        metadata: {
          patient_id: prescriptionRecord.patient_id,
          prescription_number: prescriptionRecord.prescription_number,
        },
      })
    } catch (auditError) {
      console.error("[v0] Error logging prescription dispense:", auditError)
    }

    await logAuditEvent({
      action: "prescription.dispense",
      resourceType: "prescription",
      resourceId: id,
      metadata: {
        prescription_number: prescriptionRecord.prescription_number,
        patient_id: prescriptionRecord.patient_id,
      },
    })

    // Mark any pharmacy-pending visits for this patient as completed
    if (prescriptionRecord.patient_id) {
      try {
        await supabase
          .from("visits")
          .update({ visit_status: "completed" })
          .eq("patient_id", prescriptionRecord.patient_id)
          .eq("visit_status", "pharmacy_pending")
      } catch (error) {
        console.error("[v0] Error marking visit completed after dispense:", error)
      }
    }

    redirect(`/dashboard/prescriptions/${id}`)
  }

  async function cancelPrescription() {
    "use server"

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect("/auth/login")
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    ensureCan(
      { id: user.id, role: profile?.role ?? null, facility_id: null },
      "pharmacy.manage",
    )

    if (prescriptionRecord.status !== "pending") {
      console.error("[v0] Cannot cancel: prescription is not pending", {
        id,
        status: prescriptionRecord.status,
      })
      redirect(`/dashboard/prescriptions/${id}`)
    }

    await supabase
      .from("prescriptions")
      .update({ status: "cancelled" })
      .eq("id", id)

    try {
      await supabase.from("pharmacy_audit_logs").insert({
        prescription_id: id,
        actor_user_id: user.id,
        action: "cancelled",
        old_status: prescriptionRecord.status,
        new_status: "cancelled",
        notes: null,
        metadata: {
          patient_id: prescriptionRecord.patient_id,
          prescription_number: prescriptionRecord.prescription_number,
        },
      })
    } catch (auditError) {
      console.error("[v0] Error logging prescription cancellation:", auditError)
    }

    await logAuditEvent({
      action: "prescription.cancelled",
      resourceType: "prescription",
      resourceId: id,
      metadata: {
        prescription_number: prescriptionRecord.prescription_number,
        patient_id: prescriptionRecord.patient_id,
      },
    })

    redirect(`/dashboard/prescriptions/${id}`)
  }

  const errorMessage = (() => {
    switch (errorCode) {
      case "not_pending":
        return "This prescription can no longer be dispensed because it is not pending."
      case "no_items":
        return "This prescription has no items to dispense."
      case "medication_not_found":
        return "One or more medications on this prescription could not be found in the Medications catalogue. Please add each missing medicine in Pharmacy → Medications using the exact same name, then retry dispensing."
      case "invalid_quantity":
        return "One or more prescription item quantities are invalid."
      case "stock_error":
        return "Unable to load medication stock. Please try again."
      case "insufficient_stock":
        return "Insufficient stock to dispense all medications on this prescription."
      default:
        return null
    }
  })()

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/prescriptions">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Prescriptions
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">Prescription Details</h1>
            <p className="text-pretty text-muted-foreground">Prescription #{prescription.prescription_number}</p>
            {visitStatus && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Visit status: <span className="font-medium">{visitStatus}</span>
              </p>
            )}
          </div>
        </div>
        {prescription.status === "pending" && (
          <div className="flex flex-wrap gap-2 justify-end">
            <form action={markInProgress}>
              <Button type="submit" variant="outline">
                Mark as In Progress
              </Button>
            </form>
            <form action={dispense}>
              <Button type="submit">Mark as Dispensed</Button>
            </form>
            <form action={cancelPrescription}>
              <Button type="submit" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10">
                Cancel prescription
              </Button>
            </form>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Name</p>
              <p className="text-lg font-medium">{prescriptionPatient?.full_name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Patient Number</p>
              <p>{prescriptionPatient?.patient_number}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Phone</p>
              <p>{prescriptionPatient?.phone_number || "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prescription Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Prescribed By</p>
              <p>Dr. {doctorProfile?.full_name ?? "Unknown"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Date Prescribed</p>
              <p>{new Date(prescription.created_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <Badge variant={prescription.status === "dispensed" ? "secondary" : "default"}>
                {prescription.status}
              </Badge>
            </div>
            {prescription.dispensed_at && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Dispensed On</p>
                <p>{new Date(prescription.dispensed_at).toLocaleDateString()}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Medications</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medication</TableHead>
                <TableHead>Dosage</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.medication_name}</TableCell>
                  <TableCell>{item.dosage}</TableCell>
                  <TableCell>{item.frequency}</TableCell>
                  <TableCell>{item.duration}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {items && items.length > 0 && items[0].instructions && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Instructions</p>
                {items.map(
                  (item) =>
                    item.instructions && (
                      <p key={item.id} className="text-sm mb-2">
                        • {item.medication_name}: {item.instructions}
                      </p>
                    ),
                )}
              </div>
            </>
          )}

          {prescription.notes && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">General Notes</p>
                <p className="text-sm">{prescription.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pharmacy activity</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pharmacy activity has been recorded for this prescription yet.</p>
          ) : (
            <div className="space-y-3 text-xs text-muted-foreground">
              {rows.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">
                      {log.action === "created"
                        ? "Prescription created"
                        : log.action === "dispensed"
                          ? "Prescription dispensed"
                          : log.action === "status_updated"
                            ? "Status updated"
                            : log.action === "cancelled"
                              ? "Prescription cancelled"
                              : "Updated"}
                    </p>
                    {(log.old_status || log.new_status) && (
                      <p>
                        Status: {log.old_status ?? "(none)"} → {log.new_status ?? "(unchanged)"}
                      </p>
                    )}
                    {log.notes && <p className="line-clamp-2">Notes: {log.notes}</p>}
                    <p>By: {renderActor(log.actor_user_id)}</p>
                  </div>
                  <div className="whitespace-nowrap text-right">{formatDateTime(log.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
