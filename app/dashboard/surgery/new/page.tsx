import { redirect } from "next/navigation"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { SurgeryCreateForm } from "@/components/surgery-create-form"
import { ensureVisitAutoChargeLine } from "@/lib/pricing-engine"
import { requireServerActionPermission } from "@/lib/server-action-security"
import { z } from "zod"

export default async function NewSurgeryPage(props: {
  searchParams: Promise<{ visit_id?: string; patient_id?: string; error?: string }>
}) {
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "inpatient.manage")) {
    redirect("/dashboard")
  }

  const { visit_id: visitIdParam, patient_id: patientIdParam, error: errorCode } = await props.searchParams
  const visitId = (visitIdParam || "").trim() || ""
  const patientId = (patientIdParam || "").trim() || ""

  async function createSurgery(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("inpatient.manage")
    const parsed = z
      .object({
        visit_id: z.string().uuid(),
        patient_id: z.string().uuid(),
        procedure_name: z.string().trim().min(1).max(300),
        procedure_type: z.string().trim().max(120).optional(),
        scheduled_at: z.string().trim().optional(),
        notes: z.string().trim().max(5000).optional(),
      })
      .safeParse({
        visit_id: formData.get("visit_id"),
        patient_id: formData.get("patient_id"),
        procedure_name: formData.get("procedure_name"),
        procedure_type: formData.get("procedure_type"),
        scheduled_at: formData.get("scheduled_at"),
        notes: formData.get("notes"),
      })
    if (!parsed.success) {
      redirect("/dashboard/surgery")
    }
    const visitId = parsed.data.visit_id
    const patientId = parsed.data.patient_id
    const procedureName = parsed.data.procedure_name
    const procedureType = parsed.data.procedure_type || null
    const scheduledAtRaw = parsed.data.scheduled_at || ""
    const notes = parsed.data.notes || null

    const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw).toISOString() : null

    const { data, error } = await supabase
      .from("surgeries")
      .insert({
        visit_id: visitId,
        patient_id: patientId,
        surgeon_id: user.id,
        procedure_name: procedureName,
        procedure_type: procedureType,
        scheduled_at: scheduledAt,
        notes,
      })
      .select("id")
      .maybeSingle()

    if (error || !data) {
      console.error("[surgery] Error creating surgery:", error)
      redirect("/dashboard/surgery/new?error=create_failed")
    }

    try {
      await ensureVisitAutoChargeLine(supabase, {
        visitId,
        actorUserId: user.id,
        serviceType: "surgery",
        description: `${procedureName}${procedureType ? ` (${procedureType})` : ""}`,
        quantity: 1,
        mode: "replace",
        startAt: scheduledAt,
      })
    } catch (chargeError) {
      console.error("[surgery] Error creating surgery auto-charge:", chargeError)
      await supabase.from("surgeries").delete().eq("id", data.id as string)
      redirect("/dashboard/surgery/new?error=charge_sync_failed")
    }

    redirect(`/dashboard/surgery/${data.id}`)
  }

  const errorMessage = (() => {
    switch (errorCode) {
      case "create_failed":
        return "Surgery record could not be created."
      case "charge_sync_failed":
        return "Surgery record was rolled back because billing sync failed."
      default:
        return null
    }
  })()

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
            <Link href="/dashboard/surgery">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Surgery
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">Record Surgery</h1>
            <p className="text-pretty text-muted-foreground">
              Create a new surgical procedure linked to the current visit.
            </p>
          </div>
        </div>
      </div>

      <SurgeryCreateForm visitId={visitId} patientId={patientId} action={createSurgery} />
    </div>
  )
}
