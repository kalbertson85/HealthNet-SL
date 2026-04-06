import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { SurgeryCreateForm } from "@/components/surgery-create-form"

export default async function NewSurgeryPage(props: {
  searchParams: Promise<{ visit_id?: string; patient_id?: string }>
}) {
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "inpatient.manage")) {
    redirect("/dashboard")
  }

  const { visit_id: visitIdParam, patient_id: patientIdParam } = await props.searchParams
  const visitId = (visitIdParam || "").trim() || ""
  const patientId = (patientIdParam || "").trim() || ""

  async function createSurgery(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect("/auth/login")
    }

    const visitId = ((formData.get("visit_id") as string | null) || "").trim()
    const patientId = ((formData.get("patient_id") as string | null) || "").trim()
    const procedureName = ((formData.get("procedure_name") as string | null) || "").trim()
    const procedureType = ((formData.get("procedure_type") as string | null) || "").trim() || null
    const scheduledAtRaw = ((formData.get("scheduled_at") as string | null) || "").trim()
    const notes = ((formData.get("notes") as string | null) || "").trim() || null

    if (!visitId || !patientId || !procedureName) {
      redirect("/dashboard/surgery")
    }

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
      redirect("/dashboard/surgery")
    }

    redirect(`/dashboard/surgery/${data.id}`)
  }

  return (
    <div className="space-y-8">
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
