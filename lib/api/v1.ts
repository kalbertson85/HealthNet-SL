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
  "admin.summary",
  "reports.summary",
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

export type ApiV1AdminSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  admin: {
    total_staff_profiles: number
    active_staff_profiles: number
    blocked_staff_profiles: number
    total_facilities: number
    audit_events_24h: number
  }
  server_time_utc: string
}

export type ApiV1ReportsSummaryResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  reports: {
    monthly_revenue: number
    new_patients: number
    completed_visits: number
    pending_lab_tests: number
    source: "rpc" | "fallback"
  }
  server_time_utc: string
}

export type ApiV1AuditTrailResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  filters: {
    limit: number
    from: string | null
    to: string | null
  }
  audit: {
    events: Array<{
      id: string
      occurred_at: string
      action: string
      resource_type: string | null
      resource_id: string | null
      actor_user_id: string | null
      actor_role: string | null
      facility_id: string | null
    }>
  }
  server_time_utc: string
}

export type ApiV1ReportsCompanyBillingResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  company_billing: {
    companies: Array<{
      company_id: string
      company_name: string
      outstanding: number
    }>
    source: "rpc" | "fallback"
  }
  server_time_utc: string
}

export type ApiV1BillingInsuranceResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  billing_insurance: {
    totals: {
      total_batches: number
      draft_batches: number
      submitted_batches: number
      paid_batches: number
      total_amount: number
      paid_amount: number
      outstanding_amount: number
    }
    recent_batches: Array<{
      id: string
      batch_number: string
      company_id: string | null
      company_name: string | null
      status: string
      total_amount: number
      paid_amount: number
      created_at: string
    }>
  }
  server_time_utc: string
}

export type ApiV1PatientsWorkflowResponse = {
  ok: true
  api: { version: typeof API_V1_VERSION }
  range: { from: string; to: string }
  workflow: {
    registered_patients: number
    triaged_patients: number
    queued_patients: number
    doctor_stage_visits: number
    diagnostics_orders: number
    prescriptions_created: number
    pharmacy_stage_visits: number
    billed_invoices: number
    admissions_created: number
    discharged_or_completed_visits: number
  }
  server_time_utc: string
}
