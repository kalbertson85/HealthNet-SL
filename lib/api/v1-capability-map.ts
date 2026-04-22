import { API_V1_CAPABILITIES } from "@/lib/api/v1"

export type ApiV1Capability = (typeof API_V1_CAPABILITIES)[number]

export type ApiV1CapabilityMapEntry = {
  capability: ApiV1Capability
  routePath: string
  clientMethod: string
  docHeader: string
}

export const API_V1_CAPABILITY_MAP: ApiV1CapabilityMapEntry[] = [
  {
    capability: "auth.session",
    routePath: "app/api/v1/session/route.ts",
    clientMethod: "getSession",
    docHeader: "## `GET /api/v1/session`",
  },
  {
    capability: "dashboard.summary",
    routePath: "app/api/v1/dashboard/summary/route.ts",
    clientMethod: "getDashboardSummary",
    docHeader: "## `GET /api/v1/dashboard/summary`",
  },
  {
    capability: "visits.summary",
    routePath: "app/api/v1/visits/summary/route.ts",
    clientMethod: "getVisitsSummary",
    docHeader: "## `GET /api/v1/visits/summary`",
  },
  {
    capability: "appointments.summary",
    routePath: "app/api/v1/appointments/summary/route.ts",
    clientMethod: "getAppointmentsSummary",
    docHeader: "## `GET /api/v1/appointments/summary`",
  },
  {
    capability: "prescriptions.summary",
    routePath: "app/api/v1/prescriptions/summary/route.ts",
    clientMethod: "getPrescriptionsSummary",
    docHeader: "## `GET /api/v1/prescriptions/summary`",
  },
  {
    capability: "lab.summary",
    routePath: "app/api/v1/lab/summary/route.ts",
    clientMethod: "getLabSummary",
    docHeader: "## `GET /api/v1/lab/summary`",
  },
  {
    capability: "radiology.summary",
    routePath: "app/api/v1/radiology/summary/route.ts",
    clientMethod: "getRadiologySummary",
    docHeader: "## `GET /api/v1/radiology/summary`",
  },
  {
    capability: "pharmacy.summary",
    routePath: "app/api/v1/pharmacy/summary/route.ts",
    clientMethod: "getPharmacySummary",
    docHeader: "## `GET /api/v1/pharmacy/summary`",
  },
  {
    capability: "queue.summary",
    routePath: "app/api/v1/queue/summary/route.ts",
    clientMethod: "getQueueSummary",
    docHeader: "## `GET /api/v1/queue/summary`",
  },
  {
    capability: "emergency.summary",
    routePath: "app/api/v1/emergency/summary/route.ts",
    clientMethod: "getEmergencySummary",
    docHeader: "## `GET /api/v1/emergency/summary`",
  },
  {
    capability: "inpatient.summary",
    routePath: "app/api/v1/inpatient/summary/route.ts",
    clientMethod: "getInpatientSummary",
    docHeader: "## `GET /api/v1/inpatient/summary`",
  },
  {
    capability: "surgery.summary",
    routePath: "app/api/v1/surgery/summary/route.ts",
    clientMethod: "getSurgerySummary",
    docHeader: "## `GET /api/v1/surgery/summary`",
  },
  {
    capability: "nursing.summary",
    routePath: "app/api/v1/nursing/summary/route.ts",
    clientMethod: "getNursingSummary",
    docHeader: "## `GET /api/v1/nursing/summary`",
  },
  {
    capability: "doctor.summary",
    routePath: "app/api/v1/doctor/summary/route.ts",
    clientMethod: "getDoctorSummary",
    docHeader: "## `GET /api/v1/doctor/summary`",
  },
  {
    capability: "triage.summary",
    routePath: "app/api/v1/triage/summary/route.ts",
    clientMethod: "getTriageSummary",
    docHeader: "## `GET /api/v1/triage/summary`",
  },
  {
    capability: "records.summary",
    routePath: "app/api/v1/records/summary/route.ts",
    clientMethod: "getRecordsSummary",
    docHeader: "## `GET /api/v1/records/summary`",
  },
  {
    capability: "notifications.summary",
    routePath: "app/api/v1/notifications/summary/route.ts",
    clientMethod: "getNotificationsSummary",
    docHeader: "## `GET /api/v1/notifications/summary`",
  },
  {
    capability: "admin.summary",
    routePath: "app/api/v1/admin/summary/route.ts",
    clientMethod: "getAdminSummary",
    docHeader: "## `GET /api/v1/admin/summary`",
  },
  {
    capability: "reports.summary",
    routePath: "app/api/v1/reports/summary/route.ts",
    clientMethod: "getReportsSummary",
    docHeader: "## `GET /api/v1/reports/summary`",
  },
  {
    capability: "patients.workflow",
    routePath: "app/api/v1/patients/workflow/route.ts",
    clientMethod: "getPatientsWorkflow",
    docHeader: "## `GET /api/v1/patients/workflow`",
  },
  {
    capability: "billing.insurance",
    routePath: "app/api/v1/billing/insurance/route.ts",
    clientMethod: "getBillingInsurance",
    docHeader: "## `GET /api/v1/billing/insurance`",
  },
  {
    capability: "reports.company_billing",
    routePath: "app/api/v1/reports/company-billing/route.ts",
    clientMethod: "getReportsCompanyBilling",
    docHeader: "## `GET /api/v1/reports/company-billing`",
  },
  {
    capability: "audit.trail",
    routePath: "app/api/v1/audit/trail/route.ts",
    clientMethod: "getAuditTrail",
    docHeader: "## `GET /api/v1/audit/trail`",
  },
  {
    capability: "patients.summary",
    routePath: "app/api/v1/patients/summary/route.ts",
    clientMethod: "getPatientsSummary",
    docHeader: "## `GET /api/v1/patients/summary`",
  },
  {
    capability: "billing.summary",
    routePath: "app/api/v1/billing/summary/route.ts",
    clientMethod: "getBillingSummary",
    docHeader: "## `GET /api/v1/billing/summary`",
  },
]
