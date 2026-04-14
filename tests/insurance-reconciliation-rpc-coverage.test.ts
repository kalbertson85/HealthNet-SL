import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const FILE = path.join(process.cwd(), "app", "dashboard", "billing", "insurance", "reconciliation", "page.tsx")

describe("insurance reconciliation transaction coverage", () => {
  it("uses transactional reconciliation rpc without manual-write fallback", async () => {
    const source = await fs.readFile(FILE, "utf8")
    expect(source).toContain('"reconcile_insurance_batch_payment"')
    expect(source).toContain("transactional_dependency_unavailable")
    expect(source).toContain("error=reconciliation_failed")
    expect(source).not.toContain('.from("insurance_payments").insert(')
    expect(source).not.toContain('.from("insurance_billing_batches").update(')
  })
})
