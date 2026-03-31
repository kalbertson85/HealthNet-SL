import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { ROLES } from "@/lib/utils"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_admin_webhook_events",
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (limited) return limited

  const { user, profile } = await getSessionUserAndProfile()
  if (!user) return apiError(401, "unauthorized", "Unauthorized")

  const role = profile?.role ?? user.role
  if (role !== ROLES.ADMIN && role !== ROLES.FACILITY_ADMIN) {
    return apiError(403, "forbidden", "Forbidden")
  }

  const supabase = await createServerClient()
  const { searchParams } = new URL(request.url)
  const limit = Math.min(200, Math.max(1, Number.parseInt(searchParams.get("limit") || "50", 10) || 50))

  const [
    { data: acceptedRows, error: acceptedError },
    { data: rejectedRows, error: rejectedError },
    { data: mutatedRows, error: mutatedError },
  ] = await Promise.all([
    supabase
      .from("webhook_replay_events")
      .select("provider, event_id, created_at")
      .eq("provider", "mobile_money")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("audit_logs")
      .select("occurred_at, action, metadata")
      .eq("action", "webhook.mobile_money.rejected")
      .order("occurred_at", { ascending: false })
      .limit(limit),
    supabase
      .from("audit_logs")
      .select("occurred_at, action, resource_id, metadata")
      .eq("action", "webhook.mobile_money.invoice_mutated")
      .order("occurred_at", { ascending: false })
      .limit(limit),
  ])

  if (acceptedError || rejectedError || mutatedError) {
    console.error(
      "[v0] Error loading webhook monitor rows",
      acceptedError?.message || acceptedError,
      rejectedError?.message || rejectedError,
      mutatedError?.message || mutatedError,
    )
    return apiError(500, "load_failed", "Failed loading webhook monitor data")
  }

  return NextResponse.json({
    ok: true,
    data: {
      accepted: acceptedRows || [],
      rejected: rejectedRows || [],
      mutated: mutatedRows || [],
    },
  })
}
