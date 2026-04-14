import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { InpatientAdmissionForm } from "@/components/inpatient-admission-form"
import { ensureVisitAutoChargeLine } from "@/lib/pricing-engine"
import { parseUuidOptional, requireServerActionPermission } from "@/lib/server-action-security"
import { logAuditEvent } from "@/lib/audit"

export default async function NewAdmissionPage(props: {
  searchParams: Promise<{ patient_id?: string; visit_id?: string; error?: string }>
}) {
  const supabase = await createServerClient()

  const searchParams = await props.searchParams
  const defaultPatientId = (searchParams.patient_id as string | undefined) || ""
  const defaultVisitId = (searchParams.visit_id as string | undefined) || ""
  const errorCode = (searchParams.error as string | undefined) || ""

  // Fetch patients, doctors, wards, and available beds
  const [{ data: patients }, { data: doctors }, { data: wards }] = await Promise.all([
    supabase.from("patients").select("id, full_name, patient_number").eq("status", "active").order("full_name"),
    supabase.from("profiles").select("id, full_name").eq("role", "doctor").order("full_name"),
    supabase.from("wards").select("id, name, ward_number").eq("status", "active").order("ward_number"),
  ])

  // Fetch available beds
  const { data: beds } = await supabase
    .from("beds")
    .select("id, ward_id, bed_number, bed_type")
    .eq("status", "available")
    .order("ward_id, bed_number")

  async function createAdmission(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("inpatient.manage")

    const bedId = formData.get("bed_id") as string
    const visitId = parseUuidOptional(formData.get("visit_id"))
    const patientId = formData.get("patient_id") as string
    const doctorId = formData.get("doctor_id") as string
    const admissionDate = formData.get("admission_date") as string
    const admissionReason = formData.get("admission_reason") as string
    const diagnosis = formData.get("diagnosis") as string
    const treatmentPlan = formData.get("treatment_plan") as string
    const emergencyAdmission = formData.get("emergency_admission") === "on"

    async function rollbackAdmissionCreation(params: {
      admissionId: string
      bedId: string
      wardId: string | null
      visitId: string | null
      previousVisitStatus: string | null
    }) {
      await supabase.from("beds").update({ status: "available" }).eq("id", params.bedId)
      if (params.wardId) {
        const { data: currentWard } = await supabase.from("wards").select("available_beds").eq("id", params.wardId).maybeSingle()
        await supabase
          .from("wards")
          .update({ available_beds: Number((currentWard as { available_beds?: number | null } | null)?.available_beds ?? 0) + 1 })
          .eq("id", params.wardId)
      }
      if (params.visitId && params.previousVisitStatus) {
        await supabase.from("visits").update({ visit_status: params.previousVisitStatus }).eq("id", params.visitId)
      }
      await supabase.from("admissions").delete().eq("id", params.admissionId)
    }

    const createAdmissionRpcResult = await supabase.rpc("create_admission_transactional", {
      p_patient_id: patientId,
      p_bed_id: bedId,
      p_admitting_doctor_id: doctorId,
      p_admission_date: admissionDate,
      p_admission_reason: admissionReason,
      p_diagnosis: diagnosis,
      p_treatment_plan: treatmentPlan,
      p_emergency_admission: emergencyAdmission,
      p_created_by: user.id,
      p_visit_id: visitId,
    })

    if (!createAdmissionRpcResult.error) {
      const rpcData = (createAdmissionRpcResult.data || null) as
        | {
            ok?: boolean
            code?: string
            admission_id?: string | null
            bed_id?: string | null
            ward_id?: string | null
            previous_visit_status?: string | null
          }
        | null

      if (rpcData?.ok && rpcData.admission_id) {
        if (visitId) {
          try {
            await ensureVisitAutoChargeLine(supabase, {
              visitId,
              actorUserId: user.id,
              serviceType: "inpatient",
              description: "Admission and bed allocation",
              quantity: 1,
              mode: "replace",
              startAt: admissionDate,
            })
          } catch (chargeError) {
            console.error("[inpatient] Error creating inpatient auto-charge:", chargeError)
            await rollbackAdmissionCreation({
              admissionId: rpcData.admission_id,
              bedId: String(rpcData.bed_id || bedId),
              wardId: (rpcData.ward_id as string | null) ?? null,
              visitId,
              previousVisitStatus: (rpcData.previous_visit_status as string | null) ?? null,
            })
            redirect("/dashboard/inpatient/new?error=charge_sync_failed")
          }
        }

        await logAuditEvent({
          action: "inpatient.admission_created",
          entityType: "admission",
          entityId: rpcData.admission_id,
          user,
          metadata: {
            admission_id: rpcData.admission_id,
            patient_id: patientId,
            bed_id: rpcData.bed_id ?? bedId,
            ward_id: rpcData.ward_id ?? null,
            visit_id: visitId,
            emergency_admission: emergencyAdmission,
          },
        })

        redirect(`/dashboard/inpatient/${rpcData.admission_id}`)
      }

      const code = String(rpcData?.code || "")
      if (code === "invalid_transition" || code === "visit_not_found") {
        redirect("/dashboard/inpatient/new?error=visit_transition_failed")
      }
      redirect("/dashboard/inpatient/new?error=create_failed")
    } else {
      const rpcErrorCode = String((createAdmissionRpcResult.error as { code?: string } | null)?.code || "")
      if (rpcErrorCode === "42883") {
        redirect("/dashboard/inpatient/new?error=transactional_dependency_unavailable")
      }
      redirect("/dashboard/inpatient/new?error=create_failed")
    }
  }

  const errorMessage = (() => {
    switch (errorCode) {
      case "create_failed":
        return "Admission could not be created."
      case "visit_transition_failed":
        return "Admission creation was rolled back because visit transition failed."
      case "charge_sync_failed":
        return "Admission creation was rolled back because billing sync failed."
      case "transactional_dependency_unavailable":
        return "Admission creation requires transactional database RPCs that are not available yet. Please apply the latest SQL scripts."
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
            <Link href="/dashboard/inpatient">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Inpatient
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">New Patient Admission</h1>
            <p className="text-pretty text-muted-foreground">Admit a patient and assign ward/bed</p>
          </div>
        </div>
      </div>

      <InpatientAdmissionForm
        patients={patients || []}
        doctors={doctors || []}
        wards={wards || []}
        beds={beds || []}
        defaultPatientId={defaultPatientId}
        defaultVisitId={defaultVisitId}
        action={createAdmission}
      />
    </div>
  )
}
