import type { NextRequest } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { resolveRequestId } from "./request-id"

type LogLevel = "info" | "warn" | "error"

interface ApiLogContext {
  requestId: string
  startedAtMs: number
}

const NON_SENSITIVE_ID_KEYS = new Set(["request_id", "route"])
const CRITICAL_5XX_ROUTES = new Set([
  "api.webhooks.mobile_money",
  "api.sync.queue.enqueue",
  "api.patients.photo.upload",
])

function maskEmail(value: string): string {
  const [localPart, domainPart] = value.split("@")
  if (!localPart || !domainPart) return "***"
  const local = localPart.length <= 2 ? `${localPart[0] ?? "*"}*` : `${localPart.slice(0, 2)}***`
  const domainSegments = domainPart.split(".")
  if (domainSegments.length < 2) return `${local}@***`
  const domainName = domainSegments[0]
  const tld = domainSegments.slice(1).join(".")
  const maskedDomain = domainName.length <= 2 ? `${domainName[0] ?? "*"}*` : `${domainName.slice(0, 2)}***`
  return `${local}@${maskedDomain}.${tld}`
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "")
  if (digits.length <= 4) return "***"
  const tail = digits.slice(-4)
  return `***${tail}`
}

function maskIdentifier(value: string): string {
  if (value.length <= 4) return "***"
  return `${value.slice(0, 2)}***${value.slice(-2)}`
}

function isEmailKey(key: string): boolean {
  return /(^|_)(email)(_|$)/i.test(key)
}

function isPhoneKey(key: string): boolean {
  return /(phone|mobile|tel|contact_number|whatsapp)/i.test(key)
}

function isSensitiveIdKey(key: string): boolean {
  if (NON_SENSITIVE_ID_KEYS.has(key)) return false
  return /(national_id|passport|license|ssn|id_number|patient_id|employee_id|transaction_id|user_id)/i.test(key)
}

function redactPrimitiveByKey(key: string, value: unknown): unknown {
  if (typeof value !== "string") return value
  if (isEmailKey(key)) return maskEmail(value)
  if (isPhoneKey(key)) return maskPhone(value)
  if (isSensitiveIdKey(key)) return maskIdentifier(value)
  return value
}

export function redactLogData(input: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 3) return input
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      output[key] = value.map((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          return redactLogData(item as Record<string, unknown>, depth + 1)
        }
        return redactPrimitiveByKey(key, item)
      })
      continue
    }
    if (value && typeof value === "object") {
      output[key] = redactLogData(value as Record<string, unknown>, depth + 1)
      continue
    }
    output[key] = redactPrimitiveByKey(key, value)
  }
  return output
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
  const payload = redactLogData({ event, ...data })
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

  const hasSentryDsn = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)
  if (!hasSentryDsn || status < 500 || !CRITICAL_5XX_ROUTES.has(route)) {
    return
  }

  Sentry.withScope((scope) => {
    scope.setTag("route", route)
    scope.setTag("http.status_code", String(status))
    scope.setTag("env", process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "unknown")
    scope.setTag("release", process.env.SENTRY_RELEASE || "unknown")
    scope.setContext("api_request", {
      request_id: ctx.requestId,
      path: request.nextUrl.pathname,
      method: request.method,
      status,
      duration_ms: Math.max(0, Date.now() - ctx.startedAtMs),
    })
    scope.setExtras(redactLogData(extra))
    Sentry.captureException(error instanceof Error ? error : new Error("critical_api_request_failure"))
  })
}
