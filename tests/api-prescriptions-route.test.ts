import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requirePermissionMock = vi.fn()
const toAuthErrorResponseMock = vi.fn(() => null)

vi.mock("../lib/supabase/middleware", () => ({
  requirePermission: (...args: unknown[]) => requirePermissionMock(...args),
  toAuthErrorResponse: (...args: unknown[]) => toAuthErrorResponseMock(...args),
}))

import { POST } from "../app/api/prescriptions/route"

const VALID_PATIENT_ID = "11111111-1111-4111-8111-111111111111"
const VALID_VISIT_ID = "22222222-2222-4222-8222-222222222222"

function makeRequest(payload: Record<string, unknown>, requestId = "req_prescriptions_001") {
  return new NextRequest("http://localhost/api/prescriptions", {
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
  visitPatientId?: string | null
  visitFacilityId?: string | null
  visitStatus?: string | null
  hasVisit?: boolean
  existingOpenPrescription?: boolean
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
                      data: { id: VALID_PATIENT_ID, allergies: null, facility_id: "facility-a" },
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
                        visit_status: overrides?.visitStatus ?? "doctor_pending",
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

      if (table === "prescriptions") {
        return {
          select() {
            return {
              eq() {
                return {
                  in() {
                    return {
                      async limit() {
                        return {
                          data: overrides?.existingOpenPrescription ? [{ id: "rx-existing", status: "pending" }] : [],
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

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

afterEach(() => {
  requirePermissionMock.mockReset()
  toAuthErrorResponseMock.mockReset()
  toAuthErrorResponseMock.mockReturnValue(null)
})

const basePayload = {
  patient_identifier: "PT-001",
  visit_id: VALID_VISIT_ID,
  notes: "",
  medications: [
    {
      medication_name: "Paracetamol",
      dosage: "500mg",
      frequency: "BID",
      duration: "5 days",
      quantity: 10,
      instructions: "",
    },
  ],
}

describe("POST /api/prescriptions", () => {
  it("rejects duplicate medication lines in one prescription request", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase(),
      user: { id: "user-1", role: "doctor", facility_id: "facility-a" },
    })

    const response = await POST(
      makeRequest(
        {
          ...basePayload,
          medications: [
            {
              medication_name: "Paracetamol",
              dosage: "500mg",
              frequency: "BID",
              duration: "5 days",
              quantity: 10,
              instructions: "",
            },
            {
              medication_name: " paracetamol ",
              dosage: "500mg",
              frequency: "BID",
              duration: "5   days",
              quantity: 5,
              instructions: "",
            },
          ],
        },
        "req_rx_duplicate_lines",
      ),
    )
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe("duplicate_prescription_lines")
  })

  it("rejects creating a new open prescription when one already exists for the visit", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase({ existingOpenPrescription: true }),
      user: { id: "user-1", role: "doctor", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest(basePayload, "req_rx_open_exists"))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe("duplicate_open_prescription")
  })

  it("maps unique index violations to duplicate_open_prescription", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase({ rpcResponse: { data: null, error: { code: "23505", message: "duplicate key" } } }),
      user: { id: "user-1", role: "doctor", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest(basePayload, "req_rx_unique_violation"))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe("duplicate_open_prescription")
  })

  it("returns 503 when transactional rpc is unavailable", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase({ rpcResponse: { data: null, error: { code: "42883", message: "function missing" } } }),
      user: { id: "user-1", role: "doctor", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest(basePayload, "req_rx_rpc_missing"))
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload.error.code).toBe("transactional_dependency_unavailable")
  })

  it("uses transactional rpc when available", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase({
        rpcResponse: { data: { ok: true, prescription_id: "rx-rpc-1" }, error: null },
      }),
      user: { id: "user-1", role: "doctor", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest(basePayload, "req_rx_rpc_success"))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.prescription_id).toBe("rx-rpc-1")
  })

  it("maps transactional rpc duplicate responses to 409", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase({
        rpcResponse: {
          data: { ok: false, code: "duplicate_open_prescription", message: "An open prescription already exists for this visit." },
          error: null,
        },
      }),
      user: { id: "user-1", role: "doctor", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest(basePayload, "req_rx_rpc_duplicate"))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe("duplicate_open_prescription")
  })

  it("rejects non-json content types", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase(),
      user: { id: "user-1", role: "doctor", facility_id: "facility-a" },
    })
    const response = await POST(
      new NextRequest("http://localhost/api/prescriptions", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: "http://localhost",
          host: "localhost",
          "x-request-id": "req_rx_non_json",
        },
        body: "nope",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(415)
    expect(payload.error.code).toBe("unsupported_media_type")
  })

  it("rejects payloads without visit_id", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase(),
      user: { id: "user-1", role: "doctor", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest({ ...basePayload, visit_id: undefined }, "req_rx_invalid_1"))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe("invalid_payload")
  })

  it("rejects visit/patient mismatch", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase({ visitPatientId: "33333333-3333-4333-8333-333333333333" }),
      user: { id: "user-1", role: "doctor", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest(basePayload, "req_rx_mismatch_1"))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe("visit_patient_mismatch")
  })

  it("rejects cross-facility visit access", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase({ visitFacilityId: "facility-b" }),
      user: { id: "user-1", role: "doctor", facility_id: "facility-a" },
    })

    const response = await POST(makeRequest(basePayload, "req_rx_facility_1"))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error.code).toBe("visit_facility_mismatch")
  })

  it("rejects malformed json payloads", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase(),
      user: { id: "user-1", role: "doctor", facility_id: "facility-a" },
    })
    const response = await POST(
      new NextRequest("http://localhost/api/prescriptions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          host: "localhost",
          "x-request-id": "req_rx_bad_json",
        },
        body: "{bad-json}",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe("invalid_json")
  })
})
