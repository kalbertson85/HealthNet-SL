import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const BILLING_INVOICE_PAGE = path.join(process.cwd(), "app", "dashboard", "billing", "[id]", "page.tsx")

describe("invoice claim status transactional rpc coverage", () => {
  it("updates claim status via transactional rpc without manual rollback branches", async () => {
    const source = await fs.readFile(BILLING_INVOICE_PAGE, "utf8")

    expect(source).toContain('supabase.rpc("update_invoice_claim_status_transactional"')
    expect(source).toContain("p_invoice_id: invoiceId")
    expect(source).toContain("p_new_status: newStatus")
    expect(source).toContain("p_actor_user_id: user.id")
    expect(source).not.toContain("insertedClaimIds")
    expect(source).not.toContain("invoiceClaimUpdateError")
    expect(source).not.toContain("billingAuditError")
  })
})
