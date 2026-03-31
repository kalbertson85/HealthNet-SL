import { describe, it, expect, beforeEach, vi } from "vitest"
import { createServerClient } from "@/lib/supabase/server"
import { logAuditEvent } from "../lib/audit"

// Mock Supabase server client used inside audit helper
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}))

const createServerClientMock = vi.mocked(createServerClient)

let insertMock: ReturnType<typeof vi.fn>
let getUserMock: ReturnType<typeof vi.fn>

describe("logAuditEvent", () => {
  beforeEach(() => {
    insertMock = vi.fn()
    getUserMock = vi.fn()

    createServerClientMock.mockResolvedValue({
      from: () => ({ insert: insertMock }),
      auth: { getUser: getUserMock },
    } as unknown as Awaited<ReturnType<typeof createServerClient>>)
  })

  it("writes an audit log with provided user context", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-user", role: "doctor" } } })
    insertMock.mockResolvedValue({})

    await logAuditEvent({
      action: "test.action",
      resourceType: "resource",
      resourceId: "123",
      user: { id: "explicit-user", role: "nurse", facility_id: "facility-1" },
      metadata: { foo: "bar" },
    })

    expect(insertMock).toHaveBeenCalledTimes(1)
    const payload = insertMock.mock.calls[0][0]

    expect(payload.action).toBe("test.action")
    expect(payload.resource_type).toBe("resource")
    expect(payload.resource_id).toBe("123")
    expect(payload.user_id).toBe("explicit-user")
    expect(payload.role).toBe("nurse")
    expect(payload.facility_id).toBe("facility-1")
    expect(payload.metadata).toEqual({ foo: "bar" })
  })

  it("falls back to auth user when no explicit user is provided", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-user", role: "doctor" } } })
    insertMock.mockResolvedValue({})

    await logAuditEvent({
      action: "test.action",
      resourceType: "resource",
      resourceId: "123",
      metadata: { foo: "bar" },
    })

    expect(insertMock).toHaveBeenCalledTimes(1)
    const payload = insertMock.mock.calls[0][0]

    expect(payload.user_id).toBe("auth-user")
    expect(payload.role).toBeNull()
  })

  it("does not throw when Supabase insert fails", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-user", role: "doctor" } } })
    insertMock.mockRejectedValue(new Error("db error"))

    await expect(
      logAuditEvent({
        action: "test.action",
      }),
    ).resolves.not.toThrow()
  })
})
