export const API_V1_VERSION = "v1"
export const API_V1_RELEASE_CHANNEL = "beta"

export const API_V1_CAPABILITIES = [
  "auth.session",
  "dashboard.summary",
  "visits.summary",
  "appointments.summary",
  "prescriptions.summary",
  "lab.summary",
  "radiology.summary",
  "pharmacy.summary",
  "queue.summary",
  "emergency.summary",
  "inpatient.summary",
  "surgery.summary",
  "nursing.summary",
  "doctor.summary",
  "triage.summary",
  "records.summary",
  "notifications.summary",
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

export type ApiV1RadiologySummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  radiology: {
    total_in_range: number
    pending: number
    scheduled: number
    completed: number
    cancelled: number
  }
  server_time_utc: string
}

export type ApiV1PharmacySummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  pharmacy: {
    pending_prescriptions: number
    low_stock_items: number
    expiring_soon_items: number
    expired_items: number
  }
  server_time_utc: string
}

export type ApiV1QueueSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  queue: {
    total_in_range: number
    waiting: number
    in_progress: number
    completed: number
    cancelled: number
  }
  server_time_utc: string
}

export type ApiV1EmergencySummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  emergency: {
    total_in_range: number
    pending: number
    in_treatment: number
    admitted: number
    discharged_or_transferred: number
    critical_or_emergency: number
  }
  server_time_utc: string
}

export type ApiV1InpatientSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  inpatient: {
    total_in_range: number
    admitted_or_active: number
    discharged: number
    other: number
  }
  server_time_utc: string
}

export type ApiV1SurgerySummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  surgery: {
    total_in_range: number
    scheduled_or_pending: number
    in_progress: number
    completed: number
    other: number
  }
  server_time_utc: string
}

export type ApiV1NursingSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  nursing: {
    active_visits: number
    notes_in_range: number
    pending_ward_requests_in_range: number
  }
  server_time_utc: string
}

export type ApiV1DoctorSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  doctor: {
    total_open_cases: number
    doctor_pending: number
    doctor_review: number
    lab_pending: number
  }
  server_time_utc: string
}

export type ApiV1TriageSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  triage: {
    total_in_range: number
    pending: number
    in_treatment: number
    critical_or_emergency: number
    red: number
    orange: number
  }
  server_time_utc: string
}

export type ApiV1RecordsSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  records: {
    total_in_range: number
    active: number
    completed: number
    discharged: number
  }
  server_time_utc: string
}

export type ApiV1NotificationsSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  notifications: {
    total: number
    unread: number
    live_alerts: number
  }
  server_time_utc: string
}
