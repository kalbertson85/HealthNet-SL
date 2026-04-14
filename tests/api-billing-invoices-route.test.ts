import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requirePermissionMock = vi.fn()
const toAuthErrorResponseMock = vi.fn(() => null)
const ensureActiveVisitForPatientMock = vi.fn()

vi.mock("../lib/supabase/middleware", () => ({
  requirePermission: (...args: unknown[]) => requirePermissionMock(...args),
  toAuthErrorResponse: (...args: unknown[]) => toAuthErrorResponseMock(...args),
}))

vi.mock("../lib/visit-flow", () => ({
  ensureActiveVisitForPatient: (...args: unknown[]) => ensureActiveVisitForPatientMock(...args),
}))

import { POST } from "../app/api/billing/invoices/route"

const VALID_VISIT_ID = "22222222-2222-4222-8222-222222222222"
const VALID_PATIENT_ID = "11111111-1111-4111-8111-111111111111"

function makeRequest(payload: Record<string, unknown>, requestId = "req_billing_001") {
  return new NextRequest("http://localhost/api/billing/invoices", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      host: "localhost",
      "x-request-id": requestId,
    },
    body: JSON.stringify(payload),
  })
}

function makeSupabase(overrides?: {
  patientFacilityId?: string | null
  visitPatientId?: string | null
  visitFacilityId?: string | null
  visitStatus?: string | null
  hasVisit?: boolean
  existingOpenInvoice?: boolean
  rpcResponse?: { data?: unknown; error?: { code?: string; message?: string } | null } | null
}) {
  return {
    async rpc() {
      return overrides?.rpcResponse ?? { data: null, error: { code: "42883", message: "function does not exist" } }
    },
    from(table: string) {
      if (table === "patients") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: { id: VALID_PATIENT_ID, facility_id: overrides?.patientFacilityId ?? "facility-a" },
                      error: null,
                    }
                  },
                }
              },
            }
          },
        }
      }

      if (table === "visits") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    if (overrides?.hasVisit === false) {
                      return { data: null, error: null }
                    }
                    return {
                      data: {
                        id: VALID_VISIT_ID,
                        patient_id: overrides?.visitPatientId ?? VALID_PATIENT_ID,
                        facility_id: overrides?.visitFacilityId ?? "facility-a",
                        visit_status: overrides?.visitStatus ?? "billing_pending",
                      },
                      error: null,
                    }
                  },
                }
              },
            }
          },
        }
      }

      if (table === "invoices") {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      async limit() {
                        return {
                          data: overrides?.existingOpenInvoice
                            ? [{ id: "inv-existing", total_amount: 200, paid_amount: 0 }]
                            : [],
                          error: null,
                        }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      }

      if (table === "invoice_items" || table === "billing_audit_logs") {
        return {
          async insert() {
            return { error: null }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

afterEach(() => {
  requirePermissionMock.mockReset()
  toAuthErrorResponseMock.mockReset()
  ensureActiveVisitForPatientMock.mockReset()
  toAuthErrorResponseMock.mockReturnValue(null)
})

const basePayload = {
  patient_number: "PT-001",
  visit_id: VALID_VISIT_ID,
  notes: "",
  items: [
    {
      description: "Consultation",
      quantity: 1,
      unit_price: 100,
    },
  ],
}

describe("POST /api/billing/invoices", () => {
  it("rejects duplicate line items in one invoice request", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase(),
      user: { id: "user-1", role: "cashier", facility_id: "facility-a" },
    })

    const response = await POST(
      makeRequest(
        {
          ...basePayload,
          items: [
            { description: "Consultation", quantity: 1, unit_price: 100 },
            { description: " consultation ", quantity: 2, unit_price: 100 },
          ],
        },
        "req_inv_duplicate_lines",
      ),
    )
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe("duplicate_invoice_lines")
  })

  it("rejects creating a new open invoice when one already exists for the visit", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase({ existingOpenInvoice: true }),
      user: { id: "user-1", role: "cashier", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest(basePayload, "req_inv_open_exists"))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe("duplicate_open_invoice")
  })

  it("maps unique index violations to duplicate_open_invoice", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase({ rpcResponse: { data: null, error: { code: "23505", message: "duplicate key" } } }),
      user: { id: "user-1", role: "cashier", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest(basePayload, "req_inv_unique_violation"))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe("duplicate_open_invoice")
  })

  it("returns 503 when transactional rpc is unavailable", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase({ rpcResponse: { data: null, error: { code: "42883", message: "function missing" } } }),
      user: { id: "user-1", role: "cashier", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest(basePayload, "req_inv_rpc_missing"))
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload.error.code).toBe("transactional_dependency_unavailable")
  })

  it("uses transactional rpc when available", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase({
        rpcResponse: { data: { ok: true, invoice_id: "inv-rpc-1" }, error: null },
      }),
      user: { id: "user-1", role: "cashier", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest(basePayload, "req_inv_rpc_success"))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.invoice_id).toBe("inv-rpc-1")
  })

  it("maps transactional rpc duplicate responses to 409", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase({
        rpcResponse: {
          data: { ok: false, code: "duplicate_open_invoice", message: "An open invoice already exists for this visit." },
          error: null,
        },
      }),
      user: { id: "user-1", role: "cashier", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest(basePayload, "req_inv_rpc_duplicate"))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe("duplicate_open_invoice")
  })

  it("rejects non-json content types", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase(),
      user: { id: "user-1", role: "cashier", facility_id: "facility-a" },
    })
    const response = await POST(
      new NextRequest("http://localhost/api/billing/invoices", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: "http://localhost",
          host: "localhost",
          "x-request-id": "req_inv_non_json",
        },
        body: "nope",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(415)
    expect(payload.error.code).toBe("unsupported_media_type")
  })

  it("rejects cross-facility patient access", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase({ patientFacilityId: "facility-b" }),
      user: { id: "user-1", role: "cashier", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest(basePayload, "req_inv_facility_1"))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error.code).toBe("patient_facility_mismatch")
  })

  it("rejects closed visits", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase({ visitStatus: "completed" }),
      user: { id: "user-1", role: "cashier", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest(basePayload, "req_inv_closed_1"))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe("visit_closed")
  })

  it("rejects visit/patient mismatch", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase({ visitPatientId: "33333333-3333-4333-8333-333333333333" }),
      user: { id: "user-1", role: "cashier", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest(basePayload, "req_inv_mismatch_1"))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe("visit_patient_mismatch")
  })

  it("rejects malformed json payloads", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase(),
      user: { id: "user-1", role: "cashier", facility_id: "facility-a" },
    })
    const response = await POST(
      new NextRequest("http://localhost/api/billing/invoices", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          host: "localhost",
          "x-request-id": "req_inv_bad_json",
        },
        body: "{bad-json}",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe("invalid_json")
  })
})
