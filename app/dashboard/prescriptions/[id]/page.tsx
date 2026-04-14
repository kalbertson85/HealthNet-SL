import { createServerClient } from "@/lib/supabase/server"
import { notFound, redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { logAuditEvent } from "@/lib/audit"
import { PatientWorkflowPanel } from "@/components/patient-workflow-panel"
import { getGlobalSettings } from "@/lib/global-settings"
import { formatDate, formatDateTime } from "@/lib/locale-format"
import { requireServerActionPermission } from "@/lib/server-action-security"

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
  const settings = await getGlobalSettings()

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

    const { supabase, user } = await requireServerActionPermission("pharmacy.manage")

    if (prescriptionRecord.status !== "pending") {
      redirect(`/dashboard/prescriptions/${id}`)
    }

    const rpcResult = await supabase.rpc("update_prescription_status_transactional", {
      p_prescription_id: id,
      p_new_status: "in_progress",
      p_actor_user_id: user.id,
      p_notes: null,
    })
    if (rpcResult.error) {
      redirect(`/dashboard/prescriptions/${id}?error=status_update_failed`)
    }

    const rpcData = (rpcResult.data || null) as { ok?: boolean; code?: string; old_status?: string | null; new_status?: string | null } | null
    if (!rpcData?.ok) {
      if (rpcData?.code === "not_pending") {
        redirect(`/dashboard/prescriptions/${id}`)
      }
      redirect(`/dashboard/prescriptions/${id}?error=status_update_failed`)
    }

    await logAuditEvent({
      action: "prescription.status_updated",
      resourceType: "prescription",
      resourceId: id,
      metadata: {
        prescription_number: prescriptionRecord.prescription_number,
        patient_id: prescriptionRecord.patient_id,
        old_status: rpcData.old_status ?? prescriptionRecord.status,
        new_status: rpcData.new_status ?? "in_progress",
      },
    })

    redirect(`/dashboard/prescriptions/${id}`)
  }

  async function dispense() {
    "use server"

    const { supabase, user } = await requireServerActionPermission("pharmacy.manage")
    if (prescriptionRecord.status !== "pending") {
      redirect(`/dashboard/prescriptions/${id}?error=not_pending`)
    }

    const rpcResult = await supabase.rpc("dispense_prescription_transactional", {
      p_prescription_id: id,
      p_actor_user_id: user.id,
      p_complete_visit: true,
    })

    if (rpcResult.error) {
      const rpcErrorCode = String((rpcResult.error as { code?: string } | null)?.code || "")
      if (rpcErrorCode === "42883") {
        redirect(`/dashboard/prescriptions/${id}?error=transactional_dependency_unavailable`)
      }
      redirect(`/dashboard/prescriptions/${id}?error=dispense_failed`)
    }

    const rpcData = (rpcResult.data || null) as { ok?: boolean; code?: string; message?: string } | null
    if (!rpcData?.ok) {
      const code = String(rpcData?.code || "")
      if (
        code === "not_pending" ||
        code === "no_items" ||
        code === "medication_not_found" ||
        code === "invalid_quantity" ||
        code === "stock_error" ||
        code === "insufficient_stock"
      ) {
        redirect(`/dashboard/prescriptions/${id}?error=${code}`)
      }
      if (code === "prescription_not_found") {
        redirect(`/dashboard/prescriptions`)
      }
      redirect(`/dashboard/prescriptions/${id}?error=dispense_failed`)
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

    redirect(`/dashboard/prescriptions/${id}`)
  }

  async function cancelPrescription() {
    "use server"

    const { supabase, user } = await requireServerActionPermission("pharmacy.manage")

    if (prescriptionRecord.status !== "pending") {
      redirect(`/dashboard/prescriptions/${id}`)
    }

    const rpcResult = await supabase.rpc("update_prescription_status_transactional", {
      p_prescription_id: id,
      p_new_status: "cancelled",
      p_actor_user_id: user.id,
      p_notes: null,
    })
    if (rpcResult.error) {
      redirect(`/dashboard/prescriptions/${id}?error=status_update_failed`)
    }

    const rpcData = (rpcResult.data || null) as { ok?: boolean; code?: string; old_status?: string | null; new_status?: string | null } | null
    if (!rpcData?.ok) {
      if (rpcData?.code === "not_pending") {
        redirect(`/dashboard/prescriptions/${id}`)
      }
      redirect(`/dashboard/prescriptions/${id}?error=status_update_failed`)
    }

    await logAuditEvent({
      action: "prescription.cancelled",
      resourceType: "prescription",
      resourceId: id,
      metadata: {
        prescription_number: prescriptionRecord.prescription_number,
        patient_id: prescriptionRecord.patient_id,
        old_status: rpcData.old_status ?? prescriptionRecord.status,
        new_status: rpcData.new_status ?? "cancelled",
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
      case "stock_update_failed":
        return "Failed to update medication stock. No dispensing changes were saved."
      case "dispense_event_failed":
        return "Failed to record one or more dispense events. No dispensing changes were saved."
      case "prescription_update_failed":
        return "Failed to update prescription status. No dispensing changes were saved."
      case "visit_update_failed":
        return "Failed to complete the linked visit. No dispensing changes were saved."
      case "status_update_failed":
        return "Failed to update prescription status. Please try again."
      case "audit_log_failed":
        return "Failed to write the pharmacy audit log. No workflow changes were saved."
      case "insufficient_stock":
        return "Insufficient stock to dispense all medications on this prescription."
      case "transactional_dependency_unavailable":
        return "Dispensing is temporarily unavailable because the transactional dispense function has not been deployed."
      case "dispense_failed":
        return "Dispensing failed and no changes were saved."
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

      <PatientWorkflowPanel
        currentStage="prescriptions"
        patientId={(prescriptionRecord.patient_id as string | null) ?? null}
        visitId={(prescriptionRecord.visit_id as string | null) ?? null}
        title="Prescription workflow"
        description="Structured prescriptions should stay linked to the same visit so pharmacy dispensing and visit completion only affect the correct encounter."
      />

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
              <p>{formatDate(prescription.created_at, settings)}</p>
            </div>
            {prescription.visit_id && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Linked Visit</p>
                <Link href={`/dashboard/records/visit/${prescription.visit_id}`} className="text-sm text-primary underline-offset-2 hover:underline">
                  {prescription.visit_id}
                </Link>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <Badge variant={prescription.status === "dispensed" ? "secondary" : "default"}>
                {prescription.status}
              </Badge>
            </div>
            {prescription.dispensed_at && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Dispensed On</p>
                <p>{formatDate(prescription.dispensed_at, settings)}</p>
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
                  <div className="whitespace-nowrap text-right">{formatDateTime(log.created_at, settings)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
