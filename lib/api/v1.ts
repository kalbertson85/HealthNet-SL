export const API_V1_VERSION = "v1"
export const API_V1_RELEASE_CHANNEL = "beta"

export const API_V1_CAPABILITIES = [
  "auth.session",
  "dashboard.summary",
  "visits.summary",
  "appointments.summary",
  "prescriptions.summary",
  "lab.summary",
  "patients.workflow",
  "billing.insurance",
  "reports.company_billing",
  "audit.trail",
  "patients.summary",
  "billing.summary",
] as const

export type ApiV1MetaResponse = {
  ok: true
  api: {
    version: typeof API_V1_VERSION
    release_channel: typeof API_V1_RELEASE_CHANNEL
    capabilities: readonly string[]
  }
  app: {
    name: string
    platforms: string[]
  }
  server_time_utc: string
}

export type ApiV1SessionResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  session: {
    user_id: string
    role: string | null
    facility_id: string | null
    permissions: string[]
  }
  server_time_utc: string
}

export type ApiV1PatientsSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  patients: {
    total: number
    created_in_range: number
  }
  server_time_utc: string
}

export type ApiV1BillingSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  billing: {
    invoice_count: number
    total_amount: number
    paid_amount: number
    outstanding_balance: number
    open_invoice_count: number
  }
  server_time_utc: string
}

export type ApiV1DashboardSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  dashboard: {
    patients_total: number
    visits_active: number
    invoices_open: number
    invoices_open_balance: number
  }
  server_time_utc: string
}

export type ApiV1VisitsSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  visits: {
    total_in_range: number
    active: number
    pending: number
    completed_or_discharged: number
  }
  server_time_utc: string
}

export type ApiV1AppointmentsSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  appointments: {
    total_in_range: number
    scheduled_or_confirmed: number
    completed: number
    cancelled: number
  }
  server_time_utc: string
}

export type ApiV1PrescriptionsSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  prescriptions: {
    total_in_range: number
    pending: number
    dispensed: number
    other: number
  }
  server_time_utc: string
}

export type ApiV1LabSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  lab: {
    total_in_range: number
    pending: number
    in_progress: number
    completed: number
    cancelled: number
  }
  server_time_utc: string
}
