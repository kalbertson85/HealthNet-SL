import { createServerClient } from "@/lib/supabase/server"
import { notFound, redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function RadiologyRequestDetailPage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string }>
}) {
  const supabase = await createServerClient()
  const { id } = await props.params

  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const errorCode = resolvedSearchParams?.error

  const { data: request, error: requestError } = await supabase
    .from("radiology_requests")
    .select(
      `*,
       patients(full_name, patient_number, phone_number),
       profiles:doctor_id(full_name)
      `,
    )
    .eq("id", id)
    .maybeSingle()

  if (requestError) {
    console.error("[v0] Error loading radiology request detail:", requestError.message || requestError)
  }

  let visitStatus: string | null = null
  let visitIsFhc = false
  let visitFacilityName: string | null = null

  if ((request as { visit_id?: string | null } | null)?.visit_id) {
    const { data: visit } = await supabase
      .from("visits")
      .select(
        `visit_status, is_free_health_care,
         facilities(name)`
      )
      .eq("id", (request as { visit_id?: string | null }).visit_id as string)
      .maybeSingle()

    visitStatus = (visit?.visit_status as string | null) ?? null
    visitIsFhc = Boolean(visit?.is_free_health_care)
    const facility = Array.isArray(visit?.facilities) ? visit?.facilities[0] : visit?.facilities
    visitFacilityName = (facility?.name as string | null) ?? null
  }

  if (!request) {
    console.warn("[v0] Radiology request not found for id:", id)
    notFound()
  }

  const { data: auditRows } = await supabase
    .from("radiology_audit_logs")
    .select("id, created_at, action, old_status, new_status, notes, actor_user_id")
    .eq("radiology_request_id", id)
    .order("created_at", { ascending: false })

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

  async function updateStatus(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const status = formData.get("status") as string

    const { data: before } = await supabase
      .from("radiology_requests")
      .select("status")
      .eq("id", id)
      .maybeSingle()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    await supabase.from("radiology_requests").update({ status }).eq("id", id)

    if (before && user) {
      try {
        await supabase.from("radiology_audit_logs").insert({
          radiology_request_id: id,
          actor_user_id: user.id,
          action: "status_updated",
          old_status: (before.status as string | null) ?? null,
          new_status: status,
          notes: null,
        })
      } catch (auditError) {
        console.error("[v0] Error logging radiology status update:", auditError)
      }
    }

    redirect(`/dashboard/radiology/${id}`)
  }

  async function enterResults(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const interpretation = (formData.get("interpretation") as string | null) ?? ""

    const trimmed = interpretation.trim()
    if (!trimmed || trimmed.length > 4000) {
      console.error("[v0] Cannot enter radiology results: invalid interpretation", {
        id,
        length: trimmed.length,
      })
      redirect(`/dashboard/radiology/${id}?error=invalid_interpretation`)
    }

    // Update radiology request
    await supabase
      .from("radiology_requests")
      .update({
        result_text: trimmed,
        status: "completed",
      })
      .eq("id", id)

    // Also update linked investigation and visit status where appropriate
    const { data: updatedRequest } = await supabase
      .from("radiology_requests")
      .select("investigation_id, visit_id")
      .eq("id", id)
      .maybeSingle()

    if (updatedRequest?.investigation_id) {
      await supabase
        .from("investigations")
        .update({
          notes: trimmed,
          status: "completed",
        })
        .eq("id", updatedRequest.investigation_id as string)
    }

    if (updatedRequest?.visit_id) {
      const { data: remaining } = await supabase
        .from("investigations")
        .select("id, status")
        .eq("visit_id", updatedRequest.visit_id as string)

      const allCompleted = (remaining || []).every((inv) => inv.status === "completed")

      if (allCompleted) {
        await supabase
          .from("visits")
          .update({ visit_status: "doctor_review" })
          .eq("id", updatedRequest.visit_id as string)
      }
    }

    if (user) {
      try {
        await supabase.from("radiology_audit_logs").insert({
          radiology_request_id: id,
          actor_user_id: user.id,
          action: "result_entered",
          old_status: request.status,
          new_status: "completed",
          notes: trimmed,
        })
      } catch (auditError) {
        console.error("[v0] Error logging radiology result entry:", auditError)
      }
    }

    redirect(`/dashboard/radiology/${id}`)
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "stat":
        return "destructive"
      case "urgent":
        return "default"
      case "routine":
        return "secondary"
      default:
        return "secondary"
    }
  }

  const errorMessage = (() => {
    switch (errorCode) {
      case "invalid_interpretation":
        return "The interpretation text was empty or too long. Please review and try again."
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
            <Link href="/dashboard/radiology">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Radiology
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">Radiology Request</h1>
            <p className="text-pretty text-muted-foreground">{request.study_type}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <Badge variant={getPriorityColor(request.priority)}>{request.priority} Priority</Badge>
          {visitFacilityName && (
            <span className="text-[11px] text-muted-foreground">Facility: {visitFacilityName}</span>
          )}
          {visitIsFhc && (
            <Badge variant="default" className="text-[10px] font-normal">
              Free Health Care visit
            </Badge>
          )}
          {visitStatus && (
            <span className="text-[11px] text-muted-foreground">
              Visit status: <span className="font-medium">{visitStatus}</span>
            </span>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Request Status</CardTitle>
            <Badge variant={request.status === "completed" ? "secondary" : "default"}>{request.status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <form action={updateStatus} className="flex gap-2">
            <select
              name="status"
              aria-label="Radiology request status"
              defaultValue={request.status}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="pending">Pending</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <Button type="submit" size="sm">
              Update Status
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Name</p>
              <p className="text-lg font-medium">{request.patients?.full_name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Patient Number</p>
              <p>{request.patients?.patient_number}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Phone</p>
              <p>{request.patients?.phone_number || "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Study Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Study</p>
              <p className="text-lg">{request.study_type}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Modality</p>
              <p className="uppercase">{request.modality}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ordered By</p>
              <p>Dr. {request.profiles?.full_name ?? "Unknown"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Order Date</p>
              <p>{new Date(request.created_at).toLocaleDateString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Radiology activity</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity has been recorded for this request yet.</p>
          ) : (
            <div className="space-y-3 text-xs text-muted-foreground">
              {rows.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">
                      {log.action === "created"
                        ? "Request created"
                        : log.action === "status_updated"
                          ? "Status updated"
                          : log.action === "result_entered"
                            ? "Results entered"
                            : "Updated"}
                    </p>
                    {(log.old_status || log.new_status) && (
                      <p>
                        Status: {log.old_status ?? "(none)"}  b7 {log.new_status ?? "(unchanged)"}
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

      {request.clinical_notes && (
        <Card>
          <CardHeader>
            <CardTitle>Clinical Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{request.clinical_notes}</p>
          </CardContent>
        </Card>
      )}

      {request.status !== "completed" ? (
        <Card>
          <CardHeader>
            <CardTitle>Enter Results</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={enterResults} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="interpretation">Report & Interpretation *</Label>
                <Textarea
                  id="interpretation"
                  name="interpretation"
                  placeholder="Enter findings and impression..."
                  rows={6}
                  required
                  defaultValue={request.result_text || ""}
                />
              </div>
              <Button type="submit">Submit Results</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Radiology Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Interpretation</p>
                <p className="text-sm whitespace-pre-wrap">{request.result_text || "No report available"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
