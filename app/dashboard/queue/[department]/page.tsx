import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { assertQueueTransition, type QueueStatus } from "@/lib/queues"

const DEPARTMENT_QUEUE_LIMIT = 200

function normalizeQueuePatient(
  relation:
    | {
        id?: string | null
        patient_number?: string | null
        first_name?: string | null
        last_name?: string | null
        phone?: string | null
      }
    | Array<{
        id?: string | null
        patient_number?: string | null
        first_name?: string | null
        last_name?: string | null
        phone?: string | null
      }>
    | null
    | undefined,
) {
  if (!relation) {
    return null
  }
  return Array.isArray(relation) ? (relation[0] ?? null) : relation
}

const statusColors = {
  waiting: "bg-yellow-500",
  in_progress: "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
}

async function callNext(department: string) {
  "use server"
  const supabase = await createServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Get next waiting patient
  const { data: nextQueue } = await supabase
    .from("queues")
    .select("id, status, queue_number")
    .eq("department", department)
    .eq("status", "waiting")
    .order("priority", { ascending: false })
    .order("check_in_time", { ascending: true })
    .limit(1)
    .single()

  if (!nextQueue) {
    return
  }

  const currentStatus = (nextQueue.status as QueueStatus | null) ?? null

  if (!currentStatus) {
    console.error("[v0] Queue callNext: missing current status", { department, id: nextQueue.id })
    redirect(`/dashboard/queue/${department}?error=queue_action_invalid`)
  }

  try {
    assertQueueTransition(currentStatus as QueueStatus, "in_progress")
  } catch (err) {
    console.error("[v0] Invalid queue status transition (callNext)", {
      department,
      id: nextQueue.id,
      from: currentStatus,
      to: "in_progress",
      error: err instanceof Error ? err.message : String(err),
    })
    redirect(`/dashboard/queue/${department}?error=queue_action_invalid`)
  }

  await supabase
    .from("queues")
    .update({
      status: "in_progress",
      called_time: new Date().toISOString(),
    })
    .eq("id", nextQueue.id)

  await supabase.from("queue_audit_logs").insert({
    queue_id: nextQueue.id,
    action: "call_next",
    old_status: currentStatus,
    new_status: "in_progress",
    actor_user_id: user?.id ?? null,
  })

  await supabase
    .from("queue_settings")
    .update({ current_serving: nextQueue.queue_number })
    .eq("department", department)
}

async function completeQueue(queueId: string) {
  "use server"
  const supabase = await createServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: existing } = await supabase
    .from("queues")
    .select("id, status, department")
    .eq("id", queueId)
    .maybeSingle()

  const department = (existing?.department as string | null) ?? null
  const currentStatus = (existing?.status as QueueStatus | null) ?? null

  if (!existing || !department || !currentStatus) {
    console.error("[v0] Queue completeQueue: missing current status or department", { queueId })
    redirect("/dashboard/queue?error=queue_action_invalid")
  }

  try {
    assertQueueTransition(currentStatus as QueueStatus, "completed")
  } catch (err) {
    console.error("[v0] Invalid queue status transition (complete)", {
      queueId,
      from: currentStatus,
      to: "completed",
      error: err instanceof Error ? err.message : String(err),
    })
    redirect(`/dashboard/queue/${department}?error=queue_action_invalid`)
  }

  await supabase
    .from("queues")
    .update({
      status: "completed",
      completed_time: new Date().toISOString(),
    })
    .eq("id", queueId)

  await supabase.from("queue_audit_logs").insert({
    queue_id: queueId,
    action: "complete",
    old_status: currentStatus,
    new_status: "completed",
    actor_user_id: user?.id ?? null,
  })
}

async function cancelQueue(queueId: string) {
  "use server"
  const supabase = await createServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: existing } = await supabase
    .from("queues")
    .select("id, status, department")
    .eq("id", queueId)
    .maybeSingle()

  const department = (existing?.department as string | null) ?? null
  const currentStatus = (existing?.status as QueueStatus | null) ?? null

  if (!existing || !department || !currentStatus) {
    console.error("[v0] Queue cancelQueue: missing current status or department", { queueId })
    redirect("/dashboard/queue?error=queue_action_invalid")
  }

  try {
    assertQueueTransition(currentStatus as QueueStatus, "cancelled")
  } catch (err) {
    console.error("[v0] Invalid queue status transition (cancel)", {
      queueId,
      from: currentStatus,
      to: "cancelled",
      error: err instanceof Error ? err.message : String(err),
    })
    redirect(`/dashboard/queue/${department}?error=queue_action_invalid`)
  }

  await supabase
    .from("queues")
    .update({
      status: "cancelled",
    })
    .eq("id", queueId)

  await supabase.from("queue_audit_logs").insert({
    queue_id: queueId,
    action: "cancel",
    old_status: currentStatus,
    new_status: "cancelled",
    actor_user_id: user?.id ?? null,
  })
}

async function startOrContinueVisitFromQueue(queueId: string) {
  "use server"
  const supabase = await createServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: queue } = await supabase
    .from("queues")
    .select("id, patient_id, department, visit_id")
    .eq("id", queueId)
    .maybeSingle()

  if (!queue) {
    console.error("[v0] startOrContinueVisitFromQueue: queue not found", { queueId })
    redirect("/dashboard/queue?error=queue_action_invalid")
  }

  const department = queue.department as string | null
  const patientId = queue.patient_id as string | null

  if (!department || !patientId) {
    console.error("[v0] startOrContinueVisitFromQueue: missing department or patient_id", { queueId })
    redirect("/dashboard/queue?error=queue_action_invalid")
  }

  // Only OPD queues are expected to start/continue doctor visits
  if (department !== "opd") {
    redirect(`/dashboard/queue/${department}`)
  }

  let visitId = (queue.visit_id as string | null) ?? null

  try {
    if (!visitId) {
      // Reuse an existing visit for this patient created today, if any
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)

      const { data: existingVisit } = await supabase
        .from("visits")
        .select("id, visit_status")
        .eq("patient_id", patientId)
        .gte("created_at", startOfDay.toISOString())
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()

      if (existingVisit) {
        visitId = existingVisit.id as string
      } else {
        // Pull Free Health Care and company assignment from patient so billing can default correctly later
        const { data: patient } = await supabase
          .from("patients")
          .select("id, company_id, free_health_category")
          .eq("id", patientId)
          .maybeSingle()

        const fhcAwarePatient = (patient || null) as
          | { company_id?: string | null; free_health_category?: string | null; id?: string | null }
          | null

        const assignedCompanyId = (fhcAwarePatient?.company_id as string | null) ?? null
        const freeHealthCategory = (fhcAwarePatient?.free_health_category as string | null) ?? "none"
        const isFreeHealthCare = freeHealthCategory !== "none"
        const payerCategory = isFreeHealthCare ? "fhc" : assignedCompanyId ? "company" : "self_pay"

        // Try to tag this visit with the OPD facility if one has been configured
        const { data: opdFacility } = await supabase
          .from("facilities")
          .select("id, code")
          .eq("code", "opd")
          .maybeSingle()

        const facilityId = (opdFacility?.id as string | null) ?? null

        const { data: inserted, error: visitError } = await supabase
          .from("visits")
          .insert({
            patient_id: patientId,
            visit_status: "doctor_pending",
            assigned_company_id: assignedCompanyId,
            is_free_health_care: isFreeHealthCare,
            payer_category: payerCategory,
            facility_id: facilityId,
          })
          .select("id")
          .maybeSingle()

        if (visitError || !inserted) {
          console.error("[v0] Error creating visit from OPD queue:", visitError || "no inserted row")
          redirect("/dashboard/queue?error=queue_action_invalid")
        }

        visitId = inserted.id as string
      }

      // Persist the link back to this queue row
      await supabase
        .from("queues")
        .update({ visit_id: visitId })
        .eq("id", queueId)
    }
  } catch (err) {
    console.error("[v0] Unexpected error in startOrContinueVisitFromQueue:", err)
    redirect("/dashboard/queue?error=queue_action_invalid")
  }

  // After ensuring a visit exists and is linked, send user to the doctor workflow
  redirect("/dashboard/doctor")
}

export default async function DepartmentQueuePage(props: {
  params: Promise<{ department: string }>
  searchParams?: Promise<{ status?: string; error?: string }>
}) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { department } = await props.params

  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const statusFilter = resolvedSearchParams?.status || "all"
  const errorCode = resolvedSearchParams?.error

  // Fetch queues for this department
  const { data: queues } = await supabase
    .from("queues")
    .select(`
      id, patient_id, visit_id, queue_number, check_in_time, priority, status,
      patient:patients(id, patient_number, first_name, last_name, phone)
    `)
    .eq("department", department)
    .in("status", ["waiting", "in_progress"])
    .order("priority", { ascending: false })
    .order("check_in_time", { ascending: true })
    .limit(DEPARTMENT_QUEUE_LIMIT)

  const { data: setting } = await supabase
    .from("queue_settings")
    .select("department, current_serving")
    .eq("department", department)
    .single()

  const waitingQueues = queues?.filter((q) => q.status === "waiting") || []
  const inProgressQueues = queues?.filter((q) => q.status === "in_progress") || []

  const visibleInProgressQueues = statusFilter === "waiting" ? [] : inProgressQueues
  const visibleWaitingQueues = statusFilter === "in_progress" ? [] : waitingQueues

  const errorMessage = (() => {
    switch (errorCode) {
      case "queue_action_invalid":
        return "This queue action could not be completed because the item is no longer in a compatible state. Please refresh the page and try again."
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
      <div className="flex items-center gap-4">
        <Link href="/dashboard/queue">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-foreground capitalize">{department} Queue</h1>
          <p className="text-muted-foreground">
            {waitingQueues.length} waiting • {inProgressQueues.length} in progress
          </p>
        </div>
        <form action={callNext.bind(null, department)}>
          <Button type="submit" size="lg" disabled={waitingQueues.length === 0}>
            Call Next Patient
          </Button>
        </form>
      </div>

      <form method="GET" className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <label className="text-muted-foreground" htmlFor="status">
          Status filter
        </label>
        <select
          id="status"
          name="status"
          defaultValue={statusFilter}
          className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="all">Waiting & In Progress</option>
          <option value="waiting">Waiting only</option>
          <option value="in_progress">In Progress only</option>
        </select>
        <button
          type="submit"
          className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent"
        >
          Apply
        </button>
      </form>
      {(queues?.length || 0) >= DEPARTMENT_QUEUE_LIMIT && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Showing the first {DEPARTMENT_QUEUE_LIMIT} active queue rows for this department.
        </div>
      )}

      {setting?.current_serving && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-primary">Now Serving</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{setting.current_serving}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>In Progress ({inProgressQueues.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleInProgressQueues.length > 0 ? (
              visibleInProgressQueues.map((queue) => {
                const patient = normalizeQueuePatient(queue.patient)
                return (
                <div key={queue.id} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">
                        <Link
                          href={patient?.id ? `/dashboard/patients/${patient.id}` : "#"}
                          className="hover:underline"
                        >
                          {patient?.first_name} {patient?.last_name}
                        </Link>
                      </p>
                      <p className="text-sm text-muted-foreground">Queue: {queue.queue_number}</p>
                    </div>
                    <Badge className={statusColors.in_progress}>In Progress</Badge>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <form action={completeQueue.bind(null, queue.id)} className="flex-1">
                      <Button type="submit" size="sm" className="w-full">
                        Complete
                      </Button>
                    </form>
                    <form action={cancelQueue.bind(null, queue.id)} className="flex-1">
                      <Button type="submit" size="sm" variant="outline" className="w-full">
                        Cancel
                      </Button>
                    </form>
                  </div>
                </div>
              )})
            ) : (
              <p className="text-center text-muted-foreground py-8">No patients in progress</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Waiting ({waitingQueues.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleWaitingQueues.length > 0 ? (
              visibleWaitingQueues.map((queue, index) => {
                const patient = normalizeQueuePatient(queue.patient)
                return (
                <div key={queue.id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-lg">#{index + 1}</span>
                        <p className="font-medium">
                          <Link
                            href={patient?.id ? `/dashboard/patients/${patient.id}` : "#"}
                            className="hover:underline"
                          >
                            {patient?.first_name} {patient?.last_name}
                          </Link>
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">Queue: {queue.queue_number}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Checked in:{" "}
                        {new Date(queue.check_in_time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <Badge className={statusColors.waiting}>Waiting</Badge>
                      {queue.priority !== "normal" && (
                        <Badge variant="outline" className="text-xs capitalize">
                          {queue.priority}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    {department === "opd" && (
                      <form action={startOrContinueVisitFromQueue.bind(null, queue.id)} className="flex-1">
                        <Button type="submit" size="sm" className="w-full">
                          Start/Continue Visit
                        </Button>
                      </form>
                    )}
                    {(department === "opd" || department === "emergency") && (
                      <div className="flex-1">
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="w-full"
                        >
                          <Link
                            href={`/dashboard/inpatient/new?patient_id=${patient?.id ?? ""}$${
                              queue.visit_id ? `&visit_id=${queue.visit_id}` : ""
                            }`}
                          >
                            Admit inpatient
                          </Link>
                        </Button>
                      </div>
                    )}
                    <form action={cancelQueue.bind(null, queue.id)} className="flex-1">
                      <Button type="submit" size="sm" variant="outline" className="w-full">
                        Cancel
                      </Button>
                    </form>
                  </div>
                </div>
              )})
            ) : (
              <p className="text-center text-muted-foreground py-8">No patients waiting</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
