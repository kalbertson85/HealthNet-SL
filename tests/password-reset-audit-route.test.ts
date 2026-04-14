import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const insertMock = vi.fn()
const createAdminClientMock = vi.fn(() => ({
  from() {
    return {
      insert: (...args: unknown[]) => insertMock(...args),
    }
  },
}))

vi.mock("../lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}))

import { POST } from "../app/api/auth/password-reset-audit/route"

afterEach(() => {
  insertMock.mockReset()
  createAdminClientMock.mockClear()
})

describe("POST /api/auth/password-reset-audit", () => {
  it("rejects non-json payloads", async () => {
    const request = new NextRequest("http://localhost/api/auth/password-reset-audit", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        host: "localhost",
        "content-type": "text/plain",
        "x-requested-with": "XMLHttpRequest",
      },
      body: "email=test@example.com",
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(415)
    expect(payload.error.code).toBe("unsupported_media_type")
  })

  it("rejects malformed json payloads", async () => {
    const request = new NextRequest("http://localhost/api/auth/password-reset-audit", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        host: "localhost",
        "content-type": "application/json",
        "x-requested-with": "XMLHttpRequest",
      },
      body: "{not-json}",
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe("invalid_json")
  })

  it("normalizes and stores emails", async () => {
    insertMock.mockResolvedValue({ error: null })

    const request = new NextRequest("http://localhost/api/auth/password-reset-audit", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        host: "localhost",
        "content-type": "application/json",
        "x-requested-with": "XMLHttpRequest",
      },
      body: JSON.stringify({ email: "User@Example.COM" }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(insertMock).toHaveBeenCalledWith({ email: "user@example.com" })
  })

  it("rejects requests without origin/referer headers", async () => {
    const request = new NextRequest("http://localhost/api/auth/password-reset-audit", {
      method: "POST",
      headers: {
        host: "localhost",
        "content-type": "application/json",
        "x-requested-with": "XMLHttpRequest",
      },
      body: JSON.stringify({ email: "User@Example.COM" }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error.code).toBe("forbidden_origin")
  })
})
