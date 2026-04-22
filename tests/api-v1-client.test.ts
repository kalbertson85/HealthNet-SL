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

  it("parses lab summary response with date range query", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        range: { from: "2026-04-01", to: "2026-04-30" },
        lab: {
          total_in_range: 27,
          pending: 8,
          in_progress: 6,
          completed: 11,
          cancelled: 2,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getLabSummary({
      from: "2026-04-01",
      to: "2026-04-30",
    })

    expect(payload.lab.in_progress).toBe(6)
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/lab/summary?from=2026-04-01&to=2026-04-30",
      expect.any(Object),
    )
  })

  it("parses radiology summary response with date range query", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        range: { from: "2026-04-01", to: "2026-04-30" },
        radiology: {
          total_in_range: 33,
          pending: 9,
          scheduled: 7,
          completed: 14,
          cancelled: 3,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getRadiologySummary({
      from: "2026-04-01",
      to: "2026-04-30",
    })

    expect(payload.radiology.completed).toBe(14)
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/radiology/summary?from=2026-04-01&to=2026-04-30",
      expect.any(Object),
    )
  })

  it("parses pharmacy summary response", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        pharmacy: {
          pending_prescriptions: 12,
          low_stock_items: 5,
          expiring_soon_items: 4,
          expired_items: 1,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getPharmacySummary()
    expect(payload.pharmacy.low_stock_items).toBe(5)
    expect(fetchImpl).toHaveBeenCalledWith("/api/v1/pharmacy/summary", expect.any(Object))
  })

  it("parses queue summary response with date range query", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        range: { from: "2026-04-01", to: "2026-04-30" },
        queue: {
          total_in_range: 72,
          waiting: 18,
          in_progress: 11,
          completed: 39,
          cancelled: 4,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getQueueSummary({
      from: "2026-04-01",
      to: "2026-04-30",
    })
    expect(payload.queue.completed).toBe(39)
    expect(fetchImpl).toHaveBeenCalledWith("/api/v1/queue/summary?from=2026-04-01&to=2026-04-30", expect.any(Object))
  })

  it("parses emergency summary response with date range query", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        range: { from: "2026-04-01", to: "2026-04-30" },
        emergency: {
          total_in_range: 21,
          pending: 6,
          in_treatment: 7,
          admitted: 3,
          discharged_or_transferred: 5,
          critical_or_emergency: 8,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getEmergencySummary({
      from: "2026-04-01",
      to: "2026-04-30",
    })
    expect(payload.emergency.critical_or_emergency).toBe(8)
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/emergency/summary?from=2026-04-01&to=2026-04-30",
      expect.any(Object),
    )
  })

  it("parses inpatient summary response with date range query", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        range: { from: "2026-04-01", to: "2026-04-30" },
        inpatient: {
          total_in_range: 19,
          admitted_or_active: 8,
          discharged: 9,
          other: 2,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getInpatientSummary({
      from: "2026-04-01",
      to: "2026-04-30",
    })
    expect(payload.inpatient.discharged).toBe(9)
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/inpatient/summary?from=2026-04-01&to=2026-04-30",
      expect.any(Object),
    )
  })

  it("parses surgery summary response with date range query", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        range: { from: "2026-04-01", to: "2026-04-30" },
        surgery: {
          total_in_range: 15,
          scheduled_or_pending: 5,
          in_progress: 3,
          completed: 6,
          other: 1,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getSurgerySummary({
      from: "2026-04-01",
      to: "2026-04-30",
    })
    expect(payload.surgery.completed).toBe(6)
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/surgery/summary?from=2026-04-01&to=2026-04-30",
      expect.any(Object),
    )
  })

  it("parses nursing summary response with date range query", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        range: { from: "2026-04-01", to: "2026-04-30" },
        nursing: {
          active_visits: 24,
          notes_in_range: 51,
          pending_ward_requests_in_range: 7,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getNursingSummary({
      from: "2026-04-01",
      to: "2026-04-30",
    })
    expect(payload.nursing.notes_in_range).toBe(51)
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/nursing/summary?from=2026-04-01&to=2026-04-30",
      expect.any(Object),
    )
  })

  it("parses doctor summary response", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        doctor: {
          total_open_cases: 17,
          doctor_pending: 9,
          doctor_review: 4,
          lab_pending: 4,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getDoctorSummary()
    expect(payload.doctor.total_open_cases).toBe(17)
    expect(fetchImpl).toHaveBeenCalledWith("/api/v1/doctor/summary", expect.any(Object))
  })

  it("parses triage summary response with date range query", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        range: { from: "2026-04-01", to: "2026-04-30" },
        triage: {
          total_in_range: 29,
          pending: 10,
          in_treatment: 8,
          critical_or_emergency: 9,
          red: 4,
          orange: 5,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getTriageSummary({
      from: "2026-04-01",
      to: "2026-04-30",
    })
    expect(payload.triage.critical_or_emergency).toBe(9)
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/triage/summary?from=2026-04-01&to=2026-04-30",
      expect.any(Object),
    )
  })

  it("parses records summary response with date range query", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        range: { from: "2026-04-01", to: "2026-04-30" },
        records: {
          total_in_range: 102,
          active: 37,
          completed: 43,
          discharged: 22,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getRecordsSummary({
      from: "2026-04-01",
      to: "2026-04-30",
    })
    expect(payload.records.completed).toBe(43)
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/records/summary?from=2026-04-01&to=2026-04-30",
      expect.any(Object),
    )
  })

  it("parses notifications summary response", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        notifications: {
          total: 88,
          unread: 12,
          live_alerts: 6,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getNotificationsSummary()
    expect(payload.notifications.unread).toBe(12)
    expect(fetchImpl).toHaveBeenCalledWith("/api/v1/notifications/summary", expect.any(Object))
  })

  it("parses admin summary response", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        admin: {
          total_staff_profiles: 42,
          active_staff_profiles: 39,
          blocked_staff_profiles: 3,
          total_facilities: 5,
          audit_events_24h: 17,
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getAdminSummary()
    expect(payload.admin.total_facilities).toBe(5)
    expect(fetchImpl).toHaveBeenCalledWith("/api/v1/admin/summary", expect.any(Object))
  })

  it("parses reports summary response with date range query", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        range: { from: "2026-04-01", to: "2026-04-30" },
        reports: {
          monthly_revenue: 12900.75,
          new_patients: 25,
          completed_visits: 63,
          pending_lab_tests: 11,
          source: "rpc",
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getReportsSummary({
      from: "2026-04-01",
      to: "2026-04-30",
    })
    expect(payload.reports.monthly_revenue).toBe(12900.75)
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/reports/summary?from=2026-04-01&to=2026-04-30",
      expect.any(Object),
    )
  })

  it("parses audit trail response with query filters", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
        filters: {
          limit: 25,
          from: "2026-04-01",
          to: "2026-04-30",
        },
        audit: {
          events: [
            {
              id: "evt_1",
              occurred_at: "2026-04-10T12:00:00.000Z",
              action: "billing.invoice_created",
              resource_type: "invoice",
              resource_id: "inv_1",
              actor_user_id: "user_1",
              actor_role: "cashier",
              facility_id: "fac_1",
            },
          ],
        },
        server_time_utc: new Date().toISOString(),
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    const payload = await client.getAuditTrail({
      limit: 25,
      from: "2026-04-01",
      to: "2026-04-30",
    })
    expect(payload.audit.events[0]?.action).toBe("billing.invoice_created")
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/audit/trail?limit=25&from=2026-04-01&to=2026-04-30",
      expect.any(Object),
    )
  })
})
