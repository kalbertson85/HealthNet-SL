import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import { API_V1_CAPABILITIES } from "@/lib/api/v1"

const DOC_PATH = path.join(process.cwd(), "API_CONTRACT_V1.md")

const CAPABILITY_TO_ENDPOINT: Record<(typeof API_V1_CAPABILITIES)[number], string> = {
  "auth.session": "## `GET /api/v1/session`",
  "dashboard.summary": "## `GET /api/v1/dashboard/summary`",
  "visits.summary": "## `GET /api/v1/visits/summary`",
  "appointments.summary": "## `GET /api/v1/appointments/summary`",
  "prescriptions.summary": "## `GET /api/v1/prescriptions/summary`",
  "lab.summary": "## `GET /api/v1/lab/summary`",
  "radiology.summary": "## `GET /api/v1/radiology/summary`",
  "pharmacy.summary": "## `GET /api/v1/pharmacy/summary`",
  "queue.summary": "## `GET /api/v1/queue/summary`",
  "emergency.summary": "## `GET /api/v1/emergency/summary`",
  "inpatient.summary": "## `GET /api/v1/inpatient/summary`",
  "surgery.summary": "## `GET /api/v1/surgery/summary`",
  "nursing.summary": "## `GET /api/v1/nursing/summary`",
  "doctor.summary": "## `GET /api/v1/doctor/summary`",
  "triage.summary": "## `GET /api/v1/triage/summary`",
  "records.summary": "## `GET /api/v1/records/summary`",
  "notifications.summary": "## `GET /api/v1/notifications/summary`",
  "admin.summary": "## `GET /api/v1/admin/summary`",
  "reports.summary": "## `GET /api/v1/reports/summary`",
  "patients.workflow": "## `GET /api/v1/patients/workflow`",
  "billing.insurance": "## `GET /api/v1/billing/insurance`",
  "reports.company_billing": "## `GET /api/v1/reports/company-billing`",
  "audit.trail": "## `GET /api/v1/audit/trail`",
  "patients.summary": "## `GET /api/v1/patients/summary`",
  "billing.summary": "## `GET /api/v1/billing/summary`",
}

describe("api v1 contract doc parity", () => {
  it("documents every declared capability endpoint", async () => {
    const doc = await fs.readFile(DOC_PATH, "utf8")
    for (const capability of API_V1_CAPABILITIES) {
      const endpointHeader = CAPABILITY_TO_ENDPOINT[capability]
      expect(endpointHeader).toBeTruthy()
      expect(doc).toContain(endpointHeader)
    }
  })
})
