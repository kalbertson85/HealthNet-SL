import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { API_V1_VERSION, type ApiV1AuditTrailResponse } from "@/lib/api/v1"

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
})

function parseOptionalIsoDate(value?: string, endOfDay?: boolean) {
  if (!value) return null
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"
  const parsed = new Date(`${value}${suffix}`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_v1_audit_trail",
    maxRequests: 60,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "admin.settings.manage")
    const parsed = querySchema.safeParse({
      limit: request.nextUrl.searchParams.get("limit") || undefined,
      from: request.nextUrl.searchParams.get("from") || undefined,
      to: request.nextUrl.searchParams.get("to") || undefined,
    })
    if (!parsed.success) {
      return apiError(400, "invalid_query", "Invalid query parameters", request)
    }

    const limit = parsed.data.limit ?? 50
    const fromIso = parseOptionalIsoDate(parsed.data.from, false)
    const toIso = parseOptionalIsoDate(parsed.data.to, true)
    if ((parsed.data.from && !fromIso) || (parsed.data.to && !toIso)) {
      return apiError(400, "invalid_range", "Invalid date range", request)
    }
    if (fromIso && toIso && fromIso > toIso) {
      return apiError(400, "invalid_range", "Invalid date range", request)
    }

    let query = supabase
      .from("audit_logs")
      .select("id, occurred_at, action, resource_type, resource_id, user_id, role, facility_id")
      .order("occurred_at", { ascending: false })
      .limit(limit)

    if (fromIso) query = query.gte("occurred_at", fromIso)
    if (toIso) query = query.lte("occurred_at", toIso)

    const { data, error } = await query
    if (error) {
      return apiError(500, "audit_trail_failed", "Failed to load audit trail", request)
    }

    const payload: ApiV1AuditTrailResponse = {
      ok: true,
      api: { version: API_V1_VERSION },
      filters: {
        limit,
        from: parsed.data.from ?? null,
        to: parsed.data.to ?? null,
      },
      audit: {
        events: ((data || []) as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id || ""),
          occurred_at: String(row.occurred_at || ""),
          action: String(row.action || "unknown"),
          resource_type: typeof row.resource_type === "string" ? row.resource_type : null,
          resource_id: typeof row.resource_id === "string" ? row.resource_id : null,
          actor_user_id: typeof row.user_id === "string" ? row.user_id : null,
          actor_role: typeof row.role === "string" ? row.role : null,
          facility_id: typeof row.facility_id === "string" ? row.facility_id : null,
        })),
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
    return apiError(500, "audit_trail_failed", "Failed to load audit trail", request)
  }
}
