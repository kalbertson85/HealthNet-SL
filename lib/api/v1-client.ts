import { z } from "zod"
import type {
  ApiV1AppointmentsSummaryResponse,
  ApiV1DashboardSummaryResponse,
  ApiV1BillingSummaryResponse,
  ApiV1MetaResponse,
  ApiV1LabSummaryResponse,
  ApiV1PatientsSummaryResponse,
  ApiV1PrescriptionsSummaryResponse,
  ApiV1PharmacySummaryResponse,
  ApiV1QueueSummaryResponse,
  ApiV1RadiologySummaryResponse,
  ApiV1EmergencySummaryResponse,
  ApiV1InpatientSummaryResponse,
  ApiV1SurgerySummaryResponse,
  ApiV1NursingSummaryResponse,
  ApiV1DoctorSummaryResponse,
  ApiV1TriageSummaryResponse,
  ApiV1RecordsSummaryResponse,
  ApiV1NotificationsSummaryResponse,
  ApiV1AdminSummaryResponse,
  ApiV1ReportsSummaryResponse,
  ApiV1AuditTrailResponse,
  ApiV1SessionResponse,
  ApiV1VisitsSummaryResponse,
} from "@/lib/api/v1"

const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    request_id: z.string().optional(),
  }),
})

const metaSchema = z.object({
  ok: z.literal(true),
  api: z.object({
    version: z.string(),
    release_channel: z.string(),
    capabilities: z.array(z.string()),
  }),
  app: z.object({
    name: z.string(),
    platforms: z.array(z.string()),
  }),
  server_time_utc: z.string(),
})

const sessionSchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  session: z.object({
    user_id: z.string(),
    role: z.string().nullable(),
    facility_id: z.string().nullable(),
    permissions: z.array(z.string()),
  }),
  server_time_utc: z.string(),
})

const patientsSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  patients: z.object({
    total: z.number(),
    created_in_range: z.number(),
  }),
  server_time_utc: z.string(),
})

const billingSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  billing: z.object({
    invoice_count: z.number(),
    total_amount: z.number(),
    paid_amount: z.number(),
    outstanding_balance: z.number(),
    open_invoice_count: z.number(),
  }),
  server_time_utc: z.string(),
})

const dashboardSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  dashboard: z.object({
    patients_total: z.number(),
    visits_active: z.number(),
    invoices_open: z.number(),
    invoices_open_balance: z.number(),
  }),
  server_time_utc: z.string(),
})

const visitsSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  visits: z.object({
    total_in_range: z.number(),
    active: z.number(),
    pending: z.number(),
    completed_or_discharged: z.number(),
  }),
  server_time_utc: z.string(),
})

const appointmentsSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  appointments: z.object({
    total_in_range: z.number(),
    scheduled_or_confirmed: z.number(),
    completed: z.number(),
    cancelled: z.number(),
  }),
  server_time_utc: z.string(),
})

const prescriptionsSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  prescriptions: z.object({
    total_in_range: z.number(),
    pending: z.number(),
    dispensed: z.number(),
    other: z.number(),
  }),
  server_time_utc: z.string(),
})

const labSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  lab: z.object({
    total_in_range: z.number(),
    pending: z.number(),
    in_progress: z.number(),
    completed: z.number(),
    cancelled: z.number(),
  }),
  server_time_utc: z.string(),
})

const radiologySummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  radiology: z.object({
    total_in_range: z.number(),
    pending: z.number(),
    scheduled: z.number(),
    completed: z.number(),
    cancelled: z.number(),
  }),
  server_time_utc: z.string(),
})

const pharmacySummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  pharmacy: z.object({
    pending_prescriptions: z.number(),
    low_stock_items: z.number(),
    expiring_soon_items: z.number(),
    expired_items: z.number(),
  }),
  server_time_utc: z.string(),
})

const queueSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  queue: z.object({
    total_in_range: z.number(),
    waiting: z.number(),
    in_progress: z.number(),
    completed: z.number(),
    cancelled: z.number(),
  }),
  server_time_utc: z.string(),
})

const emergencySummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  emergency: z.object({
    total_in_range: z.number(),
    pending: z.number(),
    in_treatment: z.number(),
    admitted: z.number(),
    discharged_or_transferred: z.number(),
    critical_or_emergency: z.number(),
  }),
  server_time_utc: z.string(),
})

const inpatientSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  inpatient: z.object({
    total_in_range: z.number(),
    admitted_or_active: z.number(),
    discharged: z.number(),
    other: z.number(),
  }),
  server_time_utc: z.string(),
})

const surgerySummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  surgery: z.object({
    total_in_range: z.number(),
    scheduled_or_pending: z.number(),
    in_progress: z.number(),
    completed: z.number(),
    other: z.number(),
  }),
  server_time_utc: z.string(),
})

const nursingSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  nursing: z.object({
    active_visits: z.number(),
    notes_in_range: z.number(),
    pending_ward_requests_in_range: z.number(),
  }),
  server_time_utc: z.string(),
})

const doctorSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  doctor: z.object({
    total_open_cases: z.number(),
    doctor_pending: z.number(),
    doctor_review: z.number(),
    lab_pending: z.number(),
  }),
  server_time_utc: z.string(),
})

const triageSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  triage: z.object({
    total_in_range: z.number(),
    pending: z.number(),
    in_treatment: z.number(),
    critical_or_emergency: z.number(),
    red: z.number(),
    orange: z.number(),
  }),
  server_time_utc: z.string(),
})

const recordsSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  records: z.object({
    total_in_range: z.number(),
    active: z.number(),
    completed: z.number(),
    discharged: z.number(),
  }),
  server_time_utc: z.string(),
})

const notificationsSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  notifications: z.object({
    total: z.number(),
    unread: z.number(),
    live_alerts: z.number(),
  }),
  server_time_utc: z.string(),
})

const adminSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  admin: z.object({
    total_staff_profiles: z.number(),
    active_staff_profiles: z.number(),
    blocked_staff_profiles: z.number(),
    total_facilities: z.number(),
    audit_events_24h: z.number(),
  }),
  server_time_utc: z.string(),
})

const reportsSummarySchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  reports: z.object({
    monthly_revenue: z.number(),
    new_patients: z.number(),
    completed_visits: z.number(),
    pending_lab_tests: z.number(),
    source: z.union([z.literal("rpc"), z.literal("fallback")]),
  }),
  server_time_utc: z.string(),
})

const auditTrailSchema = z.object({
  ok: z.literal(true),
  api: z.object({ version: z.string() }),
  filters: z.object({
    limit: z.number(),
    from: z.string().nullable(),
    to: z.string().nullable(),
  }),
  audit: z.object({
    events: z.array(
      z.object({
        id: z.string(),
        occurred_at: z.string(),
        action: z.string(),
        resource_type: z.string().nullable(),
        resource_id: z.string().nullable(),
        actor_user_id: z.string().nullable(),
        actor_role: z.string().nullable(),
        facility_id: z.string().nullable(),
      }),
    ),
  }),
  server_time_utc: z.string(),
})

export class ApiV1ClientError extends Error {
  code: string
  status: number
  requestId: string | null

  constructor(params: { code: string; message: string; status: number; requestId?: string | null }) {
    super(params.message)
    this.name = "ApiV1ClientError"
    this.code = params.code
    this.status = params.status
    this.requestId = params.requestId ?? null
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function createApiV1Client(opts?: {
  basePath?: string
  fetchImpl?: FetchLike
  defaultInit?: RequestInit
}) {
  const basePath = opts?.basePath || "/api/v1"
  const fetchImpl = opts?.fetchImpl || (globalThis.fetch as FetchLike)
  const defaultInit = opts?.defaultInit || {}

  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch implementation is required to create API v1 client")
  }

  const request = async <T>(path: string, schema: z.ZodType<T>) => {
    let response: Response
    try {
      response = await fetchImpl(`${basePath}${path}`, {
        method: "GET",
        ...defaultInit,
      })
    } catch {
      throw new ApiV1ClientError({
        code: "network_error",
        message: "Unable to reach API endpoint",
        status: 0,
      })
    }

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const parsedError = apiErrorSchema.safeParse(data)
      if (parsedError.success) {
        throw new ApiV1ClientError({
          code: parsedError.data.error.code,
          message: parsedError.data.error.message,
          status: response.status,
          requestId: parsedError.data.error.request_id || null,
        })
      }
      throw new ApiV1ClientError({
        code: "unexpected_error",
        message: `API request failed with status ${response.status}`,
        status: response.status,
      })
    }

    const parsed = schema.safeParse(data)
    if (!parsed.success) {
      throw new ApiV1ClientError({
        code: "invalid_response",
        message: "API response did not match expected v1 contract",
        status: response.status,
      })
    }
    return parsed.data
  }

  return {
    async getMeta(): Promise<ApiV1MetaResponse> {
      return request("/meta", metaSchema) as Promise<ApiV1MetaResponse>
    },
    async getSession(): Promise<ApiV1SessionResponse> {
      return request("/session", sessionSchema) as Promise<ApiV1SessionResponse>
    },
    async getPatientsSummary(params?: { from?: string; to?: string }): Promise<ApiV1PatientsSummaryResponse> {
      const query = new URLSearchParams()
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/patients/summary${suffix}`, patientsSummarySchema) as Promise<ApiV1PatientsSummaryResponse>
    },
    async getBillingSummary(params?: {
      from?: string
      to?: string
      payerType?: "all" | "patient" | "company"
    }): Promise<ApiV1BillingSummaryResponse> {
      const query = new URLSearchParams()
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      if (params?.payerType) query.set("payer_type", params.payerType)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/billing/summary${suffix}`, billingSummarySchema) as Promise<ApiV1BillingSummaryResponse>
    },
    async getDashboardSummary(): Promise<ApiV1DashboardSummaryResponse> {
      return request("/dashboard/summary", dashboardSummarySchema) as Promise<ApiV1DashboardSummaryResponse>
    },
    async getVisitsSummary(params?: { from?: string; to?: string }): Promise<ApiV1VisitsSummaryResponse> {
      const query = new URLSearchParams()
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/visits/summary${suffix}`, visitsSummarySchema) as Promise<ApiV1VisitsSummaryResponse>
    },
    async getAppointmentsSummary(params?: { from?: string; to?: string }): Promise<ApiV1AppointmentsSummaryResponse> {
      const query = new URLSearchParams()
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/appointments/summary${suffix}`, appointmentsSummarySchema) as Promise<ApiV1AppointmentsSummaryResponse>
    },
    async getPrescriptionsSummary(
      params?: { from?: string; to?: string },
    ): Promise<ApiV1PrescriptionsSummaryResponse> {
      const query = new URLSearchParams()
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/prescriptions/summary${suffix}`, prescriptionsSummarySchema) as Promise<ApiV1PrescriptionsSummaryResponse>
    },
    async getLabSummary(params?: { from?: string; to?: string }): Promise<ApiV1LabSummaryResponse> {
      const query = new URLSearchParams()
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/lab/summary${suffix}`, labSummarySchema) as Promise<ApiV1LabSummaryResponse>
    },
    async getRadiologySummary(params?: { from?: string; to?: string }): Promise<ApiV1RadiologySummaryResponse> {
      const query = new URLSearchParams()
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/radiology/summary${suffix}`, radiologySummarySchema) as Promise<ApiV1RadiologySummaryResponse>
    },
    async getPharmacySummary(): Promise<ApiV1PharmacySummaryResponse> {
      return request("/pharmacy/summary", pharmacySummarySchema) as Promise<ApiV1PharmacySummaryResponse>
    },
    async getQueueSummary(params?: { from?: string; to?: string }): Promise<ApiV1QueueSummaryResponse> {
      const query = new URLSearchParams()
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/queue/summary${suffix}`, queueSummarySchema) as Promise<ApiV1QueueSummaryResponse>
    },
    async getEmergencySummary(params?: { from?: string; to?: string }): Promise<ApiV1EmergencySummaryResponse> {
      const query = new URLSearchParams()
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/emergency/summary${suffix}`, emergencySummarySchema) as Promise<ApiV1EmergencySummaryResponse>
    },
    async getInpatientSummary(params?: { from?: string; to?: string }): Promise<ApiV1InpatientSummaryResponse> {
      const query = new URLSearchParams()
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/inpatient/summary${suffix}`, inpatientSummarySchema) as Promise<ApiV1InpatientSummaryResponse>
    },
    async getSurgerySummary(params?: { from?: string; to?: string }): Promise<ApiV1SurgerySummaryResponse> {
      const query = new URLSearchParams()
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/surgery/summary${suffix}`, surgerySummarySchema) as Promise<ApiV1SurgerySummaryResponse>
    },
    async getNursingSummary(params?: { from?: string; to?: string }): Promise<ApiV1NursingSummaryResponse> {
      const query = new URLSearchParams()
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/nursing/summary${suffix}`, nursingSummarySchema) as Promise<ApiV1NursingSummaryResponse>
    },
    async getDoctorSummary(): Promise<ApiV1DoctorSummaryResponse> {
      return request("/doctor/summary", doctorSummarySchema) as Promise<ApiV1DoctorSummaryResponse>
    },
    async getTriageSummary(params?: { from?: string; to?: string }): Promise<ApiV1TriageSummaryResponse> {
      const query = new URLSearchParams()
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/triage/summary${suffix}`, triageSummarySchema) as Promise<ApiV1TriageSummaryResponse>
    },
    async getRecordsSummary(params?: { from?: string; to?: string }): Promise<ApiV1RecordsSummaryResponse> {
      const query = new URLSearchParams()
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/records/summary${suffix}`, recordsSummarySchema) as Promise<ApiV1RecordsSummaryResponse>
    },
    async getNotificationsSummary(): Promise<ApiV1NotificationsSummaryResponse> {
      return request("/notifications/summary", notificationsSummarySchema) as Promise<ApiV1NotificationsSummaryResponse>
    },
    async getAdminSummary(): Promise<ApiV1AdminSummaryResponse> {
      return request("/admin/summary", adminSummarySchema) as Promise<ApiV1AdminSummaryResponse>
    },
    async getReportsSummary(params?: { from?: string; to?: string }): Promise<ApiV1ReportsSummaryResponse> {
      const query = new URLSearchParams()
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/reports/summary${suffix}`, reportsSummarySchema) as Promise<ApiV1ReportsSummaryResponse>
    },
    async getAuditTrail(params?: { limit?: number; from?: string; to?: string }): Promise<ApiV1AuditTrailResponse> {
      const query = new URLSearchParams()
      if (typeof params?.limit === "number") query.set("limit", String(params.limit))
      if (params?.from) query.set("from", params.from)
      if (params?.to) query.set("to", params.to)
      const suffix = query.toString() ? `?${query.toString()}` : ""
      return request(`/audit/trail${suffix}`, auditTrailSchema) as Promise<ApiV1AuditTrailResponse>
    },
  }
}
