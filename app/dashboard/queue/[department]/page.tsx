import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { PatientWorkflowPanel } from "@/components/patient-workflow-panel"
import { OfflineSyncStatus } from "@/components/offline-sync-status"
import { OfflineQueueActionButton } from "@/components/offline-queue-action-button"

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
        <OfflineQueueActionButton
          payload={{ type: "call_next", department }}
          label="Call Next Patient"
          size="lg"
          disabled={waitingQueues.length === 0}
        />
      </div>

      <OfflineSyncStatus />

      <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Work this queue from top to bottom: call the next patient, complete active work when finished, and cancel only
        when the patient is no longer proceeding. OPD queues can start or continue a linked visit directly from here.
      </div>

      {department === "opd" ? (
        <PatientWorkflowPanel
          currentStage="queue"
          title="Queue workflow"
          description="The queue is the handoff point between triage and consultation. Use the linked visit to keep the patient journey connected."
        />
      ) : null}

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
                    <OfflineQueueActionButton
                      payload={{ type: "complete", queueId: queue.id }}
                      label="Complete"
                      size="sm"
                      className="w-full"
                    />
                    <OfflineQueueActionButton
                      payload={{ type: "cancel", queueId: queue.id }}
                      label="Cancel"
                      size="sm"
                      variant="outline"
                      className="w-full"
                    />
                  </div>
                </div>
              )})
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                No patients are currently in progress. Use <span className="font-medium">Call Next Patient</span> when
                someone is waiting, or switch the filter back to view active work.
              </p>
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
                      <OfflineQueueActionButton
                        payload={{ type: "start_visit", queueId: queue.id }}
                        label="Start/Continue Visit"
                        size="sm"
                        className="w-full"
                      />
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
                    <OfflineQueueActionButton
                      payload={{ type: "cancel", queueId: queue.id }}
                      label="Cancel"
                      size="sm"
                      variant="outline"
                      className="w-full"
                    />
                  </div>
                </div>
              )})
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                No patients are currently waiting in this department. Add a new queue entry or check back after the next
                registration or triage handoff.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
