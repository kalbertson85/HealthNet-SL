import { describe, expect, it } from "vitest"
import { PATIENT_FLOW_MODULES, buildFollowUpAppointmentHref, getPatientFlowActions, type PatientFlowStage } from "../lib/patient-flow"

describe("patient flow mapping", () => {
  it("covers all core workflow modules from registration to extended care", () => {
    const labels = new Set(PATIENT_FLOW_MODULES.map((module) => module.label))
    const expected = [
      "Patients",
      "Triage",
      "Appointments",
      "Queue",
      "Doctor",
      "Lab Tests",
      "Radiology",
      "Prescriptions",
      "Pharmacy",
      "Billing",
      "Inpatient",
      "Surgery",
      "Nursing",
      "Emergency",
    ]

    for (const label of expected) {
      expect(labels.has(label), `missing workflow module: ${label}`).toBe(true)
    }
  })

  it("provides actionable next steps for every workflow stage", () => {
    const stages: PatientFlowStage[] = [
      "registration",
      "triage",
      "queue",
      "doctor",
      "diagnostics",
      "prescriptions",
      "pharmacy",
      "billing",
      "extended-care",
      "discharge",
      "follow-up",
    ]

    for (const stage of stages) {
      const actions = getPatientFlowActions(stage, "visit-1", "patient-1", "admission-1")
      expect(actions.length, `no next-step actions for stage: ${stage}`).toBeGreaterThan(0)
      for (const action of actions) {
        expect(action.label.length).toBeGreaterThan(0)
        expect(action.href.startsWith("/dashboard/")).toBe(true)
        expect(action.description.length).toBeGreaterThan(0)
      }
    }
  })

  it("builds follow-up links with stable query composition", () => {
    const href = buildFollowUpAppointmentHref({
      patientId: "patient-1",
      source: "inpatient_discharge",
      reason: "Post-discharge follow-up",
      visitId: "visit-1",
      admissionId: "admission-1",
      notes: "Review in two weeks",
    })

    expect(href).toContain("/dashboard/appointments/new?")
    expect(href).toContain("patient_id=patient-1")
    expect(href).toContain("source=inpatient_discharge")
    expect(href).toContain("reason=Post-discharge+follow-up")
    expect(href).toContain("visit_id=visit-1")
    expect(href).toContain("admission_id=admission-1")
    expect(href).toContain("notes=Review+in+two+weeks")
  })
})
