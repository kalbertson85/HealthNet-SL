import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { assertVisitTransition, type VisitStatus } from "@/lib/visits"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { InpatientAdmissionForm } from "@/components/inpatient-admission-form"

export default async function NewAdmissionPage(props: { searchParams: Promise<{ patient_id?: string; visit_id?: string }> }) {
  const supabase = await createServerClient()

  const searchParams = await props.searchParams
  const defaultPatientId = (searchParams.patient_id as string | undefined) || ""
  const defaultVisitId = (searchParams.visit_id as string | undefined) || ""

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

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect("/auth/login")
    }

    const bedId = formData.get("bed_id") as string
    const visitId = ((formData.get("visit_id") as string | null) || "").trim() || null

    // Get selected bed and linked ward.
    const { data: bed } = await supabase.from("beds").select("id, ward_id").eq("id", bedId).single()

    const admissionData = {
      patient_id: formData.get("patient_id") as string,
      ward_id: bed?.ward_id,
      bed_id: bedId,
      admitting_doctor_id: formData.get("doctor_id") as string,
      admission_date: formData.get("admission_date") as string,
      admission_reason: formData.get("admission_reason") as string,
      diagnosis: formData.get("diagnosis") as string,
      treatment_plan: formData.get("treatment_plan") as string,
      emergency_admission: formData.get("emergency_admission") === "on",
      status: "admitted",
      created_by: user.id,
      visit_id: visitId,
    }

    const { data, error } = await supabase.from("admissions").insert(admissionData).select().single()

    if (error) {
      console.error("[v0] Error creating admission:", error)
      throw error
    }

    // Update bed status
    await supabase.from("beds").update({ status: "occupied" }).eq("id", bedId)

    // Update ward available beds count
    if (bed?.ward_id) {
      const { data: ward } = await supabase.from("wards").select("id, available_beds").eq("id", bed.ward_id).single()
      if (ward) {
        await supabase
          .from("wards")
          .update({ available_beds: Math.max(0, (ward.available_beds || 0) - 1) })
          .eq("id", bed.ward_id)
      }
    }

    // If this admission is linked to a visit, reflect the admitted status on that visit
    if (visitId) {
      const { data: beforeVisit } = await supabase
        .from("visits")
        .select("visit_status")
        .eq("id", visitId)
        .maybeSingle()

      const currentStatus = (beforeVisit?.visit_status as VisitStatus | null) ?? null

      if (currentStatus) {
        try {
          assertVisitTransition(currentStatus, "admitted")
          await supabase.from("visits").update({ visit_status: "admitted" }).eq("id", visitId)
        } catch (err) {
          console.error("[inpatient] Invalid visit status transition on admission create", {
            visitId,
            from: currentStatus,
            to: "admitted",
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    redirect(`/dashboard/inpatient/${data.id}`)
  }

  return (
    <div className="space-y-8">
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
