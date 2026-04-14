import { describe, expect, it } from "vitest"
import { callNextQueuePatient, completeQueueEntry } from "../lib/queue-actions"

function makeSupabase(overrides?: {
  failQueueAudit?: boolean
  failQueueSettings?: boolean
  rpcResponse?: { data?: unknown; error?: { code?: string; message?: string } | null }
}) {
  return {
    async rpc() {
      return overrides?.rpcResponse ?? { data: null, error: { code: "42883", message: "function does not exist" } }
    },
    from(table: string) {
      if (table === "queues") {
        return {
          select() {
            return {
              eq(column: string, value: string) {
                if (column === "department" && value === "opd") {
                  return {
                    eq() {
                      return {
                        order() {
                          return {
                            order() {
                              return {
                                async limit() {
                                  return {
                                    data: [
                                      {
                                        id: "q-1",
                                        status: "waiting",
                                        queue_number: "OPD-001",
                                        patient_id: "patient-b",
                                      },
                                      {
                                        id: "q-2",
                                        status: "waiting",
                                        queue_number: "OPD-002",
                                        patient_id: "patient-a",
                                      },
                                    ],
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

                return {
                  async maybeSingle() {
                    return {
                      data: { id: "q-1", status: "waiting", patient_id: "patient-b" },
                      error: null,
                    }
                  },
                }
              },
            }
          },
          update() {
            return {
              eq() {
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      }

      if (table === "patients") {
        return {
          select() {
            return {
              async in(_column: string, values: string[]) {
                const data = values.map((id) => ({
                  id,
                  facility_id: id === "patient-a" ? "facility-a" : "facility-b",
                }))
                return { data, error: null }
              },
            }
          },
        }
      }

      if (table === "queue_audit_logs" || table === "queue_settings") {
        return {
          async insert() {
            return { error: overrides?.failQueueAudit ? { message: "audit write failed" } : null }
          },
          update() {
            return {
              async eq() {
                return { error: overrides?.failQueueSettings ? { message: "settings write failed" } : null }
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

describe("queue-actions facility scope", () => {
  it("uses transactional rpc when available", async () => {
    const result = await callNextQueuePatient(
      makeSupabase({ rpcResponse: { data: { ok: true }, error: null } }) as never,
      "opd",
      "user-1",
      "facility-a",
      false,
    )
    expect(result.ok).toBe(true)
  })

  it("maps transactional rpc not_found responses", async () => {
    const result = await callNextQueuePatient(
      makeSupabase({
        rpcResponse: {
          data: { ok: false, code: "not_found", message: "No waiting patient found for this department." },
          error: null,
        },
      }) as never,
      "opd",
      "user-1",
      "facility-a",
      false,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("not_found")
    }
  })

  it("returns forbidden when completing queue item from another facility", async () => {
    const result = await completeQueueEntry(
      makeSupabase() as never,
      "q-1",
      "user-1",
      "facility-a",
      false,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("forbidden")
    }
  })

  it("selects the next queue item within actor facility", async () => {
    const result = await callNextQueuePatient(
      makeSupabase() as never,
      "opd",
      "user-1",
      "facility-a",
      false,
    )

    expect(result.ok).toBe(true)
  })

  it("throws when queue settings update fails after call next", async () => {
    await expect(
      callNextQueuePatient(
        makeSupabase({ failQueueSettings: true }) as never,
        "opd",
        "user-1",
        "facility-a",
        false,
      ),
    ).rejects.toBeTruthy()
  })
})
