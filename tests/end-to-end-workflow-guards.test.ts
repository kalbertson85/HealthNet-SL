import { describe, expect, it } from "vitest"
import {
  canCreateBillingForVisit,
  canCreatePrescriptionForVisit,
  canCreateVisitForPatient,
  canDispensePrescription,
} from "../lib/workflow-integrity"

describe("end-to-end workflow guard coverage", () => {
  it("blocks workflow entry when patient is missing", () => {
    expect(canCreateVisitForPatient({ patientExists: false })).toBe(false)
    expect(
      canCreatePrescriptionForVisit({
        patientExists: false,
        visitExists: true,
        visitStatus: "doctor_pending",
      }),
    ).toBe(false)
    expect(
      canCreateBillingForVisit({
        patientExists: false,
        visitExists: true,
        visitStatus: "billing_pending",
      }),
    ).toBe(false)
  })

  it("enforces active visit requirement before prescription and billing", () => {
    expect(
      canCreatePrescriptionForVisit({
        patientExists: true,
        visitExists: false,
        visitStatus: null,
      }),
    ).toBe(false)
    expect(
      canCreateBillingForVisit({
        patientExists: true,
        visitExists: false,
        visitStatus: null,
      }),
    ).toBe(false)
  })

  it("blocks prescription, billing, and dispensing once a visit is closed", () => {
    expect(
      canCreatePrescriptionForVisit({
        patientExists: true,
        visitExists: true,
        visitStatus: "completed",
      }),
    ).toBe(false)
    expect(
      canCreateBillingForVisit({
        patientExists: true,
        visitExists: true,
        visitStatus: "discharged",
      }),
    ).toBe(false)
    expect(
      canDispensePrescription({
        visitExists: true,
        visitStatus: "completed",
        prescriptionExists: true,
        prescriptionStatus: "ready",
      }),
    ).toBe(false)
  })

  it("allows valid in-progress flow and blocks closed prescriptions", () => {
    expect(
      canCreateVisitForPatient({
        patientExists: true,
      }),
    ).toBe(true)
    expect(
      canCreatePrescriptionForVisit({
        patientExists: true,
        visitExists: true,
        visitStatus: "doctor_pending",
      }),
    ).toBe(true)
    expect(
      canCreateBillingForVisit({
        patientExists: true,
        visitExists: true,
        visitStatus: "billing_pending",
      }),
    ).toBe(true)
    expect(
      canDispensePrescription({
        visitExists: true,
        visitStatus: "pharmacy_pending",
        prescriptionExists: true,
        prescriptionStatus: "ready",
      }),
    ).toBe(true)
    expect(
      canDispensePrescription({
        visitExists: true,
        visitStatus: "pharmacy_pending",
        prescriptionExists: true,
        prescriptionStatus: "dispensed",
      }),
    ).toBe(false)
  })
})
