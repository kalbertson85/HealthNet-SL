import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { ROLES } from "@/lib/utils"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_admin_webhook_events",
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (limited) return limited

  const { user, profile } = await getSessionUserAndProfile()
  if (!user) return apiError(401, "unauthorized", "Unauthorized", request)

  const role = profile?.role ?? user.role
  if (role !== ROLES.ADMIN && role !== ROLES.FACILITY_ADMIN) {
    return apiError(403, "forbidden", "Forbidden", request)
  }

  const supabase = await createServerClient()
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1)
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(searchParams.get("page_size") || "50", 10) || 50))
  const from = (page - 1) * pageSize
  const to = from + pageSize

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
      .range(from, to),
    supabase
      .from("audit_logs")
      .select("occurred_at, action, metadata")
      .eq("action", "webhook.mobile_money.rejected")
      .order("occurred_at", { ascending: false })
      .range(from, to),
    supabase
      .from("audit_logs")
      .select("occurred_at, action, resource_id, metadata")
      .eq("action", "webhook.mobile_money.invoice_mutated")
      .order("occurred_at", { ascending: false })
      .range(from, to),
  ])

  if (acceptedError || rejectedError || mutatedError) {
    console.error(
      "[v0] Error loading webhook monitor rows",
      acceptedError?.message || acceptedError,
      rejectedError?.message || rejectedError,
      mutatedError?.message || mutatedError,
    )
    return apiError(500, "load_failed", "Failed loading webhook monitor data", request)
  }

  const accepted = acceptedRows || []
  const rejected = rejectedRows || []
  const mutated = mutatedRows || []
  const hasNextPage = accepted.length > pageSize || rejected.length > pageSize || mutated.length > pageSize

  return NextResponse.json({
    ok: true,
    data: {
      accepted: accepted.slice(0, pageSize),
      rejected: rejected.slice(0, pageSize),
      mutated: mutated.slice(0, pageSize),
    },
    pagination: {
      page,
      page_size: pageSize,
      has_next_page: hasNextPage,
    },
  }, { headers: NO_STORE_JSON_HEADERS })
}
