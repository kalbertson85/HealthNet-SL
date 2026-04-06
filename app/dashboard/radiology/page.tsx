import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableCard } from "@/components/table-card"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { ReportFilterSummary } from "@/components/report-filter-summary"

const RADIOLOGY_LIST_LIMIT = 50

interface RadiologyRequestRow {
  id: string
  modality: string
  study_type: string
  priority: string
  status: string
  patients?: { full_name?: string | null; patient_number?: string | null } | null
  profiles?: { full_name?: string | null } | null
  visits?: {
    is_free_health_care?: boolean | null
    facilities?: { name?: string | null } | null
  } | null
}

export default async function RadiologyPage(props: {
  searchParams?: Promise<{ status?: string; priority?: string }>
}) {
  const supabase = await createServerClient()

  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "lab.manage")) {
    redirect("/dashboard")
  }

  const searchParams = props.searchParams ? await props.searchParams : undefined
  const statusFilter = (searchParams?.status || "all").trim().toLowerCase()
  const priorityFilter = (searchParams?.priority || "all").trim().toLowerCase()
  const hasActiveFilters = statusFilter !== "all" || priorityFilter !== "all"

  const { data: requests } = await supabase
    .from("radiology_requests")
    .select(
      `*,
       patients(full_name, patient_number),
       profiles(full_name),
       visits(is_free_health_care,
         facilities(name)
       )
      `,
    )
    .order("created_at", { ascending: false })
    .limit(RADIOLOGY_LIST_LIMIT)

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "default"
      case "scheduled":
        return "default"
      case "completed":
        return "secondary"
      case "cancelled":
        return "destructive"
      default:
        return "secondary"
    }
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

  const rows = ((requests || []) as RadiologyRequestRow[]).filter((request) => {
    if (statusFilter !== "all" && (request.status || "").toLowerCase() !== statusFilter) return false
    if (priorityFilter !== "all" && (request.priority || "").toLowerCase() !== priorityFilter) return false
    return true
  })

  const statusSummary = {
    pending: rows.filter((request) => request.status === "pending").length,
    scheduled: rows.filter((request) => request.status === "scheduled").length,
    completed: rows.filter((request) => request.status === "completed").length,
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Radiology</h1>
          <p className="text-pretty text-muted-foreground">Manage imaging requests and results</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Pending</CardTitle>
            <CardDescription>Requests awaiting scheduling or imaging.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{statusSummary.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Scheduled</CardTitle>
            <CardDescription>Requests booked but not yet completed.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{statusSummary.scheduled}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Completed</CardTitle>
            <CardDescription>Requests with submitted reports.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{statusSummary.completed}</p>
          </CardContent>
        </Card>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 text-sm">
        <div className="space-y-1">
          <label htmlFor="status" className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="priority" className="text-xs font-medium text-muted-foreground">
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue={priorityFilter}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">All priorities</option>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="stat">STAT</option>
          </select>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {hasActiveFilters ? (
            <Button asChild type="button" size="sm" variant="outline">
              <Link href="/dashboard/radiology">Reset</Link>
            </Button>
          ) : null}
          <Button type="submit" size="sm">
            Apply filters
          </Button>
        </div>
      </form>

      <ReportFilterSummary
        items={[
          { label: "Status", value: statusFilter !== "all" ? statusFilter : null },
          { label: "Priority", value: priorityFilter !== "all" ? priorityFilter : null },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Radiology Requests</CardTitle>
          <CardDescription>Recent imaging requests linked to visits</CardDescription>
        </CardHeader>
        <CardContent>
          {(requests?.length || 0) >= RADIOLOGY_LIST_LIMIT ? (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Showing the latest {RADIOLOGY_LIST_LIMIT} radiology requests. Apply filters, then continue in the
              detailed workflow for older items.
            </div>
          ) : null}
          <TableCard title="Radiology Requests" description="Recent imaging requests and results">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Study</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length > 0 ? (
                  rows.map((req) => (
                    <TableRow key={req.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div>
                          <p className="font-medium">{req.patients?.full_name}</p>
                          <p className="text-sm text-muted-foreground">{req.patients?.patient_number}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p>{req.study_type}</p>
                          <p className="text-sm text-muted-foreground uppercase">{req.modality}</p>
                        </div>
                      </TableCell>
                      <TableCell>Dr. {req.profiles?.full_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                          {req.visits?.facilities?.name && (
                            <span>{req.visits.facilities.name}</span>
                          )}
                          {req.visits?.is_free_health_care && (
                            <Badge variant="default" className="w-fit text-[10px] font-normal">
                              Free Health Care visit
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getPriorityColor(req.priority)}>{req.priority}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(req.status)}>{req.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/radiology/${req.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      {hasActiveFilters
                        ? "No radiology requests match the selected filters."
                        : "No radiology requests found."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableCard>
        </CardContent>
      </Card>
    </div>
  )
}
