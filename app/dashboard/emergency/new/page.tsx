import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { EmergencyIntakeForm } from "@/components/emergency-intake-form"
import { ensureActiveVisitForPatient, ensureQueueEntryForVisit } from "@/lib/visit-flow"
import { requireServerActionPermission } from "@/lib/server-action-security"
import { z } from "zod"

export default async function NewEmergencyPage(props: { searchParams?: Promise<{ error?: string }> }) {
  const supabase = await createServerClient()
  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const errorCode = resolvedSearchParams?.error

  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "emergency.manage")) {
    redirect("/dashboard")
  }

  // Fetch active patients for triage assignment
  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name, patient_number")
    .eq("status", "active")
    .order("full_name")

  async function createEmergency(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("emergency.manage")

    const arrivalMode = (formData.get("arrival_mode") as string) || null
    const notes = ((formData.get("notes") as string) || "").trim()

    const ambulanceVehicle = ((formData.get("ambulance_vehicle") as string) || "").trim()
    const ambulanceCrew = ((formData.get("ambulance_crew") as string) || "").trim()
    const ambulanceTreatment = ((formData.get("ambulance_treatment") as string) || "").trim()
    const ambulanceCallToArrival = ((formData.get("ambulance_call_to_arrival") as string) || "").trim()

    let assessmentNotes = notes

    if (arrivalMode === "ambulance") {
      const ambulanceParts: string[] = []
      if (ambulanceVehicle) ambulanceParts.push(`vehicle=${ambulanceVehicle}`)
      if (ambulanceCrew) ambulanceParts.push(`crew=${ambulanceCrew}`)
      if (ambulanceTreatment) ambulanceParts.push(`prehospital=${ambulanceTreatment}`)
      if (ambulanceCallToArrival) ambulanceParts.push(`call_to_arrival_min=${ambulanceCallToArrival}`)

      const ambulanceLine = ambulanceParts.length > 0 ? `AMBULANCE: ${ambulanceParts.join("; ")}` : "AMBULANCE: arrival_by_ambulance"

      assessmentNotes = assessmentNotes ? `${ambulanceLine}\n${assessmentNotes}` : ambulanceLine
    }

    const parsed = z
      .object({
        patient_id: z.string().uuid(),
        triage_level: z.string().trim().min(1).max(50),
        chief_complaint: z.string().trim().min(1).max(3000),
      })
      .safeParse({
        patient_id: formData.get("patient_id"),
        triage_level: formData.get("triage_level"),
        chief_complaint: formData.get("chief_complaint"),
      })
    if (!parsed.success) {
      redirect("/dashboard/emergency")
    }
    const patientId = parsed.data.patient_id
    const visitId = await ensureActiveVisitForPatient(supabase, patientId, {
      facilityCode: "emergency",
      status: "doctor_pending",
    })

    const triageData = {
      patient_id: patientId,
      visit_id: visitId,
      triage_level: parsed.data.triage_level,
      chief_complaint: parsed.data.chief_complaint,
      arrival_mode: arrivalMode,
      assessment_notes: assessmentNotes || null,
      status: "pending",
      arrival_time: new Date().toISOString(),
    }

    const { data: newTriage, error } = await supabase.from("triage_assessments").insert(triageData).select().single()

    if (error || !newTriage) {
      console.error("[v0] Error creating emergency triage:", error?.message || error)
      redirect("/dashboard/emergency/new?error=create_failed")
    }

    const { error: auditError } = await supabase.from("triage_audit_logs").insert({
      triage_id: newTriage.id,
      actor_user_id: user.id,
      action: "created",
      old_status: null,
      new_status: "pending",
    })
    if (auditError) {
      await supabase.from("triage_assessments").delete().eq("id", newTriage.id)
      redirect("/dashboard/emergency/new?error=audit_log_failed")
    }

    if (visitId) {
      try {
        await ensureQueueEntryForVisit(supabase, {
          patientId,
          visitId,
          department: "emergency",
          priority: "emergency",
          notes: triageData.chief_complaint,
        })
      } catch (queueError) {
        console.error("[v0] Error creating emergency queue entry:", queueError)
        await supabase.from("triage_audit_logs").delete().eq("triage_id", newTriage.id)
        await supabase.from("triage_assessments").delete().eq("id", newTriage.id)
        redirect("/dashboard/emergency/new?error=queue_sync_failed")
      }
    }

    redirect("/dashboard/emergency")
  }

  const errorMessage = (() => {
    switch (errorCode) {
      case "create_failed":
        return "Emergency intake could not be created."
      case "audit_log_failed":
        return "Emergency intake was rolled back because audit logging failed."
      case "queue_sync_failed":
        return "Emergency intake was rolled back because emergency queue sync failed."
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
            <Link href="/dashboard/emergency">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Emergency
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">New Emergency Triage</h1>
            <p className="text-pretty text-muted-foreground">
              Capture a new emergency case and assign an initial triage level.
            </p>
          </div>
        </div>
      </div>

      <EmergencyIntakeForm patients={patients || []} action={createEmergency} />
    </div>
  )
}
