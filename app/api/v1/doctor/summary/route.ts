import { NextResponse, type NextRequest } from "next/server"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { API_V1_VERSION, type ApiV1DoctorSummaryResponse } from "@/lib/api/v1"

const DOCTOR_OPEN_STATUSES = ["doctor_pending", "doctor_review", "lab_pending"]

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_v1_doctor_summary",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "dashboard.view")

    const { data: rows, error } = await supabase
      .from("visits")
      .select("visit_status")
      .in("visit_status", DOCTOR_OPEN_STATUSES)
      .limit(5000)

    if (error) {
      return apiError(500, "doctor_summary_failed", "Failed to load doctor summary", request)
    }

    const totals = ((rows || []) as Array<{ visit_status?: string | null }>).reduce(
      (acc, row) => {
        const status = String(row.visit_status || "").toLowerCase()
        acc.total_open_cases += 1
        if (status === "doctor_pending") acc.doctor_pending += 1
        else if (status === "doctor_review") acc.doctor_review += 1
        else if (status === "lab_pending") acc.lab_pending += 1
        return acc
      },
      {
        total_open_cases: 0,
        doctor_pending: 0,
        doctor_review: 0,
        lab_pending: 0,
      },
    )

    const payload: ApiV1DoctorSummaryResponse = {
      ok: true,
      api: { version: API_V1_VERSION },
      doctor: totals,
      server_time_utc: new Date().toISOString(),
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_JSON_HEADERS,
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    return apiError(500, "doctor_summary_failed", "Failed to load doctor summary", request)
  }
}
