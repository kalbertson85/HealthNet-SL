import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { ROLES } from "@/lib/utils"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const limited = enforceFixedWindowRateLimit(req, {
    key: "api_admin_appointment_activity",
    maxRequests: 30,
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

  const actorFilter = searchParams.get("actor")?.trim() || null
  const doctorFilter = searchParams.get("doctor")?.trim() || null
  const patientFilter = searchParams.get("patient")?.trim() || null
  const actionFilter = searchParams.get("action")?.trim() || null
  const fromFilter = searchParams.get("from")?.trim() || null
  const toFilter = searchParams.get("to")?.trim() || null

  let query = supabase
    .from("appointment_audit_logs")
    .select("id, created_at, action, old_status, new_status, actor_user_id, appointment_id, patient_id, doctor_id")
    .order("created_at", { ascending: false })
    .limit(1000)

  if (actorFilter) {
    query = query.eq("actor_user_id", actorFilter)
  }
  if (doctorFilter) {
    query = query.eq("doctor_id", doctorFilter)
  }
  if (patientFilter) {
    query = query.eq("patient_id", patientFilter)
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
    console.error("[v0] Error exporting appointment activity:", error.message || error)
    return apiError(500, "export_failed", "Failed to export", req)
  }

  const rows = data || []
  type AppointmentAuditRow = {
    id: string
    created_at: string
    action: string
    old_status: string | null
    new_status: string | null
    actor_user_id: string
    appointment_id: string
    patient_id: string | null
    doctor_id: string | null
  }

  const header = [
    "id",
    "created_at",
    "action",
    "old_status",
    "new_status",
    "actor_user_id",
    "appointment_id",
    "patient_id",
    "doctor_id",
  ]

  const csvLines = [header.join(",")]

  for (const row of rows as AppointmentAuditRow[]) {
    const values = [
      row.id,
      row.created_at,
      row.action,
      row.old_status ?? "",
      row.new_status ?? "",
      row.actor_user_id,
      row.appointment_id,
      row.patient_id ?? "",
      row.doctor_id ?? "",
    ]
      .map((value) => {
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
      "Content-Disposition": "attachment; filename=appointment_activity.csv",
      ...NO_STORE_DOWNLOAD_HEADERS,
    },
  })
}
