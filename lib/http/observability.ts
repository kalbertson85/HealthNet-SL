import type { NextRequest } from "next/server"
import { resolveRequestId } from "./request-id"

type LogLevel = "info" | "warn" | "error"

interface ApiLogContext {
  requestId: string
  startedAtMs: number
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers.get("x-real-ip")?.trim()
  if (realIp) return realIp
  return "unknown"
}

function toErrorMetadata(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      error_name: error.name,
      error_message: error.message,
    }
  }
  return {
    error_message: typeof error === "string" ? error : "unknown_error",
  }
}

function log(level: LogLevel, event: string, data: Record<string, unknown>) {
  const payload = { event, ...data }
  if (level === "error") {
    console.error("[api]", payload)
    return
  }
  if (level === "warn") {
    console.warn("[api]", payload)
    return
  }
  console.info("[api]", payload)
}

export function logApiRequestStart(request: NextRequest, route: string, extra: Record<string, unknown> = {}): ApiLogContext {
  const requestId = resolveRequestId(request)
  const startedAtMs = Date.now()
  log("info", "request.start", {
    request_id: requestId,
    route,
    method: request.method,
    path: request.nextUrl.pathname,
    ip: getClientIp(request),
    ...extra,
  })
  return { requestId, startedAtMs }
}

export function logApiRequestComplete(
  request: NextRequest,
  route: string,
  ctx: ApiLogContext,
  status: number,
  extra: Record<string, unknown> = {},
) {
  log("info", "request.complete", {
    request_id: ctx.requestId,
    route,
    method: request.method,
    path: request.nextUrl.pathname,
    status,
    duration_ms: Math.max(0, Date.now() - ctx.startedAtMs),
    ...extra,
  })
}

export function logApiRequestFailure(
  request: NextRequest,
  route: string,
  ctx: ApiLogContext,
  status: number,
  error: unknown,
  extra: Record<string, unknown> = {},
) {
  log("error", "request.error", {
    request_id: ctx.requestId,
    route,
    method: request.method,
    path: request.nextUrl.pathname,
    status,
    duration_ms: Math.max(0, Date.now() - ctx.startedAtMs),
    ...toErrorMetadata(error),
    ...extra,
  })
}
