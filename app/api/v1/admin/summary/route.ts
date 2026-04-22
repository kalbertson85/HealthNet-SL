import { NextResponse, type NextRequest } from "next/server"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { API_V1_VERSION, type ApiV1AdminSummaryResponse } from "@/lib/api/v1"

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_v1_admin_summary",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "admin.settings.manage")

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const [profilesTotal, profilesActive, profilesBlocked, facilitiesTotal, audit24h] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "blocked"),
      supabase.from("facilities").select("id", { count: "exact", head: true }),
      supabase.from("admin_audit_logs").select("id", { count: "exact", head: true }).gte("created_at", since24h),
    ])

    if (profilesTotal.error || profilesActive.error || profilesBlocked.error || facilitiesTotal.error || audit24h.error) {
      return apiError(500, "admin_summary_failed", "Failed to load admin summary", request)
    }

    const payload: ApiV1AdminSummaryResponse = {
      ok: true,
      api: { version: API_V1_VERSION },
      admin: {
        total_staff_profiles: Number(profilesTotal.count || 0),
        active_staff_profiles: Number(profilesActive.count || 0),
        blocked_staff_profiles: Number(profilesBlocked.count || 0),
        total_facilities: Number(facilitiesTotal.count || 0),
        audit_events_24h: Number(audit24h.count || 0),
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
    return apiError(500, "admin_summary_failed", "Failed to load admin summary", request)
  }
}
