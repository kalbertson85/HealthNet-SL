import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requireRoleMock = vi.fn()
const resolveAuthErrorMock = vi.fn(() => null)
const fetchDataConsistencyCountsMock = vi.fn()

vi.mock("../lib/auth-guard", () => ({
  requireRole: (...args: unknown[]) => requireRoleMock(...args),
  resolveAuthError: (...args: unknown[]) => resolveAuthErrorMock(...args),
}))

vi.mock("../lib/data-consistency", () => ({
  fetchDataConsistencyCounts: (...args: unknown[]) => fetchDataConsistencyCountsMock(...args),
}))

import { GET } from "../app/api/admin/data-consistency/route"

afterEach(() => {
  requireRoleMock.mockReset()
  resolveAuthErrorMock.mockReset()
  resolveAuthErrorMock.mockReturnValue(null)
  fetchDataConsistencyCountsMock.mockReset()
})

describe("GET /api/admin/data-consistency", () => {
  it("returns metrics for authorized admin", async () => {
    requireRoleMock.mockResolvedValue({ supabase: {} })
    fetchDataConsistencyCountsMock.mockResolvedValue({
      visits_without_billing: 3,
      open_prescriptions_without_dispense: 4,
      prescriptions_without_items: 0,
      invoices_without_items: 0,
      queue_in_progress_without_visit: 0,
      insurance_batches_without_totals: 1,
      insurance_batches_with_mismatch: 2,
      discharged_admissions_missing_summary: 0,
      source: "rpc",
      truncated: false,
    })

    const response = await GET(new NextRequest("http://localhost/api/admin/data-consistency", { method: "GET" }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.counts.visits_without_billing).toBe(3)
    expect(fetchDataConsistencyCountsMock).toHaveBeenCalledTimes(1)
  })

  it("maps auth failures to API errors", async () => {
    const authResponse = new Response(JSON.stringify({ ok: false }), { status: 401 })
    requireRoleMock.mockRejectedValue(new Error("unauthorized"))
    resolveAuthErrorMock.mockReturnValue(authResponse)

    const response = await GET(new NextRequest("http://localhost/api/admin/data-consistency", { method: "GET" }))

    expect(response.status).toBe(401)
  })
})
