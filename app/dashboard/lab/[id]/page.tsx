import { createServerClient } from "@/lib/supabase/server"
import { notFound, redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { logAuditEvent } from "@/lib/audit"
import { shouldSendSms, sendSms } from "@/lib/notifications/sms"

export default async function LabTestDetailPage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string }>
}) {
  const supabase = await createServerClient()
  const { id } = await props.params

  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const errorCode = resolvedSearchParams?.error

  const { data: labTest, error: labError } = await supabase
    .from("lab_tests")
    .select(`
      *,
      patients(full_name, patient_number, phone_number)
    `)
    .eq("id", id)
    .maybeSingle()

  if (labError) {
    console.error("[v0] Error loading lab test detail:", labError.message || labError)
  }

  let visitStatus: string | null = null
  if ((labTest as { visit_id?: string | null }).visit_id) {
    const { data: visit } = await supabase
      .from("visits")
      .select("visit_status")
      .eq("id", (labTest as { visit_id?: string | null }).visit_id as string)
      .maybeSingle()

    visitStatus = (visit?.visit_status as string | null) ?? null
  }

  if (!labTest) {
    console.warn("[v0] Lab test not found for id:", id)
    notFound()
  }

  const { data: doctorProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", labTest.doctor_id)
    .maybeSingle()

  const { data: auditRows } = await supabase
    .from("lab_audit_logs")
    .select("id, created_at, action, old_status, new_status, notes, actor_user_id")
    .eq("lab_test_id", id)
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

  async function markSampleCollected() {
    "use server"

    const supabase = await createServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect("/auth/login")
    }

    await supabase
      .from("lab_tests")
      .update({ sample_collected_at: new Date().toISOString() })
      .eq("id", id)

    try {
      await supabase.from("lab_audit_logs").insert({
        lab_test_id: id,
        actor_user_id: user.id,
        action: "sample_collected",
        old_status: labTest.status,
        new_status: labTest.status,
        notes: null,
      })
    } catch (auditError) {
      console.error("[v0] Error logging lab sample collected:", auditError)
    }

    redirect(`/dashboard/lab/${id}`)
  }

  async function markSampleReceived() {
    "use server"

    const supabase = await createServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect("/auth/login")
    }

    await supabase
      .from("lab_tests")
      .update({ sample_received_at: new Date().toISOString() })
      .eq("id", id)

    try {
      await supabase.from("lab_audit_logs").insert({
        lab_test_id: id,
        actor_user_id: user.id,
        action: "sample_received",
        old_status: labTest.status,
        new_status: labTest.status,
        notes: null,
      })
    } catch (auditError) {
      console.error("[v0] Error logging lab sample received:", auditError)
    }

    redirect(`/dashboard/lab/${id}`)
  }

  async function updateStatus(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const status = formData.get("status") as string

    const { data: before } = await supabase
      .from("lab_tests")
      .select("status")
      .eq("id", id)
      .maybeSingle()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    await supabase.from("lab_tests").update({ status }).eq("id", id)

    if (before && user) {
      try {
        await supabase.from("lab_audit_logs").insert({
          lab_test_id: id,
          actor_user_id: user.id,
          action: "status_updated",
          old_status: (before.status as string | null) ?? null,
          new_status: status,
          notes: null,
        })
      } catch (auditError) {
        console.error("[v0] Error logging lab status update:", auditError)
      }
    }

    redirect(`/dashboard/lab/${id}`)
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
      console.error("[v0] Cannot enter lab results: invalid interpretation", {
        id,
        length: trimmed.length,
      })
      redirect(`/dashboard/lab/${id}?error=invalid_interpretation`)
    }

    await supabase
      .from("lab_tests")
      .update({
        interpretation: trimmed,
        status: "completed",
        results_entered_at: new Date().toISOString(),
        results_entered_by: user?.id,
      })
      .eq("id", id)

    // Fetch lab test with patient info for logging and notifications
    const { data: updatedTest } = await supabase
      .from("lab_tests")
      .select(
        `*,
        patients(full_name, patient_number, phone_number)`
      )
      .eq("id", id)
      .maybeSingle()

    // Audit log for result entry (structured lab_audit_logs + global audit)
    if (user) {
      try {
        await supabase.from("lab_audit_logs").insert({
          lab_test_id: id,
          actor_user_id: user.id,
          action: "result_entered",
          old_status: labTest.status,
          new_status: "completed",
          notes: trimmed,
          metadata: updatedTest
            ? {
                test_number: updatedTest.test_number,
                test_type: updatedTest.test_type,
                patient_id: updatedTest.patient_id,
              }
            : null,
        })
      } catch (auditError) {
        console.error("[v0] Error logging lab result entry:", auditError)
      }
    }

    await logAuditEvent({
      action: "lab.result_entered",
      resourceType: "lab_test",
      resourceId: id,
      metadata: updatedTest
        ? {
            test_number: updatedTest.test_number,
            test_type: updatedTest.test_type,
            patient_id: updatedTest.patient_id,
          }
        : undefined,
    })

    // Optional SMS notification to patient when results are ready
    if (updatedTest?.patients?.phone_number && user?.id) {
      const canSms = await shouldSendSms(user.id, "lab_result_ready")
      if (canSms) {
        void sendSms(
          updatedTest.patients.phone_number,
          `Your lab test ${updatedTest.test_number ?? ""} is ready. Please visit the facility for details.`,
        )
      }
    }

    redirect(`/dashboard/lab/${id}`)
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
            <Link href="/dashboard/lab">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Lab Tests
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">Lab Test Details</h1>
            <p className="text-pretty text-muted-foreground">Test #{labTest.test_number}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <Badge variant={getPriorityColor(labTest.priority)}>{labTest.priority} Priority</Badge>
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
            <CardTitle>Test Status</CardTitle>
            <Badge variant={labTest.status === "completed" ? "secondary" : "default"}>{labTest.status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <form action={updateStatus} className="flex gap-2">
            <select
              name="status"
              aria-label="Lab test status"
              defaultValue={labTest.status}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
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
              <p className="text-lg font-medium">{labTest.patients?.full_name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Patient Number</p>
              <p>{labTest.patients?.patient_number}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Phone</p>
              <p>{labTest.patients?.phone_number || "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Test Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Test Type</p>
              <p className="text-lg">{labTest.test_type}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Category</p>
              <p>{labTest.test_category}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ordered By</p>
              <p>Dr. {doctorProfile?.full_name ?? "Unknown"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Order Date</p>
              <p>{new Date(labTest.created_at).toLocaleDateString()}</p>
            </div>
            <Separator />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Sample Collected</p>
                <p className="text-sm">
                  {labTest.sample_collected_at
                    ? new Date(labTest.sample_collected_at).toLocaleString()
                    : "Not recorded"}
                </p>
                {!labTest.sample_collected_at && (
                  <form action={markSampleCollected}>
                    <Button type="submit" variant="outline" size="sm" className="px-2 py-1 text-xs">
                      Mark collected now
                    </Button>
                  </form>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Sample Received in Lab</p>
                <p className="text-sm">
                  {labTest.sample_received_at
                    ? new Date(labTest.sample_received_at).toLocaleString()
                    : "Not recorded"}
                </p>
                {!labTest.sample_received_at && (
                  <form action={markSampleReceived}>
                    <Button type="submit" variant="outline" size="sm" className="px-2 py-1 text-xs">
                      Mark received now
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lab activity</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity has been recorded for this lab test yet.</p>
          ) : (
            <div className="space-y-3 text-xs text-muted-foreground">
              {rows.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">
                      {log.action === "created"
                        ? "Lab test created"
                        : log.action === "sample_collected"
                          ? "Sample collected"
                          : log.action === "sample_received"
                            ? "Sample received in lab"
                            : log.action === "status_updated"
                              ? "Status updated"
                              : log.action === "result_entered"
                                ? "Results entered"
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

      {labTest.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Clinical Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{labTest.notes}</p>
          </CardContent>
        </Card>
      )}

      {labTest.status !== "completed" ? (
        <Card>
          <CardHeader>
            <CardTitle>Enter Results</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={enterResults} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="interpretation">Results & Interpretation *</Label>
                <Textarea
                  id="interpretation"
                  name="interpretation"
                  placeholder="Enter test results and interpretation..."
                  rows={6}
                  required
                  defaultValue={labTest.interpretation || ""}
                />
              </div>
              <Button type="submit">Submit Results</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Results Entered By</p>
                <p>{labTest.results_entered_by ? "Lab Technician" : "N/A"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Results Date</p>
                <p>{labTest.results_entered_at ? new Date(labTest.results_entered_at).toLocaleDateString() : "N/A"}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Interpretation</p>
                <p className="text-sm whitespace-pre-wrap">{labTest.interpretation || "No interpretation available"}</p>
              </div>
              <div className="pt-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/api/lab/${labTest.id}/pdf`} prefetch={false}>
                    Download PDF
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
