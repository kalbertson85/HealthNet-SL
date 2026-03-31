import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Users, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"

const departments = [
  { id: "opd", name: "OPD (Out-Patient)", icon: Users, color: "text-blue-600" },
  { id: "emergency", name: "Emergency", icon: AlertCircle, color: "text-red-600" },
  { id: "lab", name: "Laboratory", icon: AlertCircle, color: "text-purple-600" },
  { id: "pharmacy", name: "Pharmacy", icon: CheckCircle, color: "text-green-600" },
  { id: "radiology", name: "Radiology", icon: Clock, color: "text-orange-600" },
  { id: "billing", name: "Billing", icon: XCircle, color: "text-teal-600" },
]

const statusColors = {
  waiting: "bg-yellow-500",
  in_progress: "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
}

const priorityColors = {
  normal: "bg-slate-500",
  urgent: "bg-orange-500",
  emergency: "bg-red-500",
}

export default async function QueuePage(props: {
  searchParams?: Promise<{ status?: string; error?: string }>
}) {
  const supabase = await createServerClient()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "queue.manage")) {
    redirect("/dashboard")
  }

  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const statusFilter = resolvedSearchParams?.status || "all"
  const errorCode = resolvedSearchParams?.error

  // Fetch queue statistics, including visit FHC/facility context where available
  const { data: queues } = await supabase
    .from("queues")
    .select(`
      *,
      patient:patients(id, patient_number, first_name, last_name, phone),
      visits:is_visit_id(id, is_free_health_care, facility_id,
        facilities(name, code)
      )
    `)
    .in("status", ["waiting", "in_progress"])
    .order("priority", { ascending: false })
    .order("check_in_time", { ascending: true })

  // Fetch queue settings
  const { data: settings } = await supabase.from("queue_settings").select("*")

  // Group queues by department
  const queuesByDept = departments.map((dept) => {
    const deptQueues = queues?.filter((q) => q.department === dept.id) || []
    const waiting = deptQueues.filter((q) => q.status === "waiting").length
    const inProgress = deptQueues.filter((q) => q.status === "in_progress").length
    const setting = settings?.find((s) => s.department === dept.id)

    return {
      ...dept,
      queues: deptQueues,
      waiting,
      inProgress,
      total: deptQueues.length,
      avgWaitTime: setting?.average_service_time || 15,
      currentServing: setting?.current_serving,
    }
  })

  const totalWaiting = queuesByDept.reduce((sum, dept) => sum + dept.waiting, 0)

  const filteredQueues = (queues || []).filter((queue) => {
    if (statusFilter === "waiting" || statusFilter === "in_progress") {
      return queue.status === statusFilter
    }
    return true
  })

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Queue Management</h1>
          <p className="text-muted-foreground">
            {totalWaiting} patient{totalWaiting === 1 ? "" : "s"} waiting across all departments
          </p>
        </div>
        <Link href="/dashboard/queue/new">
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
            Add to Queue
          </button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {queuesByDept.map((dept) => (
          <Card key={dept.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <dept.icon className={`h-5 w-5 ${dept.color}`} />
                  <CardTitle className="text-lg">{dept.name}</CardTitle>
                </div>
                <Badge variant="secondary">{dept.total}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Waiting</span>
                  <span className="font-medium">{dept.waiting}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">In Progress</span>
                  <span className="font-medium">{dept.inProgress}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Avg Wait</span>
                  <span className="font-medium">{dept.avgWaitTime} min</span>
                </div>
              </div>

              {dept.currentServing && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">Now Serving</p>
                  <p className="font-medium">{dept.currentServing}</p>
                </div>
              )}

              <Link href={`/dashboard/queue/${dept.id}`}>
                <button className="w-full mt-2 px-3 py-2 text-sm border rounded-md hover:bg-accent">View Queue</button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Active Queues</CardTitle>
          <CardDescription>Patients currently in queue across all departments</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="GET" className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <label className="text-muted-foreground" htmlFor="status">
              Status filter
            </label>
            <select
              id="status"
              name="status"
              defaultValue={statusFilter}
              className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="all">All active</option>
              <option value="waiting">Waiting</option>
              <option value="in_progress">In Progress</option>
            </select>
            <button
              type="submit"
              className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent"
            >
              Apply
            </button>
          </form>
          <div className="space-y-3">
            {filteredQueues && filteredQueues.length > 0 ? (
              filteredQueues.map((queue) => (
                <div
                  key={queue.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div
                      className={`w-2 h-12 rounded ${priorityColors[queue.priority as keyof typeof priorityColors]}`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={queue.patient?.id ? `/dashboard/patients/${queue.patient.id}` : "#"}
                          className="font-medium hover:underline"
                        >
                          {queue.patient?.first_name} {queue.patient?.last_name}
                        </Link>
                        <Badge variant="outline" className="text-xs">
                          {queue.patient?.patient_number}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <span className="capitalize">{queue.department}</span>
                        <span>•</span>
                        <span>Queue: {queue.queue_number}</span>
                        <span>•</span>
                        <span>
                          {new Date(queue.check_in_time).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {queue.visits?.facilities?.name && (
                          <>
                            <span>•</span>
                            <span>
                              {queue.visits.facilities.name}
                              {queue.visits.facilities.code
                                ? ` (${queue.visits.facilities.code})`
                                : ""}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={statusColors[queue.status as keyof typeof statusColors]}>
                      {queue.status.replace("_", " ")}
                    </Badge>
                    {queue.visits?.is_free_health_care && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        Free Health Care visit
                      </Badge>
                    )}
                    {queue.priority !== "normal" && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {queue.priority}
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">No patients in queue</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
