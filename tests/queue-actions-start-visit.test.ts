import { afterEach, describe, expect, it, vi } from "vitest"

const ensureActiveVisitForPatientMock = vi.fn()

vi.mock("../lib/visit-flow", () => ({
  ensureActiveVisitForPatient: (...args: unknown[]) => ensureActiveVisitForPatientMock(...args),
}))

import { startOrContinueVisitForQueueEntry } from "../lib/queue-actions"

function makeSupabase(params?: {
  queue?: { id?: string; patient_id?: string | null; department?: string | null; visit_id?: string | null } | null
  patientFacilityId?: string | null
  existingVisitId?: string | null
}) {
  const queueRow = params?.queue ?? { id: "q-1", patient_id: "p-1", department: "opd", visit_id: null }
  const patientFacilityId = params?.patientFacilityId ?? "facility-a"
  const existingVisitId = params?.existingVisitId ?? null

  const queueUpdateEqMock = vi.fn().mockResolvedValue({ error: null })

  return {
    queueUpdateEqMock,
    client: {
      from(table: string) {
        if (table === "queues") {
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return { data: queueRow, error: null }
                    },
                  }
                },
              }
            },
            update() {
              return {
                eq: queueUpdateEqMock,
              }
            },
          }
        }

        if (table === "patients") {
          return {
            select() {
              return {
                async in() {
                  return {
                    data: queueRow?.patient_id ? [{ id: queueRow.patient_id, facility_id: patientFacilityId }] : [],
                    error: null,
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
                    gte() {
                      return {
                        order() {
                          return {
                            limit() {
                              return {
                                async maybeSingle() {
                                  return { data: existingVisitId ? { id: existingVisitId } : null, error: null }
                                },
                              }
                            },
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
    },
  }
}

afterEach(() => {
  ensureActiveVisitForPatientMock.mockReset()
})

describe("queue-actions start visit", () => {
  it("requires an authenticated actor", async () => {
    const supabase = makeSupabase()
    const result = await startOrContinueVisitForQueueEntry(supabase.client as never, "q-1", null, "facility-a", false)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("unauthorized")
    }
  })

  it("rejects cross-facility access for non-admin users", async () => {
    const supabase = makeSupabase({ patientFacilityId: "facility-b" })
    const result = await startOrContinueVisitForQueueEntry(supabase.client as never, "q-1", "u-1", "facility-a", false)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("forbidden")
    }
  })

  it("accepts cross-facility access for global admins", async () => {
    const supabase = makeSupabase({ patientFacilityId: "facility-b", existingVisitId: "visit-2" })
    const result = await startOrContinueVisitForQueueEntry(supabase.client as never, "q-1", "u-1", "facility-a", true)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.redirectTo).toBe("/dashboard/records/visit/visit-2")
    }
  })

  it("rejects non-opd queue items", async () => {
    const supabase = makeSupabase({ queue: { id: "q-2", patient_id: "p-1", department: "lab", visit_id: null } })
    const result = await startOrContinueVisitForQueueEntry(supabase.client as never, "q-2", "u-1", "facility-a", false)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("invalid_department")
    }
  })

  it("creates and links a visit when opd queue item has no visit", async () => {
    ensureActiveVisitForPatientMock.mockResolvedValue("visit-new-1")
    const supabase = makeSupabase({ existingVisitId: null })

    const result = await startOrContinueVisitForQueueEntry(supabase.client as never, "q-1", "u-1", "facility-a", false)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.redirectTo).toBe("/dashboard/records/visit/visit-new-1")
    }
    expect(ensureActiveVisitForPatientMock).toHaveBeenCalledWith(supabase.client, "p-1", { facilityCode: "opd" })
    expect(supabase.queueUpdateEqMock).toHaveBeenCalledWith("id", "q-1")
  })
})
