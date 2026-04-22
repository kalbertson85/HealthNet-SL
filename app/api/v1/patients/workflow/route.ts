import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { API_V1_VERSION, type ApiV1PatientsWorkflowResponse } from "@/lib/api/v1"

const querySchema = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
})

const DOCTOR_STAGE_STATUSES = ["doctor_pending", "doctor_review"] as const
const PHARMACY_STAGE_STATUSES = ["pharmacy_pending"] as const
const DISCHARGED_OR_COMPLETED_STATUSES = ["discharged", "completed"] as const

function parseDayRange(fromRaw?: string, toRaw?: string) {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999))

  const from = fromRaw ? new Date(`${fromRaw}T00:00:00Z`) : monthStart
  const to = toRaw ? new Date(`${toRaw}T23:59:59.999Z`) : monthEnd
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from.getTime() > to.getTime()) {
    return null
  }

  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    fromDay: from.toISOString().slice(0, 10),
    toDay: to.toISOString().slice(0, 10),
  }
}

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_v1_patients_workflow",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "patients.view")
    const parsed = querySchema.safeParse({
      from: request.nextUrl.searchParams.get("from") || undefined,
      to: request.nextUrl.searchParams.get("to") || undefined,
    })
    if (!parsed.success) {
      return apiError(400, "invalid_query", "Invalid query parameters", request)
    }

    const range = parseDayRange(parsed.data.from, parsed.data.to)
    if (!range) {
      return apiError(400, "invalid_range", "Invalid date range", request)
    }

    const [
      registeredPatients,
      triagedPatients,
      queuedPatients,
      doctorStageVisits,
      labOrders,
      radiologyOrders,
      prescriptionsCreated,
      pharmacyStageVisits,
      billedInvoices,
      admissionsCreated,
      dischargedOrCompletedVisits,
    ] = await Promise.all([
      supabase.from("patients").select("id", { count: "exact", head: true }).gte("created_at", range.fromIso).lte("created_at", range.toIso),
      supabase.from("triage_assessments").select("id", { count: "exact", head: true }).gte("created_at", range.fromIso).lte("created_at", range.toIso),
      supabase.from("queues").select("id", { count: "exact", head: true }).gte("check_in_time", range.fromIso).lte("check_in_time", range.toIso),
      supabase
        .from("visits")
        .select("id", { count: "exact", head: true })
        .gte("created_at", range.fromIso)
        .lte("created_at", range.toIso)
        .in("visit_status", [...DOCTOR_STAGE_STATUSES]),
      supabase.from("lab_tests").select("id", { count: "exact", head: true }).gte("created_at", range.fromIso).lte("created_at", range.toIso),
      supabase.from("radiology_requests").select("id", { count: "exact", head: true }).gte("created_at", range.fromIso).lte("created_at", range.toIso),
      supabase.from("prescriptions").select("id", { count: "exact", head: true }).gte("created_at", range.fromIso).lte("created_at", range.toIso),
      supabase
        .from("visits")
        .select("id", { count: "exact", head: true })
        .gte("created_at", range.fromIso)
        .lte("created_at", range.toIso)
        .in("visit_status", [...PHARMACY_STAGE_STATUSES]),
      supabase.from("invoices").select("id", { count: "exact", head: true }).gte("created_at", range.fromIso).lte("created_at", range.toIso),
      supabase.from("admissions").select("id", { count: "exact", head: true }).gte("created_at", range.fromIso).lte("created_at", range.toIso),
      supabase
        .from("visits")
        .select("id", { count: "exact", head: true })
        .gte("created_at", range.fromIso)
        .lte("created_at", range.toIso)
        .in("visit_status", [...DISCHARGED_OR_COMPLETED_STATUSES]),
    ])

    const hasError = [
      registeredPatients,
      triagedPatients,
      queuedPatients,
      doctorStageVisits,
      labOrders,
      radiologyOrders,
      prescriptionsCreated,
      pharmacyStageVisits,
      billedInvoices,
      admissionsCreated,
      dischargedOrCompletedVisits,
    ].some((result) => Boolean(result.error))
    if (hasError) {
      return apiError(500, "patients_workflow_failed", "Failed to load workflow summary", request)
    }

    const payload: ApiV1PatientsWorkflowResponse = {
      ok: true,
      api: { version: API_V1_VERSION },
      range: {
        from: range.fromDay,
        to: range.toDay,
      },
      workflow: {
        registered_patients: Number(registeredPatients.count || 0),
        triaged_patients: Number(triagedPatients.count || 0),
        queued_patients: Number(queuedPatients.count || 0),
        doctor_stage_visits: Number(doctorStageVisits.count || 0),
        diagnostics_orders: Number((labOrders.count || 0) + (radiologyOrders.count || 0)),
        prescriptions_created: Number(prescriptionsCreated.count || 0),
        pharmacy_stage_visits: Number(pharmacyStageVisits.count || 0),
        billed_invoices: Number(billedInvoices.count || 0),
        admissions_created: Number(admissionsCreated.count || 0),
        discharged_or_completed_visits: Number(dischargedOrCompletedVisits.count || 0),
      },
      server_time_utc: new Date().toISOString(),
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_JSON_HEADERS,
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    return apiError(500, "patients_workflow_failed", "Failed to load workflow summary", request)
  }
}
