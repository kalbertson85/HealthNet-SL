import { z } from "zod"
import type {
  ApiV1AppointmentsSummaryResponse,
  ApiV1DashboardSummaryResponse,
  ApiV1BillingSummaryResponse,
  ApiV1MetaResponse,
  ApiV1PatientsSummaryResponse,
  ApiV1PrescriptionsSummaryResponse,
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
  }
}
