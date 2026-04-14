import { createServerClient } from "@/lib/supabase/server"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PatientWorkflowPanel } from "@/components/patient-workflow-panel"
import { findAdmissionIdByVisitId } from "@/lib/visit-flow"
import { getGlobalSettings } from "@/lib/global-settings"
import { formatDateTime } from "@/lib/locale-format"
import { requireServerActionPermission } from "@/lib/server-action-security"
import { z } from "zod"

interface SurgeryDetail {
  id: string
  patient_id: string | null
  visit_id: string | null
  procedure_name: string
  procedure_type: string | null
  status: string
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
  notes: string | null
  patients?: {
    full_name?: string | null
    patient_number?: string | null
    phone_number?: string | null
  } | null
  profiles?: { full_name?: string | null } | null
  visits?: {
    is_free_health_care?: boolean | null
    facilities?: { name?: string | null; code?: string | null } | null
  } | null
}

export default async function SurgeryDetailPage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string }>
}) {
  const { id } = await props.params
  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const errorCode = resolvedSearchParams?.error
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()

  async function updateSurgeryStatus(formData: FormData) {
    "use server"

    const { supabase } = await requireServerActionPermission("inpatient.manage")
    const parsed = z
      .object({
        next_status: z.enum(["in_progress", "completed"]),
        surgery_id: z.string().uuid(),
        visit_id: z.string().uuid().optional(),
        patient_id: z.string().uuid().optional(),
      })
      .safeParse({
        next_status: formData.get("next_status"),
        surgery_id: formData.get("surgery_id"),
        visit_id: formData.get("visit_id") || undefined,
        patient_id: formData.get("patient_id") || undefined,
      })
    if (!parsed.success) {
      redirect("/dashboard/surgery")
    }
    const nextStatus = parsed.data.next_status
    const surgeryId = parsed.data.surgery_id

    const now = new Date().toISOString()
    const updatePayload: Record<string, unknown> = { status: nextStatus }
    const { data: current } = await supabase
      .from("surgeries")
      .select("id, status, visit_id, patient_id")
      .eq("id", surgeryId)
      .maybeSingle()
    if (!current) {
      redirect("/dashboard/surgery")
    }
    const currentStatus = ((current.status as string | null) ?? "").toLowerCase()
    if (currentStatus === "completed") {
      redirect(`/dashboard/surgery/${surgeryId}`)
    }
    const visitId = (current.visit_id as string | null) ?? null
    const patientId = (current.patient_id as string | null) ?? null

    if (nextStatus === "in_progress") {
      updatePayload.started_at = now
    } else if (nextStatus === "completed") {
      updatePayload.started_at = updatePayload.started_at || now
      updatePayload.ended_at = now
    }

    const { error } = await supabase.from("surgeries").update(updatePayload).eq("id", surgeryId)
    if (error) {
      console.error("[surgery] Error updating surgery status:", error.message || error)
      redirect(`/dashboard/surgery/${surgeryId}?error=status_update_failed`)
    }

    if (nextStatus === "completed" && visitId) {
      const admissionId = await findAdmissionIdByVisitId(supabase, visitId)
      if (admissionId) {
        redirect(`/dashboard/inpatient/${admissionId}`)
      }
      if (patientId) {
        redirect(
          `/dashboard/appointments/new?patient_id=${patientId}&source=surgery&reason=${encodeURIComponent("Post-surgery follow-up")}&visit_id=${visitId}`,
        )
      }
    }

    redirect(`/dashboard/surgery/${surgeryId}`)
  }

  const { data } = await supabase
    .from("surgeries")
    .select(
      `*,
       patients(full_name, patient_number, phone_number),
       profiles:surgeon_id(full_name),
       visits(is_free_health_care,
         facilities(name, code)
       )
      `,
    )
    .eq("id", id)
    .maybeSingle()

  if (!data) {
    notFound()
  }

  const surgery = data as SurgeryDetail
  const errorMessage = errorCode === "status_update_failed" ? "Surgery status update failed." : null
  const admissionId = surgery.visit_id ? await findAdmissionIdByVisitId(supabase, surgery.visit_id) : null
  const canStart = surgery.status !== "completed" && !surgery.started_at
  const canComplete = surgery.status !== "completed"

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
            <Link href="/dashboard/surgery">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Surgery
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">Surgery</h1>
            <p className="text-pretty text-muted-foreground flex flex-wrap items-center gap-2">
              <span>{surgery.procedure_name}</span>
              {surgery.procedure_type && <span className="text-xs text-muted-foreground">({surgery.procedure_type})</span>}
              {surgery.visits?.is_free_health_care && (
                <Badge variant="secondary" className="text-[11px]">
                  {settings.publicCoverageLabel}
                </Badge>
              )}
              {surgery.visits?.facilities?.name && (
                <span className="text-xs text-muted-foreground">
                  {surgery.visits.facilities.name}
                  {surgery.visits.facilities.code ? ` (${surgery.visits.facilities.code})` : ""}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <Badge variant={surgery.status === "completed" ? "secondary" : "default"}>{surgery.status}</Badge>
          {surgery.scheduled_at && (
            <span className="text-muted-foreground">
              Scheduled: {formatDateTime(surgery.scheduled_at, settings)}
            </span>
          )}
          {surgery.started_at && (
            <span className="text-muted-foreground">
              Started: {formatDateTime(surgery.started_at, settings)}
            </span>
          )}
          {surgery.ended_at && (
            <span className="text-muted-foreground">
              Ended: {formatDateTime(surgery.ended_at, settings)}
            </span>
          )}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            {canStart ? (
              <form action={updateSurgeryStatus}>
                <input type="hidden" name="surgery_id" value={surgery.id} />
                <input type="hidden" name="visit_id" value={surgery.visit_id || ""} />
                <input type="hidden" name="patient_id" value={surgery.patient_id || ""} />
                <input type="hidden" name="next_status" value="in_progress" />
                <Button type="submit" size="sm">Start surgery</Button>
              </form>
            ) : null}
            {canComplete ? (
              <form action={updateSurgeryStatus}>
                <input type="hidden" name="surgery_id" value={surgery.id} />
                <input type="hidden" name="visit_id" value={surgery.visit_id || ""} />
                <input type="hidden" name="patient_id" value={surgery.patient_id || ""} />
                <input type="hidden" name="next_status" value="completed" />
                <Button type="submit" size="sm" variant="outline">Complete surgery</Button>
              </form>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
            <CardDescription>Patient linked to this procedure.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Name</p>
              <p className="text-base font-medium">{surgery.patients?.full_name || "Unknown"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Patient Number</p>
              <p>{surgery.patients?.patient_number || "–"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Phone</p>
              <p>{surgery.patients?.phone_number || "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Surgeon & Context</CardTitle>
            <CardDescription>Clinical context of this procedure.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Surgeon</p>
              <p>Dr. {surgery.profiles?.full_name || "Unknown"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Facility</p>
              <p>
                {surgery.visits?.facilities?.name
                  ? `${surgery.visits.facilities.name}${
                      surgery.visits.facilities.code ? ` (${surgery.visits.facilities.code})` : ""
                    }`
                  : "Not recorded"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Timing</CardTitle>
          <CardDescription>Schedule and actual operative times.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Scheduled</p>
            <p>{surgery.scheduled_at ? formatDateTime(surgery.scheduled_at, settings) : "Not scheduled"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Started</p>
            <p>{surgery.started_at ? formatDateTime(surgery.started_at, settings) : "Not recorded"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Ended</p>
            <p>{surgery.ended_at ? formatDateTime(surgery.ended_at, settings) : "Not recorded"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>Operative notes or key comments.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">
            {surgery.notes && surgery.notes.trim().length > 0 ? surgery.notes : "No notes recorded."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Next care handoff</CardTitle>
          <CardDescription>
            Surgery should feed back into inpatient recovery, nursing observation, discharge, and follow-up instead of ending here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {admissionId ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/inpatient/${admissionId}`}>Open linked admission</Link>
            </Button>
          ) : null}
          {surgery.visit_id ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/records/visit/${surgery.visit_id}`}>Open visit handoff</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/nursing">Open nursing workspace</Link>
          </Button>
          {surgery.patient_id ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/dashboard/appointments/new?patient_id=${surgery.patient_id}&source=surgery&reason=${encodeURIComponent("Post-surgery follow-up")}&visit_id=${surgery.visit_id || ""}`}
              >
                Book follow-up
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <PatientWorkflowPanel
        currentStage="extended-care"
        patientId={surgery.patient_id}
        visitId={surgery.visit_id}
        admissionId={admissionId}
        title="Extended care workflow"
        description="Surgery belongs inside the same admission and visit journey. After theatre, move the patient through inpatient recovery, nursing observation, discharge, and follow-up."
      />
    </div>
  )
}
