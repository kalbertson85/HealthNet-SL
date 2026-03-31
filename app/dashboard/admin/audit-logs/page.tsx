import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { ROLES } from "@/lib/utils"

interface AdminAuditLogRow {
  id: string
  created_at: string
  actor_user_id: string
  target_user_id: string
  action: string
  old_role: string | null
  new_role: string | null
  old_status: string | null
  new_status: string | null
}

interface AuditLogsPageProps {
  searchParams?: Promise<{
    actor?: string
    target?: string
    action?: string
    from?: string
    to?: string
  }>
}

export const revalidate = 0

export default async function AuditLogsPage({ searchParams }: AuditLogsPageProps) {
  const supabase = await createServerClient()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const role = profile?.role ?? user.role
  if (role !== ROLES.ADMIN && role !== ROLES.FACILITY_ADMIN) {
    redirect("/dashboard")
  }

  const sp = searchParams ? await searchParams : undefined

  const actorFilter = (sp?.actor || "").trim() || null
  const targetFilter = (sp?.target || "").trim() || null
  const actionFilter = (sp?.action || "").trim() || null
  const fromFilter = (sp?.from || "").trim() || null
  const toFilter = (sp?.to || "").trim() || null

  let query = supabase
    .from("admin_audit_logs")
    .select("id, created_at, actor_user_id, target_user_id, action, old_role, new_role, old_status, new_status")
    .order("created_at", { ascending: false })
    .limit(200)

  if (actorFilter) {
    query = query.eq("actor_user_id", actorFilter)
  }
  if (targetFilter) {
    query = query.eq("target_user_id", targetFilter)
  }
  if (actionFilter) {
    query = query.eq("action", actionFilter)
  }
  if (fromFilter) {
    query = query.gte("created_at", fromFilter)
  }
  if (toFilter) {
    query = query.lte("created_at", toFilter)
  }

  const { data: logs, error } = await query

  if (error) {
    console.error("[v0] Error loading admin audit logs", error)
  }

  const rows = (logs || []) as AdminAuditLogRow[]

  const actorTargetIds: string[] = Array.from(
    new Set(
      rows
        .flatMap((row) => [row.actor_user_id, row.target_user_id])
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  )

  let profiles: { id: string; full_name: string | null; email: string | null }[] = []
  if (actorTargetIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", actorTargetIds)

    profiles = (profileRows || []) as { id: string; full_name: string | null; email: string | null }[]
  }

  const profileMap = new Map<string, { name: string; email: string | null }>()
  for (const p of profiles || []) {
    profileMap.set(p.id as string, { name: (p.full_name as string) || "(No name)", email: (p.email as string) || null })
  }

  const formatDateTime = (value: string | null) => {
    if (!value) return ""
    try {
      return new Date(value).toLocaleString()
    } catch {
      return value
    }
  }

  const formatUser = (id: string | null | undefined) => {
    if (!id) return "-"
    const p = profileMap.get(id)
    if (!p) return id
    return p.email ? `${p.name} <${p.email}>` : p.name
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Admin
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin audit logs</h1>
            <p className="text-muted-foreground">
              Read-only log of admin changes to staff roles and account status.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by actor, target, action type, and date range.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mx-auto w-full max-w-4xl">
            <form method="GET" className="space-y-4 text-sm">
              {/* Row 1: Actor / Target / Action */}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <label htmlFor="actor" className="text-xs font-medium text-muted-foreground">
                    Actor ID
                  </label>
                  <input
                    id="actor"
                    name="actor"
                    defaultValue={actorFilter || ""}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="target" className="text-xs font-medium text-muted-foreground">
                    Target ID
                  </label>
                  <input
                    id="target"
                    name="target"
                    defaultValue={targetFilter || ""}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="action" className="text-xs font-medium text-muted-foreground">
                    Action type
                  </label>
                  <select
                    id="action"
                    name="action"
                    defaultValue={actionFilter || ""}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">All</option>
                    <option value="role_change">Role change</option>
                    <option value="status_change">Status change</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Date range + button */}
              <div className="grid gap-3 md:grid-cols-3 items-end">
                <div className="space-y-1">
                  <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
                    From
                  </label>
                  <input
                    id="from"
                    name="from"
                    type="datetime-local"
                    defaultValue={fromFilter || ""}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="to" className="text-xs font-medium text-muted-foreground">
                    To
                  </label>
                  <input
                    id="to"
                    name="to"
                    type="datetime-local"
                    defaultValue={toFilter || ""}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm">
                    Apply filters
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent admin actions</CardTitle>
          <CardDescription>Showing up to 200 matching entries.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Before</TableHead>
                  <TableHead>After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                      No audit log entries found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((log) => (
                    <TableRow key={log.id} className="hover:bg-muted/50">
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDateTime(log.created_at)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {formatUser(log.actor_user_id)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {formatUser(log.target_user_id)}
                      </TableCell>
                      <TableCell className="text-xs font-medium">{log.action}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.action === "role_change"
                          ? (log.old_role || "-")
                          : log.action === "status_change"
                            ? (log.old_status || "-")
                            : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.action === "role_change"
                          ? (log.new_role || "-")
                          : log.action === "status_change"
                            ? (log.new_status || "-")
                            : "-"}
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
