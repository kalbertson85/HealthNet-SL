import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const INPATIENT_NEW_PAGE = path.join(process.cwd(), "app", "dashboard", "inpatient", "new", "page.tsx")

describe("inpatient admission transactional rpc coverage", () => {
  it("uses create admission transactional rpc without manual-write fallback", async () => {
    const source = await fs.readFile(INPATIENT_NEW_PAGE, "utf8")

    expect(source).toContain('supabase.rpc("create_admission_transactional"')
    expect(source).toContain("p_patient_id: patientId")
    expect(source).toContain("p_bed_id: bedId")
    expect(source).toContain("p_visit_id: visitId")
    expect(source).toContain("rpcErrorCode === \"42883\"")
    expect(source).toContain("transactional_dependency_unavailable")
    expect(source).toContain("rollbackAdmissionCreation")
    expect(source).not.toContain("from(\"admissions\").insert(")
    expect(source).toContain("action: \"inpatient.admission_created\"")
  })
})
