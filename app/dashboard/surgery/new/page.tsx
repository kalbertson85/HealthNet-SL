import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

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

      <form action={createSurgery} className="space-y-6">
        <input type="hidden" name="visit_id" value={visitId} />
        <input type="hidden" name="patient_id" value={patientId} />

        <Card>
          <CardHeader>
            <CardTitle>Procedure Details</CardTitle>
            <CardDescription>Key information about this surgery.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="procedure_name">Procedure name *</Label>
              <Input id="procedure_name" name="procedure_name" required placeholder="e.g. Appendectomy" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="procedure_type">Procedure type (optional)</Label>
              <Input id="procedure_type" name="procedure_type" placeholder="e.g. Emergency, Elective" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scheduled_at">Scheduled date &amp; time (optional)</Label>
              <Input id="scheduled_at" name="scheduled_at" type="datetime-local" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                name="notes"
                rows={4}
                placeholder="Key operative notes or planning details..."
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/surgery">Cancel</Link>
          </Button>
          <Button type="submit">Create Surgery</Button>
        </div>
      </form>
    </div>
  )
}
