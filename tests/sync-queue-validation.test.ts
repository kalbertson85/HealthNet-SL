import { describe, expect, it } from "vitest"
import { buildSyncQueueRows, MAX_OPERATION_PAYLOAD_BYTES, MAX_SYNC_OPERATIONS } from "../lib/sync/queue-validation"

describe("buildSyncQueueRows", () => {
  it("accepts a single operation", () => {
    const rows = buildSyncQueueRows("user-1", { type: "patient.update", id: "p-1" })
    expect(rows).toHaveLength(1)
    expect(rows[0].operation_type).toBe("patient.update")
    expect(rows[0].user_id).toBe("user-1")
  })

  it("accepts a bounded array of operations", () => {
    const operations = Array.from({ length: MAX_SYNC_OPERATIONS }, (_, i) => ({ type: `op.${i + 1}` }))
    const rows = buildSyncQueueRows("user-2", operations)
    expect(rows).toHaveLength(MAX_SYNC_OPERATIONS)
  })

  it("rejects operations without a valid type", () => {
    expect(() => buildSyncQueueRows("user-3", { type: "" })).toThrow()
  })

  it("rejects too many operations", () => {
    const operations = Array.from({ length: MAX_SYNC_OPERATIONS + 1 }, (_, i) => ({ type: `op.${i + 1}` }))
    expect(() => buildSyncQueueRows("user-4", operations)).toThrow()
  })

  it("rejects payloads over the size limit", () => {
    const big = "x".repeat(MAX_OPERATION_PAYLOAD_BYTES + 1)
    expect(() => buildSyncQueueRows("user-5", { type: "big.payload", big })).toThrow("Operation payload is too large")
  })
})
