import { NextResponse, type NextRequest } from "next/server"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"
import { can } from "@/lib/utils"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { API_V1_VERSION, type ApiV1NotificationsSummaryResponse } from "@/lib/api/v1"

type LiveAlertQueryResult = { count?: number | null; error?: { message?: string } | null }

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_v1_notifications_summary",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase, user } = await requirePermission(request, "dashboard.view")
    if (!user) {
      return apiError(401, "unauthorized", "Authentication required", request)
    }

    const [profileRes, totalRes, unreadRes] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false),
    ])

    if (totalRes.error || unreadRes.error) {
      return apiError(500, "notifications_summary_failed", "Failed to load notifications summary", request)
    }

    const role = (profileRes.data?.role || null) as string | null
    const rbacUser = { id: user.id, role }

    const liveAlertChecks: Array<Promise<LiveAlertQueryResult>> = []

    if (can(rbacUser, "pharmacy.manage")) {
      liveAlertChecks.push(
        supabase
          .from("medication_stock")
          .select("id", { count: "exact", head: true })
          .gt("reorder_level", 0)
          .filter("quantity_on_hand", "lte", "reorder_level"),
      )
    }

    if (can(rbacUser, "appointments.manage")) {
      const todayIsoDate = new Date().toISOString().slice(0, 10)
      liveAlertChecks.push(
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .lt("appointment_date", todayIsoDate)
          .in("status", ["scheduled", "confirmed"]),
      )
    }

    if (can(rbacUser, "emergency.manage")) {
      liveAlertChecks.push(
        supabase
          .from("triage_assessments")
          .select("id", { count: "exact", head: true })
          .eq("triage_level", "red")
          .in("status", ["pending", "in_treatment"]),
      )
    }

    const liveResults = await Promise.all(liveAlertChecks)
    if (liveResults.some((r) => Boolean(r.error))) {
      return apiError(500, "notifications_summary_failed", "Failed to load notifications summary", request)
    }

    const liveAlerts = liveResults.reduce((sum, result) => sum + Number(result.count || 0), 0)

    const payload: ApiV1NotificationsSummaryResponse = {
      ok: true,
      api: { version: API_V1_VERSION },
      notifications: {
        total: Number(totalRes.count || 0),
        unread: Number(unreadRes.count || 0),
        live_alerts: liveAlerts,
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
    return apiError(500, "notifications_summary_failed", "Failed to load notifications summary", request)
  }
}
