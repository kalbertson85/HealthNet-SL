import { NextResponse, type NextRequest } from "next/server"
import { ZodError } from "zod"
import { buildSyncQueueRows } from "@/lib/sync/queue-validation"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { enforceTrustedOrigin } from "@/lib/http/request-security"
import { logApiRequestComplete, logApiRequestFailure, logApiRequestStart } from "@/lib/http/observability"
import { requireAuth, resolveAuthError } from "@/lib/auth-guard"

const MAX_SYNC_REQUEST_BODY_BYTES = 512 * 1024

export async function POST(request: NextRequest) {
  const logCtx = logApiRequestStart(request, "api.sync.queue.enqueue")
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_sync_queue",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) {
    logApiRequestComplete(request, "api.sync.queue.enqueue", logCtx, limited.status)
    return limited
  }

  const originGuard = enforceTrustedOrigin(request)
  try {
    if (originGuard) {
      logApiRequestComplete(request, "api.sync.queue.enqueue", logCtx, originGuard.status)
      return originGuard
    }

    const { supabase, user } = await requireAuth()

    const contentType = request.headers.get("content-type")?.toLowerCase() || ""
    if (!contentType.includes("application/json")) {
      logApiRequestComplete(request, "api.sync.queue.enqueue", logCtx, 415)
      return apiError(415, "unsupported_media_type", "Content-Type must be application/json", request)
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0")
    if (Number.isFinite(contentLength) && contentLength > MAX_SYNC_REQUEST_BODY_BYTES) {
      logApiRequestComplete(request, "api.sync.queue.enqueue", logCtx, 413)
      return apiError(413, "payload_too_large", "Request payload too large", request)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      logApiRequestComplete(request, "api.sync.queue.enqueue", logCtx, 400)
      return apiError(400, "invalid_json", "Invalid JSON", request)
    }

    let rows
    try {
      rows = buildSyncQueueRows(user.id, body)
    } catch (error) {
      if (error instanceof ZodError) {
        logApiRequestComplete(request, "api.sync.queue.enqueue", logCtx, 400)
        return apiError(400, "invalid_payload", "Invalid sync operations payload", request)
      }
      if (error instanceof Error && error.message === "Operation payload is too large") {
        logApiRequestComplete(request, "api.sync.queue.enqueue", logCtx, 413)
        return apiError(413, "payload_too_large", "Operation payload exceeds size limit", request)
      }
      console.error("[v0] Unexpected error building sync queue rows", error)
      logApiRequestFailure(request, "api.sync.queue.enqueue", logCtx, 400, error)
      return apiError(400, "invalid_payload", "Invalid sync operations payload", request)
    }

    const { error } = await supabase.from("sync_queue").insert(rows)

    if (error) {
      console.error("[v0] Error enqueuing sync operations", error)
      logApiRequestFailure(request, "api.sync.queue.enqueue", logCtx, 500, error)
      return apiError(500, "enqueue_failed", "Failed to enqueue", request)
    }

    logApiRequestComplete(request, "api.sync.queue.enqueue", logCtx, 200, { row_count: rows.length })
    return NextResponse.json({ ok: true, count: rows.length }, { status: 200 })
  } catch (error) {
    const authResponse = resolveAuthError(error, request, apiError)
    if (authResponse) {
      logApiRequestComplete(request, "api.sync.queue.enqueue", logCtx, authResponse.status)
      return authResponse
    }
    logApiRequestFailure(request, "api.sync.queue.enqueue", logCtx, 500, error)
    return apiError(500, "sync_queue_error", "Failed to enqueue sync operations", request)
  }
}
