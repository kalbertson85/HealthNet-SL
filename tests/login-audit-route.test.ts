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

import { POST } from "../app/api/auth/login-audit/route"

afterEach(() => {
  insertMock.mockReset()
  createAdminClientMock.mockClear()
})

describe("POST /api/auth/login-audit", () => {
  it("rejects invalid payloads", async () => {
    const request = new NextRequest("http://localhost/api/auth/login-audit", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        host: "localhost",
        "content-type": "application/json",
        "x-requested-with": "XMLHttpRequest",
      },
      body: JSON.stringify({ outcome: "maybe" }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe("invalid_payload")
  })

  it("stores success login audit events", async () => {
    insertMock.mockResolvedValue({ error: null })

    const request = new NextRequest("http://localhost/api/auth/login-audit", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        host: "localhost",
        "content-type": "application/json",
        "x-requested-with": "XMLHttpRequest",
        "user-agent": "vitest",
        "x-forwarded-for": "10.10.0.7",
      },
      body: JSON.stringify({
        email: "Doctor@Example.org",
        outcome: "success",
        user_id: "29ce53ad-f8f6-4f8d-95f0-2f2f8afb73ab",
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "doctor@example.org",
        outcome: "success",
        user_id: "29ce53ad-f8f6-4f8d-95f0-2f2f8afb73ab",
        ip_address: "10.10.0.7",
      }),
    )
  })

  it("rejects requests without AJAX client header", async () => {
    const request = new NextRequest("http://localhost/api/auth/login-audit", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        host: "localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "Doctor@Example.org",
        outcome: "success",
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error.code).toBe("forbidden_client")
  })
})
