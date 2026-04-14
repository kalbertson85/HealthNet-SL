import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requireRoleMock = vi.fn()
const resolveAuthErrorMock = vi.fn(() => null)
const callNextQueuePatientMock = vi.fn()
const completeQueueEntryMock = vi.fn()
const cancelQueueEntryMock = vi.fn()
const startOrContinueVisitForQueueEntryMock = vi.fn()

vi.mock("../lib/auth-guard", () => ({
  requireRole: (...args: unknown[]) => requireRoleMock(...args),
  resolveAuthError: (...args: unknown[]) => resolveAuthErrorMock(...args),
}))

vi.mock("../lib/queue-actions", () => ({
  callNextQueuePatient: (...args: unknown[]) => callNextQueuePatientMock(...args),
  completeQueueEntry: (...args: unknown[]) => completeQueueEntryMock(...args),
  cancelQueueEntry: (...args: unknown[]) => cancelQueueEntryMock(...args),
  startOrContinueVisitForQueueEntry: (...args: unknown[]) => startOrContinueVisitForQueueEntryMock(...args),
}))

import { POST } from "../app/api/queue/actions/route"

afterEach(() => {
  requireRoleMock.mockReset()
  resolveAuthErrorMock.mockReset()
  resolveAuthErrorMock.mockReturnValue(null)
  callNextQueuePatientMock.mockReset()
  completeQueueEntryMock.mockReset()
  cancelQueueEntryMock.mockReset()
  startOrContinueVisitForQueueEntryMock.mockReset()
})

describe("POST /api/queue/actions", () => {
  it("rejects non-json content types", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/queue/actions", {
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
    expect(requireRoleMock).not.toHaveBeenCalled()
  })

  it("rejects malformed json payloads", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/queue/actions", {
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
    expect(requireRoleMock).not.toHaveBeenCalled()
  })

  it("processes valid call_next actions", async () => {
    requireRoleMock.mockResolvedValue({
      supabase: {},
      user: { id: "u-1", role: "admin", facility_id: null },
    })
    callNextQueuePatientMock.mockResolvedValue({ ok: true })

    const response = await POST(
      new NextRequest("http://localhost/api/queue/actions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          host: "localhost",
        },
        body: JSON.stringify({ type: "call_next", department: "opd" }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(callNextQueuePatientMock).toHaveBeenCalled()
  })

  it("maps start_visit not-found errors to 404", async () => {
    requireRoleMock.mockResolvedValue({
      supabase: {},
      user: { id: "u-1", role: "doctor", facility_id: "facility-a" },
    })
    startOrContinueVisitForQueueEntryMock.mockResolvedValue({
      ok: false,
      code: "not_found",
      message: "Queue item could not be found.",
    })

    const response = await POST(
      new NextRequest("http://localhost/api/queue/actions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          host: "localhost",
        },
        body: JSON.stringify({ type: "start_visit", queueId: "11111111-1111-4111-8111-111111111111" }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload.error.code).toBe("not_found")
  })

  it("maps start_visit forbidden errors to 403", async () => {
    requireRoleMock.mockResolvedValue({
      supabase: {},
      user: { id: "u-1", role: "doctor", facility_id: "facility-a" },
    })
    startOrContinueVisitForQueueEntryMock.mockResolvedValue({
      ok: false,
      code: "forbidden",
      message: "Queue item belongs to another facility.",
    })

    const response = await POST(
      new NextRequest("http://localhost/api/queue/actions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          host: "localhost",
        },
        body: JSON.stringify({ type: "start_visit", queueId: "11111111-1111-4111-8111-111111111111" }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error.code).toBe("forbidden")
  })

  it("returns redirect target when start_visit succeeds", async () => {
    requireRoleMock.mockResolvedValue({
      supabase: {},
      user: { id: "u-1", role: "doctor", facility_id: "facility-a" },
    })
    startOrContinueVisitForQueueEntryMock.mockResolvedValue({
      ok: true,
      redirectTo: "/dashboard/records/visit/v-1",
    })

    const response = await POST(
      new NextRequest("http://localhost/api/queue/actions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          host: "localhost",
        },
        body: JSON.stringify({ type: "start_visit", queueId: "11111111-1111-4111-8111-111111111111" }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.redirectTo).toBe("/dashboard/records/visit/v-1")
    expect(startOrContinueVisitForQueueEntryMock).toHaveBeenCalled()
  })
})
