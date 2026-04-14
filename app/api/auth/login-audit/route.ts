import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { enforceTrustedOriginOrReferer, enforceXmlHttpRequestHeader } from "@/lib/http/request-security"
import { logApiRequestComplete, logApiRequestFailure, logApiRequestStart } from "@/lib/http/observability"

const requestSchema = z.object({
  email: z.string().trim().email().max(320).optional(),
  outcome: z.enum(["success", "failure"]),
  user_id: z.string().uuid().optional(),
  failure_code: z.string().trim().max(120).optional(),
})

const MAX_LOGIN_AUDIT_BODY_BYTES = 8 * 1024

export async function POST(request: NextRequest) {
  const logCtx = logApiRequestStart(request, "api.auth.login_audit")
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_auth_login_audit",
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (limited) {
    logApiRequestComplete(request, "api.auth.login_audit", logCtx, limited.status)
    return limited
  }

  const originGuard = enforceTrustedOriginOrReferer(request)
  if (originGuard) {
    logApiRequestComplete(request, "api.auth.login_audit", logCtx, originGuard.status)
    return originGuard
  }
  const xhrGuard = enforceXmlHttpRequestHeader(request)
  if (xhrGuard) {
    logApiRequestComplete(request, "api.auth.login_audit", logCtx, xhrGuard.status)
    return xhrGuard
  }

  try {
    const contentType = request.headers.get("content-type")?.toLowerCase() || ""
    if (!contentType.includes("application/json")) {
      logApiRequestComplete(request, "api.auth.login_audit", logCtx, 415)
      return apiError(415, "unsupported_media_type", "Content-Type must be application/json", request)
    }

    const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10)
    if (Number.isFinite(contentLength) && contentLength > MAX_LOGIN_AUDIT_BODY_BYTES) {
      logApiRequestComplete(request, "api.auth.login_audit", logCtx, 413)
      return apiError(413, "payload_too_large", "Request payload too large", request)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      logApiRequestComplete(request, "api.auth.login_audit", logCtx, 400)
      return apiError(400, "invalid_json", "Invalid JSON payload", request)
    }

    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      logApiRequestComplete(request, "api.auth.login_audit", logCtx, 400)
      return apiError(400, "invalid_payload", "Invalid login audit payload", request)
    }

    const payload = parsed.data
    const supabase = createAdminClient()
    const { error } = await supabase.from("auth_login_events").insert({
      email: payload.email?.toLowerCase() ?? null,
      outcome: payload.outcome,
      user_id: payload.user_id ?? null,
      failure_code: payload.failure_code ?? null,
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      user_agent: request.headers.get("user-agent") || null,
    })

    if (error) {
      throw error
    }

    logApiRequestComplete(request, "api.auth.login_audit", logCtx, 200)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    logApiRequestFailure(request, "api.auth.login_audit", logCtx, 500, error)
    return apiError(500, "login_audit_failed", "Failed to record login audit event", request)
  }
}
