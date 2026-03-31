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

interface SystemActivitySearchParams {
  module?: string
  actor?: string
  patient?: string
  action?: string
  from?: string
  to?: string
}

interface UnifiedActivityRow {
  id: string
  created_at: string
  module: "appointment" | "emergency" | "billing" | "lab" | "pharmacy"
  action: string
  actor_user_id: string
  patient_id: string | null
  patient_name: string | null
  patient_number: string | null
  resource_id: string
  resource_label: string | null
}

export const revalidate = 0
const PAGE_LIMIT = 250
const PAGE_SIZE = 100

export default async function SystemActivityPage({
  searchParams,
}: {
  searchParams?: Promise<SystemActivitySearchParams>
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

  const moduleFilter = (sp.module || "").trim() || "all"
  const actorFilter = (sp.actor || "").trim() || null
  const patientFilter = (sp.patient || "").trim() || null
  const actionFilter = (sp.action || "").trim() || null
  const fromFilter = (sp.from || "").trim() || null
  const toFilter = (sp.to || "").trim() || null
  const currentPage = Math.max(1, Number.parseInt((sp as { page?: string }).page || "1", 10) || 1)

  const shouldInclude = (module: UnifiedActivityRow["module"]) => {
    if (moduleFilter === "all" || !moduleFilter) return true
    return moduleFilter === module
  }

  const activityRows: UnifiedActivityRow[] = []
  const moduleRowCounts: Record<UnifiedActivityRow["module"], number> = {
    appointment: 0,
    emergency: 0,
    billing: 0,
    lab: 0,
    pharmacy: 0,
  }

  // Appointments
  if (shouldInclude("appointment")) {
    let q = supabase
      .from("appointment_audit_logs")
      .select("id, created_at, action, actor_user_id, appointment_id, patient_id")
      .order("created_at", { ascending: false })
      .limit(PAGE_LIMIT)

    if (actorFilter) q = q.eq("actor_user_id", actorFilter)
    if (actionFilter) q = q.eq("action", actionFilter)
    if (fromFilter) q = q.gte("created_at", fromFilter)
    if (toFilter) q = q.lte("created_at", toFilter)

    const { data } = await q

    const appointmentRows = (data || []) as {
      id: string
      created_at: string
      action: string
      actor_user_id: string
      appointment_id: string
      patient_id: string | null
    }[]
    moduleRowCounts.appointment = appointmentRows.length

    const patientIds = Array.from(
      new Set(appointmentRows.map((r) => r.patient_id).filter((id): id is string => Boolean(id))),
    )

    const patientsById = new Map<string, { full_name: string | null; patient_number: string | null }>()

    if (patientIds.length > 0) {
      const { data: patients } = await supabase
        .from("patients")
        .select("id, full_name, patient_number")
        .in("id", patientIds)

      for (const p of (patients || []) as { id: string; full_name: string | null; patient_number: string | null }[]) {
        patientsById.set(p.id, { full_name: p.full_name, patient_number: p.patient_number })
      }
    }

    for (const row of appointmentRows) {
      const patient = row.patient_id ? patientsById.get(row.patient_id) : undefined
      activityRows.push({
        id: row.id,
        created_at: row.created_at,
        module: "appointment",
        action: row.action,
        actor_user_id: row.actor_user_id,
        patient_id: row.patient_id,
        patient_name: patient?.full_name ?? null,
        patient_number: patient?.patient_number ?? null,
        resource_id: row.appointment_id,
        resource_label: null,
      })
    }
  }

  // Emergency / triage
  if (shouldInclude("emergency")) {
    let q = supabase
      .from("triage_audit_logs")
      .select("id, created_at, action, actor_user_id, triage_id")
      .order("created_at", { ascending: false })
      .limit(PAGE_LIMIT)

    if (actorFilter) q = q.eq("actor_user_id", actorFilter)
    if (actionFilter) q = q.eq("action", actionFilter)
    if (fromFilter) q = q.gte("created_at", fromFilter)
    if (toFilter) q = q.lte("created_at", toFilter)

    const { data } = await q

    const triageRows = (data || []) as {
      id: string
      created_at: string
      action: string
      actor_user_id: string
      triage_id: string
    }[]
    moduleRowCounts.emergency = triageRows.length

    const triageIds = Array.from(new Set(triageRows.map((r) => r.triage_id))) as string[]
    const triageById = new Map<
      string,
      {
        id: string
        patient_id: string | null
        triage_level: string | null
        status: string | null
        patients?: { full_name?: string | null; patient_number?: string | null } | null
      }
    >()

    if (triageIds.length > 0) {
      const { data: triages } = await supabase
        .from("triage_assessments")
        .select("id, patient_id, triage_level, status, patients(full_name, patient_number)")
        .in("id", triageIds)

      for (const t of triages || []) {
        triageById.set(t.id as string, {
          id: t.id as string,
          patient_id: (t.patient_id as string | null) ?? null,
          triage_level: (t.triage_level as string | null) ?? null,
          status: (t.status as string | null) ?? null,
          patients: t.patients as { full_name?: string | null; patient_number?: string | null } | null,
        })
      }
    }

    for (const row of triageRows) {
      const triage = triageById.get(row.triage_id)
      const patientId = triage?.patient_id ?? null
      const patientName = triage?.patients?.full_name ?? null
      const patientNumber = triage?.patients?.patient_number ?? null

      activityRows.push({
        id: row.id,
        created_at: row.created_at,
        module: "emergency",
        action: row.action,
        actor_user_id: row.actor_user_id,
        patient_id: patientId,
        patient_name: patientName,
        patient_number: patientNumber,
        resource_id: row.triage_id,
        resource_label: triage ? `${triage.triage_level || ""} · ${triage.status || ""}`.trim() || null : null,
      })
    }
  }

  // Billing
  if (shouldInclude("billing")) {
    let q = supabase
      .from("billing_audit_logs")
      .select("id, created_at, action, actor_user_id, invoice_id, metadata")
      .order("created_at", { ascending: false })
      .limit(PAGE_LIMIT)

    if (actorFilter) q = q.eq("actor_user_id", actorFilter)
    if (actionFilter) q = q.eq("action", actionFilter)
    if (fromFilter) q = q.gte("created_at", fromFilter)
    if (toFilter) q = q.lte("created_at", toFilter)

    const { data } = await q

    const billingRows = (data || []) as {
      id: string
      created_at: string
      action: string
      actor_user_id: string
      invoice_id: string
      metadata: {
        patient_id?: string | null
        patient_number?: string | null
        patient_name?: string | null
        invoice_number?: string | null
      } | null
    }[]
    moduleRowCounts.billing = billingRows.length

    for (const row of billingRows) {
      const meta = row.metadata || {}
      activityRows.push({
        id: row.id,
        created_at: row.created_at,
        module: "billing",
        action: row.action,
        actor_user_id: row.actor_user_id,
        patient_id: (meta.patient_id as string | undefined) ?? null,
        patient_name: (meta.patient_name as string | undefined) ?? null,
        patient_number: (meta.patient_number as string | undefined) ?? null,
        resource_id: row.invoice_id,
        resource_label: (meta.invoice_number as string | undefined) ?? null,
      })
    }
  }

  // Lab
  if (shouldInclude("lab")) {
    let q = supabase
      .from("lab_audit_logs")
      .select("id, created_at, action, actor_user_id, lab_test_id, metadata")
      .order("created_at", { ascending: false })
      .limit(PAGE_LIMIT)

    if (actorFilter) q = q.eq("actor_user_id", actorFilter)
    if (actionFilter) q = q.eq("action", actionFilter)
    if (fromFilter) q = q.gte("created_at", fromFilter)
    if (toFilter) q = q.lte("created_at", toFilter)

    const { data } = await q

    const labRows = (data || []) as {
      id: string
      created_at: string
      action: string
      actor_user_id: string
      lab_test_id: string
      metadata: { patient_id?: string | null; patient_number?: string | null; patient_name?: string | null; test_name?: string | null } | null
    }[]
    moduleRowCounts.lab = labRows.length

    for (const row of labRows) {
      const meta = row.metadata || {}
      activityRows.push({
        id: row.id,
        created_at: row.created_at,
        module: "lab",
        action: row.action,
        actor_user_id: row.actor_user_id,
        patient_id: (meta.patient_id as string | undefined) ?? null,
        patient_name: (meta.patient_name as string | undefined) ?? null,
        patient_number: (meta.patient_number as string | undefined) ?? null,
        resource_id: row.lab_test_id,
        resource_label: (meta.test_name as string | undefined) ?? null,
      })
    }
  }

  // Pharmacy
  if (shouldInclude("pharmacy")) {
    let q = supabase
      .from("pharmacy_audit_logs")
      .select("id, created_at, action, actor_user_id, prescription_id, metadata")
      .order("created_at", { ascending: false })
      .limit(PAGE_LIMIT)

    if (actorFilter) q = q.eq("actor_user_id", actorFilter)
    if (actionFilter) q = q.eq("action", actionFilter)
    if (fromFilter) q = q.gte("created_at", fromFilter)
    if (toFilter) q = q.lte("created_at", toFilter)

    const { data } = await q

    const pharmacyRows = (data || []) as {
      id: string
      created_at: string
      action: string
      actor_user_id: string
      prescription_id: string
      metadata: { patient_id?: string | null; patient_number?: string | null; patient_name?: string | null; prescription_number?: string | null } | null
    }[]
    moduleRowCounts.pharmacy = pharmacyRows.length

    for (const row of pharmacyRows) {
      const meta = row.metadata || {}
      activityRows.push({
        id: row.id,
        created_at: row.created_at,
        module: "pharmacy",
        action: row.action,
        actor_user_id: row.actor_user_id,
        patient_id: (meta.patient_id as string | undefined) ?? null,
        patient_name: (meta.patient_name as string | undefined) ?? null,
        patient_number: (meta.patient_number as string | undefined) ?? null,
        resource_id: row.prescription_id,
        resource_label: (meta.prescription_number as string | undefined) ?? null,
      })
    }
  }

  // Apply patient filter after enrichment since not all tables expose it directly
  const filteredRows = patientFilter
    ? activityRows.filter((row) => row.patient_id === patientFilter)
    : activityRows

  // Sort all rows by created_at descending
  filteredRows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))

  const totalRows = filteredRows.length
  const hasNextPage = totalRows > currentPage * PAGE_SIZE
  const pageSliceStart = (currentPage - 1) * PAGE_SIZE
  const pageSliceEnd = pageSliceStart + PAGE_SIZE
  const pageRows = filteredRows.slice(pageSliceStart, pageSliceEnd)

  const actorIds = Array.from(new Set(pageRows.map((r) => r.actor_user_id).filter(Boolean))) as string[]

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

  const renderModuleLabel = (module: UnifiedActivityRow["module"]) => {
    switch (module) {
      case "appointment":
        return "Appointment"
      case "emergency":
        return "Emergency triage"
      case "billing":
        return "Billing"
      case "lab":
        return "Lab"
      case "pharmacy":
        return "Pharmacy"
      default:
        return module
    }
  }

  const renderPatient = (row: UnifiedActivityRow) => {
    if (!row.patient_id && !row.patient_name) return "-"
    const name = row.patient_name || "Unknown"
    const num = row.patient_number || ""
    return num ? `${name} (${num})` : name
  }

  const buildLinkForRow = (row: UnifiedActivityRow) => {
    switch (row.module) {
      case "appointment":
        return `/dashboard/appointments/${row.resource_id}`
      case "emergency":
        return `/dashboard/emergency/${row.resource_id}`
      case "billing":
        return `/dashboard/billing/${row.resource_id}`
      case "lab":
        return `/dashboard/lab/${row.resource_id}`
      case "pharmacy":
        return `/dashboard/prescriptions/${row.resource_id}`
      default:
        return "#"
    }
  }

  const buildModuleActivityLink = (row: UnifiedActivityRow) => {
    const qs = new URLSearchParams({ actor: row.actor_user_id }).toString()
    const suffix = qs ? `?${qs}` : ""
    switch (row.module) {
      case "appointment":
        return `/dashboard/admin/appointment-activity${suffix}`
      case "emergency":
        return `/dashboard/admin/emergency-activity${suffix}`
      case "billing":
        return `/dashboard/admin/billing-activity${suffix}`
      case "lab":
        return `/dashboard/admin/lab-activity${suffix}`
      case "pharmacy":
        return `/dashboard/admin/pharmacy-activity${suffix}`
      default:
        return "/dashboard/admin"
    }
  }

  const truncatedModules = Object.entries(moduleRowCounts)
    .filter(([, count]) => count >= PAGE_LIMIT)
    .map(([module]) => renderModuleLabel(module as UnifiedActivityRow["module"]))

  const buildQueryString = (page = 1) => {
    const params = new URLSearchParams()
    if (page > 1) params.set("page", String(page))
    if (moduleFilter && moduleFilter !== "all") params.set("module", moduleFilter)
    if (actorFilter) params.set("actor", actorFilter)
    if (patientFilter) params.set("patient", patientFilter)
    if (actionFilter) params.set("action", actionFilter)
    if (fromFilter) params.set("from", fromFilter)
    if (toFilter) params.set("to", toFilter)
    const qs = params.toString()
    return qs ? `?${qs}` : ""
  }

  const renderActor = (actorId: string) => {
    const actor = actorProfilesById.get(actorId)
    if (!actor) return actorId
    if (actor.role) {
      return `${actor.full_name ?? "Unknown"} (${actor.role})`
    }
    return actor.full_name ?? actorId
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/admin">← Back to Admin</Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">System activity</h1>
            <p className="text-muted-foreground text-sm">
              Unified audit trail across appointments, emergency triage, billing, lab, and pharmacy.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by module, actor, patient, action, and date range.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-5xl">
            <div className="space-y-1">
              <Label htmlFor="module">Module</Label>
              <select
                id="module"
                name="module"
                aria-label="Module"
                defaultValue={moduleFilter || "all"}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="all">All</option>
                <option value="appointment">Appointments</option>
                <option value="emergency">Emergency</option>
                <option value="billing">Billing</option>
                <option value="lab">Lab</option>
                <option value="pharmacy">Pharmacy</option>
              </select>
            </div>
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
              <Input id="action" name="action" defaultValue={actionFilter || ""} placeholder="e.g. created" />
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

      {truncatedModules.length > 0 ? (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Results were capped at {PAGE_LIMIT} rows for: {truncatedModules.join(", ")}. Narrow filters or export CSV for fuller coverage.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Recent system activity</CardTitle>
              <CardDescription>Showing up to {PAGE_LIMIT} events per module (merged and sorted by time).</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/api/admin/system-activity${buildQueryString(currentPage)}`} prefetch={false}>
                Export CSV
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                      No system activity found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((row) => (
                    <TableRow key={`${row.module}:${row.id}`} className="hover:bg-muted/50">
                      <TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{renderModuleLabel(row.module)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.module === "emergency" && row.resource_label
                          ? row.resource_label
                          : row.module === "billing" && row.resource_label
                            ? `Invoice #${row.resource_label}`
                            : row.module === "lab" && row.resource_label
                              ? row.resource_label
                              : row.module === "pharmacy" && row.resource_label
                                ? `Rx #${row.resource_label}`
                                : "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.action}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{renderPatient(row)}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-foreground">{row.resource_label || row.resource_id}</span>
                          <Button
                            asChild
                            size="sm"
                            variant="link"
                            className="h-5 px-0 text-[11px] text-blue-600"
                          >
                            <Link href={buildLinkForRow(row)}>Open</Link>
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex flex-col gap-0.5">
                          <span>{renderActor(row.actor_user_id)}</span>
                          <Button
                            asChild
                            size="sm"
                            variant="link"
                            className="h-5 px-0 text-[11px] text-blue-600"
                          >
                            <Link href={buildModuleActivityLink(row)}>View actor activity</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {currentPage}
              {pageRows.length > 0 && ` · Showing ${pageRows.length} of ${totalRows} event${totalRows === 1 ? "" : "s"}`}
            </span>
            <div className="flex gap-2">
              {currentPage > 1 ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/dashboard/admin/system-activity${buildQueryString(currentPage - 1)}`}>Previous</Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  Previous
                </Button>
              )}
              {hasNextPage ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/dashboard/admin/system-activity${buildQueryString(currentPage + 1)}`}>Next</Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  Next
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
