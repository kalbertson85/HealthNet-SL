import { NextResponse, type NextRequest } from "next/server"

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

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    { status },
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
    return apiError(429, "rate_limited", "Too many requests. Please retry shortly.")
  }

  current.count += 1
  store.set(bucketKey, current)
  return null
}
