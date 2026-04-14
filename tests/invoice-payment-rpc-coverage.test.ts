import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const BILLING_INVOICE_PAGE = path.join(process.cwd(), "app", "dashboard", "billing", "[id]", "page.tsx")

describe("invoice payment transactional rpc coverage", () => {
  it("records invoice payments via transactional rpc", async () => {
    const source = await fs.readFile(BILLING_INVOICE_PAGE, "utf8")

    expect(source).toContain('supabase.rpc("record_invoice_payment_transactional"')
    expect(source).toContain("p_invoice_id: id")
    expect(source).toContain("p_payment_amount: paymentAmount")
    expect(source).toContain("p_payment_method: paymentMethod")
    expect(source).toContain("p_actor_user_id: user.id")
    expect(source).not.toContain('newPaidAmount >= Number(currentInvoice.total_amount) ? "paid" : newPaidAmount > 0 ? "partial" : "pending"')
  })
})
