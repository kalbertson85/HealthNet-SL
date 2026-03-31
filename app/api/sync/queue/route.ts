import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { ZodError } from "zod"
import { buildSyncQueueRows } from "@/lib/sync/queue-validation"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { enforceTrustedOrigin } from "@/lib/http/request-security"

const MAX_SYNC_REQUEST_BODY_BYTES = 512 * 1024

export async function POST(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_sync_queue",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  const originGuard = enforceTrustedOrigin(request)
  if (originGuard) return originGuard

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return apiError(401, "unauthorized", "Unauthorized", request)
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength > MAX_SYNC_REQUEST_BODY_BYTES) {
    return apiError(413, "payload_too_large", "Request payload too large", request)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(400, "invalid_json", "Invalid JSON", request)
  }

  let rows
  try {
    rows = buildSyncQueueRows(user.id, body)
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError(400, "invalid_payload", "Invalid sync operations payload", request)
    }
    if (error instanceof Error && error.message === "Operation payload is too large") {
      return apiError(413, "payload_too_large", "Operation payload exceeds size limit", request)
    }
    console.error("[v0] Unexpected error building sync queue rows", error)
    return apiError(400, "invalid_payload", "Invalid sync operations payload", request)
  }

  const { error } = await supabase.from("sync_queue").insert(rows)

  if (error) {
    console.error("[v0] Error enqueuing sync operations", error)
    return apiError(500, "enqueue_failed", "Failed to enqueue", request)
  }

  return NextResponse.json({ ok: true, count: rows.length }, { status: 200 })
}
