import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { API_V1_VERSION, type ApiV1EmergencySummaryResponse } from "@/lib/api/v1"

const querySchema = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
})

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
    key: "api_v1_emergency_summary",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "emergency.manage")
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

    const { data: rows, error } = await supabase
      .from("triage_assessments")
      .select("status, triage_level")
      .gte("arrival_time", range.fromIso)
      .lte("arrival_time", range.toIso)
      .limit(5000)

    if (error) {
      return apiError(500, "emergency_summary_failed", "Failed to load emergency summary", request)
    }

    const totals = ((rows || []) as Array<{ status?: string | null; triage_level?: string | null }>).reduce(
      (acc, row) => {
        const status = String(row.status || "").toLowerCase()
        const triageLevel = String(row.triage_level || "").toLowerCase()

        acc.total_in_range += 1
        if (status === "pending") acc.pending += 1
        else if (status === "in_treatment") acc.in_treatment += 1
        else if (status === "admitted") acc.admitted += 1
        else if (status === "discharged" || status === "transferred") acc.discharged_or_transferred += 1

        if (triageLevel === "red" || triageLevel === "orange") {
          acc.critical_or_emergency += 1
        }

        return acc
      },
      {
        total_in_range: 0,
        pending: 0,
        in_treatment: 0,
        admitted: 0,
        discharged_or_transferred: 0,
        critical_or_emergency: 0,
      },
    )

    const payload: ApiV1EmergencySummaryResponse = {
      ok: true,
      api: { version: API_V1_VERSION },
      range: {
        from: range.fromDay,
        to: range.toDay,
      },
      emergency: totals,
      server_time_utc: new Date().toISOString(),
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_JSON_HEADERS,
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    return apiError(500, "emergency_summary_failed", "Failed to load emergency summary", request)
  }
}
