import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { apiError } from "../lib/http/api"

describe("apiError", () => {
  it("returns structured error payload with no-store security headers", async () => {
    const response = apiError(418, "teapot", "Short and stout")
    const payload = await response.json()

    expect(response.status).toBe(418)
    expect(payload).toEqual({
      ok: false,
      error: {
        code: "teapot",
        message: "Short and stout",
      },
    })

    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(response.headers.get("pragma")).toBe("no-cache")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  })

  it("echoes request id when request context is provided", async () => {
    const request = new NextRequest("http://localhost/api/test", {
      headers: {
        "x-request-id": "req_test_123",
      },
    })

    const response = apiError(400, "bad_request", "Invalid payload", request)
    const payload = await response.json()

    expect(response.headers.get("x-request-id")).toBe("req_test_123")
    expect(payload).toEqual({
      ok: false,
      error: {
        code: "bad_request",
        message: "Invalid payload",
        request_id: "req_test_123",
      },
    })
  })
})
