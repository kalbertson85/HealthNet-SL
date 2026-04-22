import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { API_V1_VERSION, type ApiV1NursingSummaryResponse } from "@/lib/api/v1"

const ACTIVE_NURSING_VISIT_STATUSES = ["doctor_pending", "doctor_review", "lab_pending", "billing_pending", "admitted"]

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

function isMissingRelationError(message: string) {
  return message.includes("relation") && message.includes("does not exist")
}

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_v1_nursing_summary",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "inpatient.manage")
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

    const activeVisitsPromise = supabase
      .from("visits")
      .select("id", { count: "exact", head: true })
      .in("visit_status", ACTIVE_NURSING_VISIT_STATUSES)

    const notesPromise = supabase
      .from("visit_nursing_notes")
      .select("id", { count: "exact", head: true })
      .gte("performed_at", range.fromIso)
      .lte("performed_at", range.toIso)

    const wardRequestsPromise = supabase
      .from("ward_medication_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .gte("created_at", range.fromIso)
      .lte("created_at", range.toIso)

    const [activeVisitsResult, notesResult, wardRequestsResult] = await Promise.all([
      activeVisitsPromise,
      notesPromise,
      wardRequestsPromise,
    ])

    const activeVisitsCount = Number(activeVisitsResult.count || 0)

    let notesInRange = 0
    if (notesResult.error) {
      const message = String(notesResult.error.message || "")
      if (!isMissingRelationError(message)) {
        return apiError(500, "nursing_summary_failed", "Failed to load nursing summary", request)
      }
    } else {
      notesInRange = Number(notesResult.count || 0)
    }

    let pendingWardRequests = 0
    if (wardRequestsResult.error) {
      const message = String(wardRequestsResult.error.message || "")
      if (!isMissingRelationError(message)) {
        return apiError(500, "nursing_summary_failed", "Failed to load nursing summary", request)
      }
    } else {
      pendingWardRequests = Number(wardRequestsResult.count || 0)
    }

    const payload: ApiV1NursingSummaryResponse = {
      ok: true,
      api: { version: API_V1_VERSION },
      range: {
        from: range.fromDay,
        to: range.toDay,
      },
      nursing: {
        active_visits: activeVisitsCount,
        notes_in_range: notesInRange,
        pending_ward_requests_in_range: pendingWardRequests,
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
    return apiError(500, "nursing_summary_failed", "Failed to load nursing summary", request)
  }
}
