import { NextResponse, type NextRequest } from "next/server"
import { NO_STORE_JSON_HEADERS } from "./headers"
import { REQUEST_ID_HEADER, resolveRequestId } from "./request-id"

type RateLimitEntry = {
  count: number
  resetAtMs: number
}

const RATE_LIMIT_STORE_KEY = "__hmsRateLimitStore__"
const RATE_LIMIT_SWEEP_LAST_RUN_KEY = "__hmsRateLimitSweepLastRun__"
const RATE_LIMIT_SWEEP_INTERVAL_MS = 60 * 1000
const MAX_RATE_LIMIT_BUCKETS = 50_000

function getRateLimitStore(): Map<string, RateLimitEntry> {
  const globalObj = globalThis as unknown as { [RATE_LIMIT_STORE_KEY]?: Map<string, RateLimitEntry> }
  if (!globalObj[RATE_LIMIT_STORE_KEY]) {
    globalObj[RATE_LIMIT_STORE_KEY] = new Map<string, RateLimitEntry>()
  }
  return globalObj[RATE_LIMIT_STORE_KEY] as Map<string, RateLimitEntry>
}

export function apiError(status: number, code: string, message: string, request?: NextRequest) {
  const requestId = request ? resolveRequestId(request) : null
  return NextResponse.json(
    requestId
      ? {
          ok: false,
          error: {
            code,
            message,
            request_id: requestId,
          },
        }
      : {
          ok: false,
          error: {
            code,
            message,
          },
        },
    {
      status,
      headers: requestId
        ? {
            ...NO_STORE_JSON_HEADERS,
            [REQUEST_ID_HEADER]: requestId,
          }
        : NO_STORE_JSON_HEADERS,
    },
  )
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

function maybeSweepRateLimitStore(store: Map<string, RateLimitEntry>, nowMs: number) {
  const globalObj = globalThis as unknown as { [RATE_LIMIT_SWEEP_LAST_RUN_KEY]?: number }
  const lastSweepMs = globalObj[RATE_LIMIT_SWEEP_LAST_RUN_KEY] ?? 0
  if (nowMs - lastSweepMs < RATE_LIMIT_SWEEP_INTERVAL_MS && store.size < MAX_RATE_LIMIT_BUCKETS) {
    return
  }

  for (const [key, entry] of store.entries()) {
    if (entry.resetAtMs <= nowMs) {
      store.delete(key)
    }
  }

  // If still too large, evict oldest buckets to keep memory bounded.
  while (store.size > MAX_RATE_LIMIT_BUCKETS) {
    const oldest = store.keys().next().value as string | undefined
    if (!oldest) break
    store.delete(oldest)
  }

  globalObj[RATE_LIMIT_SWEEP_LAST_RUN_KEY] = nowMs
}

function rateLimitedResponse(
  request: NextRequest,
  current: RateLimitEntry,
  nowMs: number,
  maxRequests: number,
): NextResponse {
  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAtMs - nowMs) / 1000))
  const resetEpochSeconds = Math.max(0, Math.ceil(current.resetAtMs / 1000))
  const requestId = resolveRequestId(request)
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "rate_limited",
        message: "Too many requests. Please retry shortly.",
        request_id: requestId,
      },
    },
    {
      status: 429,
      headers: {
        ...NO_STORE_JSON_HEADERS,
        [REQUEST_ID_HEADER]: requestId,
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(maxRequests),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(resetEpochSeconds),
      },
    },
  )
}

export function enforceFixedWindowRateLimit(
  request: NextRequest,
  opts: {
    key: string
    maxRequests: number
    windowMs: number
    nowMs?: number
  },
): NextResponse | null {
  const nowMs = opts.nowMs ?? Date.now()
  const ip = getClientIp(request)
  const bucketKey = `${opts.key}:${ip}`
  const store = getRateLimitStore()
  maybeSweepRateLimitStore(store, nowMs)

  const current = store.get(bucketKey)
  if (!current || nowMs >= current.resetAtMs) {
    store.set(bucketKey, { count: 1, resetAtMs: nowMs + opts.windowMs })
    return null
  }

  if (current.count >= opts.maxRequests) {
    return rateLimitedResponse(request, current, nowMs, opts.maxRequests)
  }

  current.count += 1
  store.set(bucketKey, current)
  return null
}
