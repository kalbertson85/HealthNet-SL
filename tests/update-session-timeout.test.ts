import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const createServerClientMock = vi.fn()

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}))

import { updateSession } from "../lib/supabase/middleware"

function makeRequest(extraCookie = "") {
  const cookie = ["sb-test-auth-token=token", extraCookie].filter(Boolean).join("; ")
  return new NextRequest("http://localhost/dashboard", {
    headers: {
      cookie,
    },
  })
}

function makeSupabaseWithUser() {
  return {
    auth: {
      async getSession() {
        return { data: { session: { user: { id: "user-1" } } } }
      },
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  createServerClientMock.mockReset()
})

describe("updateSession idle timeout", () => {
  it("redirects to login when idle timeout is exceeded", async () => {
    vi.stubEnv("HMS_IDLE_TIMEOUT_MINUTES", "15")
    vi.setSystemTime(new Date("2026-04-08T12:00:00.000Z"))
    createServerClientMock.mockReturnValue(makeSupabaseWithUser())

    const lastSeen = Date.parse("2026-04-08T11:00:00.000Z")
    const response = await updateSession(makeRequest(`hms_idle_last_seen=${lastSeen}`))

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toContain("/auth/login?reason=timeout")
  })

  it("keeps active sessions when timeout is not exceeded", async () => {
    vi.stubEnv("HMS_IDLE_TIMEOUT_MINUTES", "15")
    vi.setSystemTime(new Date("2026-04-08T12:00:00.000Z"))
    createServerClientMock.mockReturnValue(makeSupabaseWithUser())

    const lastSeen = Date.parse("2026-04-08T11:55:00.000Z")
    const response = await updateSession(makeRequest(`hms_idle_last_seen=${lastSeen}`))

    expect(response.status).toBe(200)
    expect(response.headers.get("location")).toBeNull()
  })
})
