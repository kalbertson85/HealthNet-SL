import { describe, it, expect } from "vitest"
import { canTransitionVisitStatus, assertVisitTransition, type VisitStatus } from "../lib/visits"

describe("visit status transitions", () => {
  const allowed: Array<[VisitStatus, VisitStatus]> = [
    ["doctor_pending", "lab_pending"],
    ["doctor_pending", "billing_pending"],
    ["lab_pending", "doctor_review"],
    ["doctor_review", "billing_pending"],
    ["billing_pending", "pharmacy_pending"],
    ["pharmacy_pending", "completed"],
  ]

  it("allows the configured transitions", () => {
    for (const [from, to] of allowed) {
      expect(canTransitionVisitStatus(from, to)).toBe(true)
      expect(() => assertVisitTransition(from, to)).not.toThrow()
    }
  })

  it("rejects clearly invalid transitions", () => {
    const invalid: Array<[VisitStatus, VisitStatus]> = [
      ["lab_pending", "billing_pending"],
      ["billing_pending", "doctor_pending"],
      ["completed", "doctor_pending"],
    ]

    for (const [from, to] of invalid) {
      expect(canTransitionVisitStatus(from, to)).toBe(false)
      expect(() => assertVisitTransition(from, to)).toThrow()
    }
  })

  it("supports a full happy-path flow from doctor_pending to completed", () => {
    const flow: VisitStatus[] = [
      "doctor_pending",
      "lab_pending",
      "doctor_review",
      "billing_pending",
      "pharmacy_pending",
      "completed",
    ]

    for (let i = 0; i < flow.length - 1; i++) {
      const from = flow[i]
      const to = flow[i + 1]
      expect(canTransitionVisitStatus(from, to)).toBe(true)
      expect(() => assertVisitTransition(from, to)).not.toThrow()
    }
  })

  it("does not allow skipping intermediate stages", () => {
    // e.g. cannot jump directly from doctor_pending to doctor_review
    expect(canTransitionVisitStatus("doctor_pending", "doctor_review")).toBe(false)
    expect(() => assertVisitTransition("doctor_pending", "doctor_review")).toThrow()
  })
})
