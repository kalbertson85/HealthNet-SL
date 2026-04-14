import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const BILLING_VISIT_PAGE = path.join(process.cwd(), "app", "dashboard", "billing", "visit", "[id]", "page.tsx")

describe("billing visit transactional rpc coverage", () => {
  it("uses transactional mark-paid rpc without manual-write fallback", async () => {
    const source = await fs.readFile(BILLING_VISIT_PAGE, "utf8")

    expect(source).toContain('supabase.rpc("mark_visit_invoice_paid_transactional"')
    expect(source).toContain("p_next_visit_status: \"pharmacy_pending\"")
    expect(source).toContain("p_next_visit_status: \"completed\"")
    expect(source).toContain("rpcErrorCode === \"42883\"")
    expect(source).toContain("transactional_dependency_unavailable")
    expect(source).not.toContain(".from(\"visits\").update({ visit_status: \"pharmacy_pending\" })")
    expect(source).not.toContain(".from(\"visits\").update({ visit_status: \"completed\" })")
  })
})
