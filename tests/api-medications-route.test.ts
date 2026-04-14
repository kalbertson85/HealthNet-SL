import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requireRoleMock = vi.fn()
const resolveAuthErrorMock = vi.fn(() => null)

vi.mock("../lib/auth-guard", () => ({
  requireRole: (...args: unknown[]) => requireRoleMock(...args),
  resolveAuthError: (...args: unknown[]) => resolveAuthErrorMock(...args),
}))

import { POST } from "../app/api/medications/route"

afterEach(() => {
  requireRoleMock.mockReset()
  resolveAuthErrorMock.mockReset()
  resolveAuthErrorMock.mockReturnValue(null)
})

function makeSupabase() {
  return {
    from(table: string) {
      if (table !== "medications") {
        throw new Error(`Unexpected table: ${table}`)
      }
      return {
        insert() {
          return {
            select() {
              return {
                async single() {
                  return { data: { id: "med-1", name: "Paracetamol" }, error: null }
                },
              }
            },
          }
        },
      }
    },
  }
}

describe("POST /api/medications", () => {
  it("rejects non-json content types", async () => {
    requireRoleMock.mockResolvedValue({ supabase: makeSupabase(), user: { id: "u-1" } })
    const response = await POST(
      new NextRequest("http://localhost/api/medications", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: "http://localhost",
          host: "localhost",
        },
        body: "invalid",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(415)
    expect(payload.error.code).toBe("unsupported_media_type")
  })

  it("rejects malformed json payloads", async () => {
    requireRoleMock.mockResolvedValue({ supabase: makeSupabase(), user: { id: "u-1" } })
    const response = await POST(
      new NextRequest("http://localhost/api/medications", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          host: "localhost",
        },
        body: "{bad-json}",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe("invalid_json")
  })
})
