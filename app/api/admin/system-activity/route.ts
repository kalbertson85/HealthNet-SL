import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { ROLES } from "@/lib/utils"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

export const dynamic = "force-dynamic"
export const SYSTEM_ACTIVITY_CSV_HEADER = [
  "module",
  "id",
  "created_at",
  "action",
  "actor_user_id",
  "actor_name",
  "actor_role",
  "patient_id",
  "patient_name",
  "patient_number",
  "resource_id",
  "resource_label",
  "triage_level",
  "triage_status",
  "invoice_number",
  "lab_test_name",
  "prescription_number",
]

export async function GET(req: NextRequest) {
  const limited = enforceFixedWindowRateLimit(req, {
    key: "api_admin_system_activity",
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (limited) return limited

  const supabase = await createServerClient()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    return apiError(401, "unauthorized", "Unauthorized", req)
  }

  const role = profile?.role ?? user.role
  if (role !== ROLES.ADMIN && role !== ROLES.FACILITY_ADMIN) {
    return apiError(403, "forbidden", "Forbidden", req)
  }

  const { searchParams } = new URL(req.url)

  const moduleFilter = searchParams.get("module")?.trim() || "all"
  const actorFilter = searchParams.get("actor")?.trim() || null
  const patientFilter = searchParams.get("patient")?.trim() || null
  const actionFilter = searchParams.get("action")?.trim() || null
  const fromFilter = searchParams.get("from")?.trim() || null
  const toFilter = searchParams.get("to")?.trim() || null
  const pageParam = searchParams.get("page")?.trim() || null
  const pageSizeParam = searchParams.get("page_size")?.trim() || null

  const page = Math.max(1, Number.parseInt(pageParam || "1", 10) || 1)
  const pageSize = Math.min(1000, Math.max(1, Number.parseInt(pageSizeParam || "500", 10) || 500))

  type ModuleKey = "appointment" | "emergency" | "billing" | "lab" | "pharmacy"

  interface CsvRow {
    module: ModuleKey
    id: string
    created_at: string
    action: string
    actor_user_id: string
    actor_name: string | null
    actor_role: string | null
    patient_id: string | null
    patient_name: string | null
    patient_number: string | null
    resource_id: string
    resource_label: string | null
    triage_level: string | null
    triage_status: string | null
    invoice_number: string | null
    lab_test_name: string | null
    prescription_number: string | null
  }

  const shouldInclude = (module: ModuleKey) => {
    if (!moduleFilter || moduleFilter === "all") return true
    return moduleFilter === module
  }

  const rows: CsvRow[] = []

  // Appointments
  if (shouldInclude("appointment")) {
    let q = supabase
      .from("appointment_audit_logs")
      .select("id, created_at, action, actor_user_id, appointment_id, patient_id")
      .order("created_at", { ascending: false })
      .limit(2000)

    if (actorFilter) q = q.eq("actor_user_id", actorFilter)
    if (actionFilter) q = q.eq("action", actionFilter)
    if (fromFilter) q = q.gte("created_at", fromFilter)
    if (toFilter) q = q.lte("created_at", toFilter)

    const { data, error } = await q
    if (error) {
      console.error("[v0] Error exporting appointment activity for system-activity:", error.message || error)
      return apiError(500, "export_failed", "Failed to export", req)
    }

    const appointmentRows = (data || []) as {
      id: string
      created_at: string
      action: string
      actor_user_id: string
      appointment_id: string
      patient_id: string | null
    }[]

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
      rows.push({
        module: "appointment",
        id: row.id,
        created_at: row.created_at,
        action: row.action,
        actor_user_id: row.actor_user_id,
        actor_name: null,
        actor_role: null,
        patient_id: row.patient_id,
        patient_name: patient?.full_name ?? null,
        patient_number: patient?.patient_number ?? null,
        resource_id: row.appointment_id,
        resource_label: null,
        triage_level: null,
        triage_status: null,
        invoice_number: null,
        lab_test_name: null,
        prescription_number: null,
      })
    }
  }

  // Emergency / triage
  if (shouldInclude("emergency")) {
    let q = supabase
      .from("triage_audit_logs")
      .select("id, created_at, action, actor_user_id, triage_id")
      .order("created_at", { ascending: false })
      .limit(2000)

    if (actorFilter) q = q.eq("actor_user_id", actorFilter)
    if (actionFilter) q = q.eq("action", actionFilter)
    if (fromFilter) q = q.gte("created_at", fromFilter)
    if (toFilter) q = q.lte("created_at", toFilter)

    const { data, error } = await q
    if (error) {
      console.error("[v0] Error exporting emergency activity for system-activity:", error.message || error)
      return apiError(500, "export_failed", "Failed to export", req)
    }

    const triageRows = (data || []) as {
      id: string
      created_at: string
      action: string
      actor_user_id: string
      triage_id: string
    }[]

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

      rows.push({
        module: "emergency",
        id: row.id,
        created_at: row.created_at,
        action: row.action,
        actor_user_id: row.actor_user_id,
        actor_name: null,
        actor_role: null,
        patient_id: patientId,
        patient_name: patientName,
        patient_number: patientNumber,
        resource_id: row.triage_id,
        resource_label: triage ? `${triage.triage_level || ""} · ${triage.status || ""}`.trim() || null : null,
        triage_level: triage?.triage_level ?? null,
        triage_status: triage?.status ?? null,
        invoice_number: null,
        lab_test_name: null,
        prescription_number: null,
      })
    }
  }

  // Billing
  if (shouldInclude("billing")) {
    let q = supabase
      .from("billing_audit_logs")
      .select("id, created_at, action, actor_user_id, invoice_id, metadata")
      .order("created_at", { ascending: false })
      .limit(2000)

    if (actorFilter) q = q.eq("actor_user_id", actorFilter)
    if (actionFilter) q = q.eq("action", actionFilter)
    if (fromFilter) q = q.gte("created_at", fromFilter)
    if (toFilter) q = q.lte("created_at", toFilter)

    const { data, error } = await q
    if (error) {
      console.error("[v0] Error exporting billing activity for system-activity:", error.message || error)
      return apiError(500, "export_failed", "Failed to export", req)
    }

    const billingRows = (data || []) as {
      id: string
      created_at: string
      action: string
      actor_user_id: string
      invoice_id: string
      metadata: { patient_id?: string | null; patient_number?: string | null; patient_name?: string | null; invoice_number?: string | null } | null
    }[]

    for (const row of billingRows) {
      const meta = row.metadata || {}
      rows.push({
        module: "billing",
        id: row.id,
        created_at: row.created_at,
        action: row.action,
        actor_user_id: row.actor_user_id,
        actor_name: null,
        actor_role: null,
        patient_id: (meta.patient_id as string | undefined) ?? null,
        patient_name: (meta.patient_name as string | undefined) ?? null,
        patient_number: (meta.patient_number as string | undefined) ?? null,
        resource_id: row.invoice_id,
        resource_label: (meta.invoice_number as string | undefined) ?? null,
        triage_level: null,
        triage_status: null,
        invoice_number: (meta.invoice_number as string | undefined) ?? null,
        lab_test_name: null,
        prescription_number: null,
      })
    }
  }

  // Lab
  if (shouldInclude("lab")) {
    let q = supabase
      .from("lab_audit_logs")
      .select("id, created_at, action, actor_user_id, lab_test_id, metadata")
      .order("created_at", { ascending: false })
      .limit(2000)

    if (actorFilter) q = q.eq("actor_user_id", actorFilter)
    if (actionFilter) q = q.eq("action", actionFilter)
    if (fromFilter) q = q.gte("created_at", fromFilter)
    if (toFilter) q = q.lte("created_at", toFilter)

    const { data, error } = await q
    if (error) {
      console.error("[v0] Error exporting lab activity for system-activity:", error.message || error)
      return apiError(500, "export_failed", "Failed to export", req)
    }

    const labRows = (data || []) as {
      id: string
      created_at: string
      action: string
      actor_user_id: string
      lab_test_id: string
      metadata: { patient_id?: string | null; patient_number?: string | null; patient_name?: string | null; test_name?: string | null } | null
    }[]

    for (const row of labRows) {
      const meta = row.metadata || {}
      rows.push({
        module: "lab",
        id: row.id,
        created_at: row.created_at,
        action: row.action,
        actor_user_id: row.actor_user_id,
        actor_name: null,
        actor_role: null,
        patient_id: (meta.patient_id as string | undefined) ?? null,
        patient_name: (meta.patient_name as string | undefined) ?? null,
        patient_number: (meta.patient_number as string | undefined) ?? null,
        resource_id: row.lab_test_id,
        resource_label: (meta.test_name as string | undefined) ?? null,
        triage_level: null,
        triage_status: null,
        invoice_number: null,
        lab_test_name: (meta.test_name as string | undefined) ?? null,
        prescription_number: null,
      })
    }
  }

  // Pharmacy
  if (shouldInclude("pharmacy")) {
    let q = supabase
      .from("pharmacy_audit_logs")
      .select("id, created_at, action, actor_user_id, prescription_id, metadata")
      .order("created_at", { ascending: false })
      .limit(2000)

    if (actorFilter) q = q.eq("actor_user_id", actorFilter)
    if (actionFilter) q = q.eq("action", actionFilter)
    if (fromFilter) q = q.gte("created_at", fromFilter)
    if (toFilter) q = q.lte("created_at", toFilter)

    const { data, error } = await q
    if (error) {
      console.error("[v0] Error exporting pharmacy activity for system-activity:", error.message || error)
      return apiError(500, "export_failed", "Failed to export", req)
    }

    const pharmacyRows = (data || []) as {
      id: string
      created_at: string
      action: string
      actor_user_id: string
      prescription_id: string
      metadata: { patient_id?: string | null; patient_number?: string | null; patient_name?: string | null; prescription_number?: string | null } | null
    }[]

    for (const row of pharmacyRows) {
      const meta = row.metadata || {}
      rows.push({
        module: "pharmacy",
        id: row.id,
        created_at: row.created_at,
        action: row.action,
        actor_user_id: row.actor_user_id,
        actor_name: null,
        actor_role: null,
        patient_id: (meta.patient_id as string | undefined) ?? null,
        patient_name: (meta.patient_name as string | undefined) ?? null,
        patient_number: (meta.patient_number as string | undefined) ?? null,
        resource_id: row.prescription_id,
        resource_label: (meta.prescription_number as string | undefined) ?? null,
        triage_level: null,
        triage_status: null,
        invoice_number: null,
        lab_test_name: null,
        prescription_number: (meta.prescription_number as string | undefined) ?? null,
      })
    }
  }

  // Resolve actor name/role for all unique actors
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_user_id).filter(Boolean))) as string[]

  if (actorIds.length > 0) {
    const { data: actors } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("id", actorIds)

    const actorMap = new Map<string, { full_name: string | null; role: string | null }>()
    for (const a of actors || []) {
      actorMap.set(a.id as string, {
        full_name: (a.full_name as string | null) ?? null,
        role: (a.role as string | null) ?? null,
      })
    }

    for (const row of rows) {
      const a = actorMap.get(row.actor_user_id)
      if (a) {
        row.actor_name = a.full_name
        row.actor_role = a.role
      }
    }
  }

  // Optional patient filter (after enrichment)
  const filteredRows = patientFilter ? rows.filter((r) => r.patient_id === patientFilter) : rows

  // Sort by time desc
  filteredRows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))

  const pageStart = (page - 1) * pageSize
  const pageEnd = pageStart + pageSize
  const pageRows = filteredRows.slice(pageStart, pageEnd)

  const csvLines = [SYSTEM_ACTIVITY_CSV_HEADER.join(",")]

  for (const row of pageRows) {
    const values = [
      row.module,
      row.id,
      row.created_at,
      row.action,
      row.actor_user_id,
      row.actor_name ?? "",
      row.actor_role ?? "",
      row.patient_id ?? "",
      row.patient_name ?? "",
      row.patient_number ?? "",
      row.resource_id,
      row.resource_label ?? "",
      row.triage_level ?? "",
      row.triage_status ?? "",
      row.invoice_number ?? "",
      row.lab_test_name ?? "",
      row.prescription_number ?? "",
    ].map((value) => {
      const v = String(value ?? "")
      if (v.includes(",") || v.includes("\"") || v.includes("\n")) {
        return `"${v.replace(/"/g, '""')}"`
      }
      return v
    })

    csvLines.push(values.join(","))
  }

  const csv = csvLines.join("\n")

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=system_activity.csv",
      ...NO_STORE_DOWNLOAD_HEADERS,
    },
  })
}
