import { describe, expect, it, vi } from "vitest"
import { ApiV1ClientError, createApiV1Client } from "../lib/api/v1-client"

function makeJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("api v1 client", () => {
  it("parses meta response successfully", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1", release_channel: "beta", capabilities: ["auth.session"] },
        app: { name: "HealthNet HMS", platforms: ["web"] },
        server_time_utc: new Date().toISOString(),
      }),
    )

    const client = createApiV1Client({ fetchImpl, basePath: "/api/v1" })
    const data = await client.getMeta()

    expect(data.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith("/api/v1/meta", expect.any(Object))
  })

  it("maps structured api errors", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse(
        {
          ok: false,
          error: {
            code: "forbidden",
            message: "Forbidden",
            request_id: "req_1",
          },
        },
        403,
      ),
    )
    const client = createApiV1Client({ fetchImpl })

    await expect(client.getSession()).rejects.toMatchObject<ApiV1ClientError>({
      code: "forbidden",
      status: 403,
      requestId: "req_1",
    })
  })

  it("maps invalid contract responses", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    await expect(client.getPatientsSummary()).rejects.toMatchObject<ApiV1ClientError>({
      code: "invalid_response",
      status: 200,
    })
  })

  it("maps network failures", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("failed to fetch")
    })
    const client = createApiV1Client({ fetchImpl })

    await expect(client.getBillingSummary()).rejects.toMatchObject<ApiV1ClientError>({
      code: "network_error",
      status: 0,
    })
  })

  it("parses dashboard summary response", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        dashboard: {
          patients_total: 120,
          visits_active: 9,
          invoices_open: 14,
          invoices_open_balance: 2220.5,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getDashboardSummary()
    expect(payload.dashboard.invoices_open).toBe(14)
    expect(fetchImpl).toHaveBeenCalledWith("/api/v1/dashboard/summary", expect.any(Object))
  })

  it("parses visits summary response with date range query", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        range: { from: "2026-04-01", to: "2026-04-30" },
        visits: {
          total_in_range: 55,
          active: 11,
          pending: 7,
          completed_or_discharged: 44,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getVisitsSummary({
      from: "2026-04-01",
      to: "2026-04-30",
    })

    expect(payload.visits.total_in_range).toBe(55)
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/visits/summary?from=2026-04-01&to=2026-04-30",
      expect.any(Object),
    )
  })

  it("parses appointments summary response with date range query", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        range: { from: "2026-04-01", to: "2026-04-30" },
        appointments: {
          total_in_range: 40,
          scheduled_or_confirmed: 9,
          completed: 28,
          cancelled: 3,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getAppointmentsSummary({
      from: "2026-04-01",
      to: "2026-04-30",
    })

    expect(payload.appointments.completed).toBe(28)
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/appointments/summary?from=2026-04-01&to=2026-04-30",
      expect.any(Object),
    )
  })

  it("parses prescriptions summary response with date range query", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        range: { from: "2026-04-01", to: "2026-04-30" },
        prescriptions: {
          total_in_range: 63,
          pending: 14,
          dispensed: 44,
          other: 5,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getPrescriptionsSummary({
      from: "2026-04-01",
      to: "2026-04-30",
    })

    expect(payload.prescriptions.dispensed).toBe(44)
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/prescriptions/summary?from=2026-04-01&to=2026-04-30",
      expect.any(Object),
    )
  })
})
