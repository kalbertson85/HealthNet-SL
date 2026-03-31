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

interface EmergencyActivitySearchParams {
  actor?: string
  patient?: string
  action?: string
  from?: string
  to?: string
}

interface TriageAuditRow {
  id: string
  created_at: string
  action: string
  old_status: string | null
  new_status: string | null
  actor_user_id: string
  triage_id: string
}

export const revalidate = 0

export default async function EmergencyActivityPage({
  searchParams,
}: {
  searchParams?: Promise<EmergencyActivitySearchParams>
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

  const actorFilter = (sp.actor || "").trim() || null
  const patientFilter = (sp.patient || "").trim() || null
  const actionFilter = (sp.action || "").trim() || null
  const fromFilter = (sp.from || "").trim() || null
  const toFilter = (sp.to || "").trim() || null

  let query = supabase
    .from("triage_audit_logs")
    .select("id, created_at, action, old_status, new_status, actor_user_id, triage_id")
    .order("created_at", { ascending: false })
    .limit(200)

  if (actorFilter) {
    query = query.eq("actor_user_id", actorFilter)
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

  const { data, error } = await query

  if (error) {
    console.error("[v0] Error loading emergency activity:", error.message || error)
  }

  const rows = (data || []) as TriageAuditRow[]

  const triageIds = Array.from(new Set(rows.map((r) => r.triage_id))) as string[]
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_user_id).filter(Boolean))) as string[]

  const triageById = new Map<
    string,
    {
      id: string
      triage_level: string | null
      status: string | null
      patient_id: string | null
      patients?: { full_name?: string | null; patient_number?: string | null } | null
    }
  >()
  const actorProfilesById = new Map<string, { full_name: string | null; role: string | null }>()

  if (triageIds.length > 0) {
    const { data: triages } = await supabase
      .from("triage_assessments")
      .select("id, triage_level, status, patient_id, patients(full_name, patient_number)")
      .in("id", triageIds)

    for (const t of triages || []) {
      triageById.set(t.id as string, {
        id: t.id as string,
        triage_level: (t.triage_level as string | null) ?? null,
        status: (t.status as string | null) ?? null,
        patient_id: (t.patient_id as string | null) ?? null,
        patients: t.patients as { full_name?: string | null; patient_number?: string | null } | null,
      })
    }
  }

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

  const renderPatient = (triageId: string) => {
    const triage = triageById.get(triageId)
    if (!triage) return "-"
    const p = triage.patients
    if (!p) return triage.patient_id || "-"
    const name = p.full_name || "Unknown"
    const num = p.patient_number || ""
    return num ? `${name} (${num})` : name
  }

  const renderTriageSummary = (triageId: string) => {
    const triage = triageById.get(triageId)
    if (!triage) return "-"
    const level = triage.triage_level || "unknown"
    const status = triage.status || "unknown"
    return `${level} · ${status}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/admin">← Back to Admin</Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Emergency activity</h1>
            <p className="text-muted-foreground text-sm">
              Audit trail of triage creation and status changes across the Emergency module.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter emergency events by actor, patient, action, and date range.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-4xl">
            <div className="space-y-1">
              <Label htmlFor="actor">Actor user ID</Label>
              <Input id="actor" name="actor" defaultValue={actorFilter || ""} placeholder="User ID" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="patient">Patient ID (optional)</Label>
              <Input id="patient" name="patient" defaultValue={patientFilter || ""} placeholder="Patient UUID" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="action">Action</Label>
              <select
                id="action"
                name="action"
                aria-label="Action"
                defaultValue={actionFilter || ""}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">All</option>
                <option value="created">Triage created</option>
                <option value="status_updated">Status updated</option>
                <option value="notes_updated">Notes updated</option>
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
              <CardTitle>Recent emergency activity</CardTitle>
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
                  <TableHead>Action</TableHead>
                  <TableHead>Triage case</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      No emergency activity found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const actionLabel =
                      row.action === "created"
                        ? "Triage created"
                        : row.action === "status_updated"
                          ? "Status updated"
                          : "Notes updated"

                    return (
                      <TableRow key={row.id} className="hover:bg-muted/50">
                        <TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</TableCell>
                        <TableCell className="text-xs">{actionLabel}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-foreground">{renderTriageSummary(row.triage_id)}</span>
                            <Button
                              asChild
                              size="sm"
                              variant="link"
                              className="h-5 px-0 text-[11px] text-blue-600"
                            >
                              <Link href={`/dashboard/emergency/${row.triage_id}`}>View case</Link>
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{renderPatient(row.triage_id)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{renderActor(row.actor_user_id)}</TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
