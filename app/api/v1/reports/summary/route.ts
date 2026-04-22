import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { API_V1_VERSION, type ApiV1ReportsSummaryResponse } from "@/lib/api/v1"
import { fetchReportsSummary } from "@/lib/reports/queries"

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
    key: "api_v1_reports_summary",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "reports.view")
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

    const summary = await fetchReportsSummary(supabase, range.fromIso, range.toIso)

    const payload: ApiV1ReportsSummaryResponse = {
      ok: true,
      api: { version: API_V1_VERSION },
      range: {
        from: range.fromDay,
        to: range.toDay,
      },
      reports: {
        monthly_revenue: Number(summary.monthlyRevenue || 0),
        new_patients: Number(summary.newPatientsCount.count || 0),
        completed_visits: Number(summary.completedVisitsCount.count || 0),
        pending_lab_tests: Number(summary.pendingLabTestsCount.count || 0),
        source: summary.source,
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
    return apiError(500, "reports_summary_failed", "Failed to load reports summary", request)
  }
}
