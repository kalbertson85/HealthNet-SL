import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const BILLING_ROUTE = path.join(process.cwd(), "app", "api", "billing", "invoices", "route.ts")
const PRESCRIPTIONS_ROUTE = path.join(process.cwd(), "app", "api", "prescriptions", "route.ts")

describe("workflow dependency coverage for mutation routes", () => {
  it("enforces visit/patient linkage and closed-visit guards in billing invoice creation", async () => {
    const source = await fs.readFile(BILLING_ROUTE, "utf8")

    expect(source).toContain("doesVisitBelongToPatient(")
    expect(source).toContain("isVisitTerminal(")
    expect(source).toContain("visit_patient_mismatch")
    expect(source).toContain("visit_closed")
    expect(source).toContain("patient_facility_mismatch")
    expect(source).toContain("visit_facility_mismatch")
  })

  it("enforces visit/patient linkage and closed-visit guards in prescription creation", async () => {
    const source = await fs.readFile(PRESCRIPTIONS_ROUTE, "utf8")

    expect(source).toContain("doesVisitBelongToPatient(")
    expect(source).toContain("isVisitTerminal(")
    expect(source).toContain("visit_patient_mismatch")
    expect(source).toContain("visit_closed")
    expect(source).toContain("patient_facility_mismatch")
    expect(source).toContain("visit_facility_mismatch")
  })
})
