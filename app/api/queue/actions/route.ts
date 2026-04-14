import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { enforceTrustedOrigin } from "@/lib/http/request-security"
import { logApiRequestComplete, logApiRequestFailure, logApiRequestStart } from "@/lib/http/observability"
import { ROLES } from "@/lib/utils"
import { requireRole, resolveAuthError } from "@/lib/auth-guard"
import {
  callNextQueuePatient,
  cancelQueueEntry,
  completeQueueEntry,
  startOrContinueVisitForQueueEntry,
} from "@/lib/queue-actions"

const MAX_QUEUE_ACTION_BODY_BYTES = 64 * 1024

const queueActionSchema = z
  .object({
    type: z.enum(["call_next", "complete", "cancel", "start_visit"]),
    department: z.string().trim().min(1).max(100).optional(),
    queueId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "call_next" && !value.department) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["department"], message: "Department is required." })
    }
    if (value.type !== "call_next" && !value.queueId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["queueId"], message: "Queue ID is required." })
    }
  })

export async function POST(request: NextRequest) {
  const logCtx = logApiRequestStart(request, "api.queue.actions")
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_queue_actions",
    maxRequests: 180,
    windowMs: 60_000,
  })

  if (limited) {
    logApiRequestComplete(request, "api.queue.actions", logCtx, limited.status)
    return limited
  }

  const originGuard = enforceTrustedOrigin(request)
  if (originGuard) {
    logApiRequestComplete(request, "api.queue.actions", logCtx, originGuard.status)
    return originGuard
  }

  try {
    const contentType = request.headers.get("content-type")?.toLowerCase() || ""
    if (!contentType.includes("application/json")) {
      logApiRequestComplete(request, "api.queue.actions", logCtx, 415)
      return apiError(415, "unsupported_media_type", "Content-Type must be application/json", request)
    }

    const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10)
    if (Number.isFinite(contentLength) && contentLength > MAX_QUEUE_ACTION_BODY_BYTES) {
      logApiRequestComplete(request, "api.queue.actions", logCtx, 413)
      return apiError(413, "payload_too_large", "Request payload too large", request)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      logApiRequestComplete(request, "api.queue.actions", logCtx, 400)
      return apiError(400, "invalid_json", "Invalid JSON payload", request)
    }
    const parsed = queueActionSchema.safeParse(body)

    if (!parsed.success) {
      logApiRequestComplete(request, "api.queue.actions", logCtx, 400)
      return apiError(400, "invalid_payload", "Invalid queue action payload", request)
    }

    const { supabase, user } = await requireRole([
      ROLES.ADMIN,
      ROLES.FACILITY_ADMIN,
      ROLES.DOCTOR,
      ROLES.NURSE,
      ROLES.RECEPTIONIST,
    ])

    const actorUserId = user.id
    const actorFacilityId = user.facility_id ?? null
    const isGlobalAdmin = user.role === ROLES.ADMIN
    const action = parsed.data

    const result =
      action.type === "call_next"
        ? await callNextQueuePatient(supabase, action.department!, actorUserId, actorFacilityId, isGlobalAdmin)
        : action.type === "complete"
          ? await completeQueueEntry(supabase, action.queueId!, actorUserId, actorFacilityId, isGlobalAdmin)
          : action.type === "cancel"
            ? await cancelQueueEntry(supabase, action.queueId!, actorUserId, actorFacilityId, isGlobalAdmin)
            : await startOrContinueVisitForQueueEntry(supabase, action.queueId!, actorUserId, actorFacilityId, isGlobalAdmin)

    if (!result.ok) {
      const status = result.code === "not_found" ? 404 : result.code === "unauthorized" ? 401 : result.code === "forbidden" ? 403 : 409
      logApiRequestComplete(request, "api.queue.actions", logCtx, status, { action: action.type, result: result.code })
      return apiError(status, result.code, result.message, request)
    }

    logApiRequestComplete(request, "api.queue.actions", logCtx, 200, { action: action.type })
    return NextResponse.json({ ok: true, redirectTo: result.redirectTo ?? null }, { status: 200 })
  } catch (error) {
    const authResponse = resolveAuthError(error, request, apiError)
    if (authResponse) {
      logApiRequestComplete(request, "api.queue.actions", logCtx, authResponse.status)
      return authResponse
    }
    logApiRequestFailure(request, "api.queue.actions", logCtx, 500, error)
    return apiError(500, "queue_action_failed", "Failed to process queue action", request)
  }
}
