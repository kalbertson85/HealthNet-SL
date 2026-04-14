import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus } from "lucide-react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableCard } from "@/components/table-card"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { ReportFilterSummary } from "@/components/report-filter-summary"
import { ExportPreviewCard } from "@/components/export-preview-card"
import { getGlobalSettings } from "@/lib/global-settings"

const LAB_LIST_LIMIT = 50

interface LabTestRow {
  id: string
  test_number: string
  test_type: string
  test_category: string
  priority: string
  status: string
  patients?: { full_name?: string | null; patient_number?: string | null } | null
  profiles?: { full_name?: string | null } | null
  visits?: {
    is_free_health_care?: boolean | null
    facilities?: { name?: string | null } | null
  } | null
}

export default async function LabTestsPage(props: {
  searchParams?: Promise<{ status?: string; priority?: string }>
}) {
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()
  const searchParams = props.searchParams ? await props.searchParams : undefined
  const statusFilter = (searchParams?.status || "all").trim().toLowerCase()
  const priorityFilter = (searchParams?.priority || "all").trim().toLowerCase()
  const hasActiveFilters = statusFilter !== "all" || priorityFilter !== "all"

  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "lab.manage")) {
    redirect("/dashboard")
  }
  const canExport = can(rbacUser, "admin.export")
  const exportQuery = new URLSearchParams()
  if (statusFilter !== "all") exportQuery.set("status", statusFilter)
  if (priorityFilter !== "all") exportQuery.set("priority", priorityFilter)
  const exportHref = exportQuery.toString()
    ? `/api/export/lab-tests?${exportQuery.toString()}`
    : "/api/export/lab-tests"

  // Fetch lab tests
  const { data: labTests } = await supabase
    .from("lab_tests")
    .select(`
      *,
      patients(full_name, patient_number),
      profiles(full_name),
      visits(is_free_health_care,
        facilities(name)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(LAB_LIST_LIMIT)

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "default"
      case "in_progress":
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

  const rows = ((labTests || []) as LabTestRow[]).filter((test) => {
    if (statusFilter !== "all" && (test.status || "").toLowerCase() !== statusFilter) return false
    if (priorityFilter !== "all" && (test.priority || "").toLowerCase() !== priorityFilter) return false
    return true
  })

  const statusSummary = {
    pending: rows.filter((test) => test.status === "pending").length,
    inProgress: rows.filter((test) => test.status === "in_progress").length,
    completed: rows.filter((test) => test.status === "completed").length,
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Laboratory Tests</h1>
          <p className="text-pretty text-muted-foreground">Manage lab test orders and results</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/lab/new">
            <Plus className="mr-2 h-4 w-4" />
            New Lab Test
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Pending</CardTitle>
            <CardDescription>Awaiting sample processing or review.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{statusSummary.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>In Progress</CardTitle>
            <CardDescription>Currently being processed by the lab team.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{statusSummary.inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Completed</CardTitle>
            <CardDescription>Tests with entered results.</CardDescription>
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
            <option value="in_progress">In progress</option>
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
              <Link href="/dashboard/lab">Reset</Link>
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
      {canExport ? (
        <ExportPreviewCard
          title="Export current lab view"
          description="Apply status and priority filters, confirm the current lab preview, then export that same filtered set as CSV."
          href={exportHref}
          previewCount={rows.length}
          previewLabel="lab tests are visible in the current preview"
          limitNote="Exports honor status and priority filters and return up to 5,000 rows."
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>All Lab Tests</CardTitle>
          <CardDescription>Recent lab test orders and results</CardDescription>
        </CardHeader>
        <CardContent>
          {(labTests?.length || 0) >= LAB_LIST_LIMIT ? (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Showing the latest {LAB_LIST_LIMIT} lab tests. Use status and priority filters, then open the relevant
              workflow for older records.
            </div>
          ) : null}
          <TableCard title="All Lab Tests" description="Recent lab test orders and results">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Test Type</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length > 0 ? (
                  rows.map((test: LabTestRow) => (
                    <TableRow key={test.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{test.test_number}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{test.patients?.full_name}</p>
                          <p className="text-sm text-muted-foreground">{test.patients?.patient_number}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p>{test.test_type}</p>
                          <p className="text-sm text-muted-foreground">{test.test_category}</p>
                        </div>
                      </TableCell>
                      <TableCell>Dr. {test.profiles?.full_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                          {test.visits?.facilities?.name && <span>{test.visits.facilities.name}</span>}
                          {test.visits?.is_free_health_care && (
                            <Badge variant="default" className="w-fit text-[10px] font-normal">
                              {settings.publicCoverageLabel} visit
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getPriorityColor(test.priority)}>{test.priority}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(test.status)}>{test.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/lab/${test.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      {hasActiveFilters ? "No lab tests match the selected filters." : "No lab tests found."}
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
