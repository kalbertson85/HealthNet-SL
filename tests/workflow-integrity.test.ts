import { describe, expect, it } from "vitest"
import {
  doesVisitBelongToPatient,
  isCrossFacilityAccessDenied,
  isVisitTerminal,
  normalizeVisitStatus,
} from "../lib/workflow-integrity"

describe("workflow integrity guards", () => {
  it("normalizes visit statuses consistently", () => {
    expect(normalizeVisitStatus("  COMPLETED ")).toBe("completed")
    expect(normalizeVisitStatus(null)).toBe("")
  })

  it("flags terminal visit statuses", () => {
    expect(isVisitTerminal("completed")).toBe(true)
    expect(isVisitTerminal("discharged")).toBe(true)
    expect(isVisitTerminal("billing_pending")).toBe(false)
  })

  it("enforces facility boundaries for non-admin users", () => {
    expect(
      isCrossFacilityAccessDenied({
        userRole: "doctor",
        userFacilityId: "facility-a",
        resourceFacilityId: "facility-b",
      }),
    ).toBe(true)

    expect(
      isCrossFacilityAccessDenied({
        userRole: "admin",
        userFacilityId: "facility-a",
        resourceFacilityId: "facility-b",
      }),
    ).toBe(false)

    expect(
      isCrossFacilityAccessDenied({
        userRole: "doctor",
        userFacilityId: "facility-a",
        resourceFacilityId: "facility-a",
      }),
    ).toBe(false)
  })

  it("verifies patient-to-visit linkage", () => {
    expect(doesVisitBelongToPatient({ visitPatientId: "p-1", patientId: "p-1" })).toBe(true)
    expect(doesVisitBelongToPatient({ visitPatientId: "p-1", patientId: "p-2" })).toBe(false)
    expect(doesVisitBelongToPatient({ visitPatientId: null, patientId: "p-2" })).toBe(false)
  })
})
