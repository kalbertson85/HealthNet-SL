import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const INPATIENT_PAGE = path.join(process.cwd(), "app", "dashboard", "inpatient", "[id]", "page.tsx")

describe("inpatient discharge transactional rpc coverage", () => {
  it("uses discharge transactional rpc without non-atomic fallback writes", async () => {
    const source = await fs.readFile(INPATIENT_PAGE, "utf8")

    expect(source).toContain('supabase.rpc("discharge_admission_transactional"')
    expect(source).toContain("p_discharge_summary: dischargeSummary")
    expect(source).toContain("p_discharge_instructions: dischargeInstructions")
    expect(source).toContain("rpcErrorCode === \"42883\"")
    expect(source).not.toContain("discharge_mode: \"fallback\"")
    expect(source).not.toContain("wardUpdateError")
    expect(source).not.toContain("bedUpdateError")
    expect(source).toContain("action: \"inpatient.discharge_completed\"")
  })
})
