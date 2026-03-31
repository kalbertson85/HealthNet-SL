import { redirect } from "next/navigation"
import Link from "next/link"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { ROLES } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface LabActivitySearchParams {
  q?: string
  status?: string
  priority?: string
  action?: string
  from?: string
  to?: string
}

interface LabTestRow {
  id: string
  created_at: string
  test_number: string
  test_type: string
  test_category: string
  priority: string
  status: string
  patients?: { full_name?: string | null; patient_number?: string | null } | null
  profiles?: { full_name?: string | null } | null
}

export const revalidate = 0

export default async function LabActivityPage({
  searchParams,
}: {
  searchParams?: Promise<LabActivitySearchParams>
}) {
  const supabase = await createServerClient()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const role = profile?.role ?? user.role
  if (role !== ROLES.ADMIN && role !== ROLES.FACILITY_ADMIN) {
    redirect("/dashboard")
  }

  const sp = searchParams ? await searchParams : {}

  const q = (sp.q || "").trim().toLowerCase()
  const statusFilter = (sp.status || "").trim().toLowerCase() || null
  const priorityFilter = (sp.priority || "").trim().toLowerCase() || null
  const actionFilter = (sp.action || "").trim() || null
  const fromFilter = (sp.from || "").trim() || null
  const toFilter = (sp.to || "").trim() || null

  let query = supabase
    .from("lab_tests")
    .select(
      `id, created_at, test_number, test_type, test_category, priority, status,
       patients(full_name, patient_number),
       profiles(full_name)`,
    )
    .order("created_at", { ascending: false })
    .limit(200)

  if (statusFilter) {
    query = query.eq("status", statusFilter)
  }
  if (priorityFilter) {
    query = query.eq("priority", priorityFilter)
  }
  if (fromFilter) {
    query = query.gte("created_at", fromFilter)
  }
  if (toFilter) {
    query = query.lte("created_at", toFilter)
  }

  const { data, error } = await query

  if (error) {
    console.error("[v0] Error loading lab activity:", error.message || error)
  }

  let rows = (data || []) as LabTestRow[]

  // Load latest lab_audit_logs per test to show last activity and support action filter
  const testIds = Array.from(new Set(rows.map((r) => r.id))) as string[]
  const lastActivityByTestId = new Map<
    string,
    { action: string; created_at: string }
  >()

  if (testIds.length > 0) {
    const { data: auditRows } = await supabase
      .from("lab_audit_logs")
      .select("lab_test_id, action, created_at")
      .in("lab_test_id", testIds)
      .order("created_at", { ascending: false })

    for (const row of auditRows || []) {
      const labTestId = row.lab_test_id as string
      if (!lastActivityByTestId.has(labTestId)) {
        lastActivityByTestId.set(labTestId, {
          action: row.action as string,
          created_at: row.created_at as string,
        })
      }
    }
  }

  if (q) {
    rows = rows.filter((row) => {
      const haystack = [
        row.test_number,
        row.test_type,
        row.test_category,
        row.patients?.full_name,
        row.patients?.patient_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }

  if (actionFilter) {
    rows = rows.filter((row) => {
      const last = lastActivityByTestId.get(row.id)
      if (!last) return false
      return last.action === actionFilter
    })
  }

  const formatDateTime = (value: string) => {
    try {
      return new Date(value).toLocaleString()
    } catch {
      return value
    }
  }

  const renderPatient = (row: LabTestRow) => {
    const p = row.patients
    if (!p) return "-"
    const name = p.full_name || "Unknown"
    const num = p.patient_number || ""
    return num ? `${name} (${num})` : name
  }

  const renderLastActivity = (labTestId: string) => {
    const last = lastActivityByTestId.get(labTestId)
    if (!last) return "-"

    const label =
      last.action === "created"
        ? "Created"
        : last.action === "sample_collected"
          ? "Sample collected"
          : last.action === "sample_received"
            ? "Sample received"
            : last.action === "status_updated"
              ? "Status updated"
              : last.action === "result_entered"
                ? "Results entered"
                : last.action === "cancelled"
                  ? "Cancelled"
                  : last.action

    return `${label} · ${formatDateTime(last.created_at)}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/admin">← Back to Admin</Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Lab activity</h1>
            <p className="text-muted-foreground text-sm">
              Recent laboratory tests created across the system.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter lab tests by search, status, priority, and date range.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-4xl">
            <div className="space-y-1">
              <Label htmlFor="q">Search</Label>
              <Input
                id="q"
                name="q"
                defaultValue={sp.q || ""}
                placeholder="Test #, patient name or number, test type"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="action">Last action</Label>
              <select
                id="action"
                name="action"
                aria-label="Last action"
                defaultValue={actionFilter || ""}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">All</option>
                <option value="created">Created</option>
                <option value="sample_collected">Sample collected</option>
                <option value="sample_received">Sample received</option>
                <option value="status_updated">Status updated</option>
                <option value="result_entered">Results entered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                aria-label="Status"
                defaultValue={statusFilter || ""}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                name="priority"
                aria-label="Priority"
                defaultValue={priorityFilter || ""}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">All</option>
                <option value="stat">STAT</option>
                <option value="urgent">Urgent</option>
                <option value="routine">Routine</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="datetime-local" name="from" defaultValue={fromFilter || ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="datetime-local" name="to" defaultValue={toFilter || ""} />
            </div>
            <div className="flex items-end justify-end">
              <Button type="submit" className="w-full md:w-auto">
                Apply filters
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Recent lab tests</CardTitle>
              <CardDescription>Showing up to 200 matching entries.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Test #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Test</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                      No lab tests found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/50">
                      <TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-foreground">{row.test_number}</span>
                          <Button
                            asChild
                            size="sm"
                            variant="link"
                            className="h-5 px-0 text-[11px] text-blue-600"
                          >
                            <Link href={`/dashboard/lab/${row.id}`}>View test</Link>
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{renderPatient(row)}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span>{row.test_type}</span>
                          <span className="text-[11px] text-muted-foreground">{row.test_category}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs capitalize">{row.priority}</TableCell>
                      <TableCell className="text-xs capitalize">{row.status}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {renderLastActivity(row.id)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
