import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import { API_V1_CAPABILITIES } from "@/lib/api/v1"

type CapabilityMap = Record<
  (typeof API_V1_CAPABILITIES)[number],
  {
    routePath: string
    clientMethod: string
  }
>

const CAPABILITY_MAP: CapabilityMap = {
  "auth.session": {
    routePath: path.join("app", "api", "v1", "session", "route.ts"),
    clientMethod: "getSession",
  },
  "dashboard.summary": {
    routePath: path.join("app", "api", "v1", "dashboard", "summary", "route.ts"),
    clientMethod: "getDashboardSummary",
  },
  "visits.summary": {
    routePath: path.join("app", "api", "v1", "visits", "summary", "route.ts"),
    clientMethod: "getVisitsSummary",
  },
  "appointments.summary": {
    routePath: path.join("app", "api", "v1", "appointments", "summary", "route.ts"),
    clientMethod: "getAppointmentsSummary",
  },
  "prescriptions.summary": {
    routePath: path.join("app", "api", "v1", "prescriptions", "summary", "route.ts"),
    clientMethod: "getPrescriptionsSummary",
  },
  "lab.summary": {
    routePath: path.join("app", "api", "v1", "lab", "summary", "route.ts"),
    clientMethod: "getLabSummary",
  },
  "radiology.summary": {
    routePath: path.join("app", "api", "v1", "radiology", "summary", "route.ts"),
    clientMethod: "getRadiologySummary",
  },
  "pharmacy.summary": {
    routePath: path.join("app", "api", "v1", "pharmacy", "summary", "route.ts"),
    clientMethod: "getPharmacySummary",
  },
  "queue.summary": {
    routePath: path.join("app", "api", "v1", "queue", "summary", "route.ts"),
    clientMethod: "getQueueSummary",
  },
  "emergency.summary": {
    routePath: path.join("app", "api", "v1", "emergency", "summary", "route.ts"),
    clientMethod: "getEmergencySummary",
  },
  "inpatient.summary": {
    routePath: path.join("app", "api", "v1", "inpatient", "summary", "route.ts"),
    clientMethod: "getInpatientSummary",
  },
  "surgery.summary": {
    routePath: path.join("app", "api", "v1", "surgery", "summary", "route.ts"),
    clientMethod: "getSurgerySummary",
  },
  "nursing.summary": {
    routePath: path.join("app", "api", "v1", "nursing", "summary", "route.ts"),
    clientMethod: "getNursingSummary",
  },
  "doctor.summary": {
    routePath: path.join("app", "api", "v1", "doctor", "summary", "route.ts"),
    clientMethod: "getDoctorSummary",
  },
  "triage.summary": {
    routePath: path.join("app", "api", "v1", "triage", "summary", "route.ts"),
    clientMethod: "getTriageSummary",
  },
  "records.summary": {
    routePath: path.join("app", "api", "v1", "records", "summary", "route.ts"),
    clientMethod: "getRecordsSummary",
  },
  "notifications.summary": {
    routePath: path.join("app", "api", "v1", "notifications", "summary", "route.ts"),
    clientMethod: "getNotificationsSummary",
  },
  "admin.summary": {
    routePath: path.join("app", "api", "v1", "admin", "summary", "route.ts"),
    clientMethod: "getAdminSummary",
  },
  "reports.summary": {
    routePath: path.join("app", "api", "v1", "reports", "summary", "route.ts"),
    clientMethod: "getReportsSummary",
  },
  "patients.workflow": {
    routePath: path.join("app", "api", "v1", "patients", "workflow", "route.ts"),
    clientMethod: "getPatientsWorkflow",
  },
  "billing.insurance": {
    routePath: path.join("app", "api", "v1", "billing", "insurance", "route.ts"),
    clientMethod: "getBillingInsurance",
  },
  "reports.company_billing": {
    routePath: path.join("app", "api", "v1", "reports", "company-billing", "route.ts"),
    clientMethod: "getReportsCompanyBilling",
  },
  "audit.trail": {
    routePath: path.join("app", "api", "v1", "audit", "trail", "route.ts"),
    clientMethod: "getAuditTrail",
  },
  "patients.summary": {
    routePath: path.join("app", "api", "v1", "patients", "summary", "route.ts"),
    clientMethod: "getPatientsSummary",
  },
  "billing.summary": {
    routePath: path.join("app", "api", "v1", "billing", "summary", "route.ts"),
    clientMethod: "getBillingSummary",
  },
}

describe("api v1 capability parity", () => {
  it("maps every declared capability to a route and client method", async () => {
    const capabilities = [...API_V1_CAPABILITIES]
    expect(Object.keys(CAPABILITY_MAP).sort()).toEqual([...capabilities].sort())

    const clientPath = path.join(process.cwd(), "lib", "api", "v1-client.ts")
    const clientSource = await fs.readFile(clientPath, "utf8")

    for (const capability of capabilities) {
      const entry = CAPABILITY_MAP[capability]
      const absoluteRoutePath = path.join(process.cwd(), entry.routePath)
      await expect(fs.access(absoluteRoutePath)).resolves.toBeUndefined()
      expect(clientSource).toContain(`async ${entry.clientMethod}(`)
    }
  })
})
