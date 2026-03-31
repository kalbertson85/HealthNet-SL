import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { enforceFixedWindowRateLimit } from "../lib/http/api"

function makeRequest(ip: string): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    headers: {
      "x-forwarded-for": ip,
    },
  })
}

describe("enforceFixedWindowRateLimit", () => {
  it("allows requests under the limit and blocks over limit", () => {
    const req = makeRequest("1.2.3.4")
    const opts = {
      key: "test_limit",
      maxRequests: 2,
      windowMs: 10_000,
      nowMs: 1000,
    }

    expect(enforceFixedWindowRateLimit(req, opts)).toBeNull()
    expect(enforceFixedWindowRateLimit(req, opts)).toBeNull()
    const limited = enforceFixedWindowRateLimit(req, opts)
    expect(limited?.status).toBe(429)
    expect(limited?.headers.get("retry-after")).toBe("10")
    expect(limited?.headers.get("x-ratelimit-limit")).toBe("2")
    expect(limited?.headers.get("x-ratelimit-remaining")).toBe("0")
    expect(limited?.headers.get("x-ratelimit-reset")).toBe("11")
  })

  it("resets counts after window passes", () => {
    const req = makeRequest("5.6.7.8")
    const first = enforceFixedWindowRateLimit(req, {
      key: "test_reset",
      maxRequests: 1,
      windowMs: 1000,
      nowMs: 1000,
    })
    expect(first).toBeNull()

    const blocked = enforceFixedWindowRateLimit(req, {
      key: "test_reset",
      maxRequests: 1,
      windowMs: 1000,
      nowMs: 1500,
    })
    expect(blocked?.status).toBe(429)

    const afterWindow = enforceFixedWindowRateLimit(req, {
      key: "test_reset",
      maxRequests: 1,
      windowMs: 1000,
      nowMs: 2501,
    })
    expect(afterWindow).toBeNull()
  })

  it("tracks limits independently per client ip", () => {
    const reqA = makeRequest("10.0.0.1")
    const reqB = makeRequest("10.0.0.2")

    const opts = {
      key: "test_ip_isolation",
      maxRequests: 1,
      windowMs: 10_000,
      nowMs: 5_000,
    }

    expect(enforceFixedWindowRateLimit(reqA, opts)).toBeNull()
    expect(enforceFixedWindowRateLimit(reqB, opts)).toBeNull()
    expect(enforceFixedWindowRateLimit(reqA, opts)?.status).toBe(429)
    expect(enforceFixedWindowRateLimit(reqB, opts)?.status).toBe(429)
  })
})
