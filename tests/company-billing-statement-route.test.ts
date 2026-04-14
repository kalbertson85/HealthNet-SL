import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requirePermissionMock = vi.fn()
const toAuthErrorResponseMock = vi.fn(() => null)

vi.mock("../lib/supabase/middleware", () => ({
  requirePermission: (...args: unknown[]) => requirePermissionMock(...args),
  toAuthErrorResponse: (...args: unknown[]) => toAuthErrorResponseMock(...args),
}))

import { GET } from "../app/dashboard/reports/company-billing/statement/route"

afterEach(() => {
  requirePermissionMock.mockReset()
  toAuthErrorResponseMock.mockReset()
  toAuthErrorResponseMock.mockReturnValue(null)
})

describe("GET /dashboard/reports/company-billing/statement", () => {
  it("returns 403 for non-admin users", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: {},
      user: { role: "facility_admin" },
    })

    const request = new NextRequest(
      "http://localhost/dashboard/reports/company-billing/statement?company_id=11111111-1111-4111-8111-111111111111",
    )
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error.code).toBe("forbidden")
  })
})
