import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const PRESCRIPTION_DETAIL_PAGE = path.join(process.cwd(), "app", "dashboard", "prescriptions", "[id]", "page.tsx")

describe("prescription status transactional rpc coverage", () => {
  it("uses transactional status RPC for in-progress and cancellation", async () => {
    const source = await fs.readFile(PRESCRIPTION_DETAIL_PAGE, "utf8")

    expect(source).toContain('supabase.rpc("update_prescription_status_transactional"')
    expect(source).toContain('p_new_status: "in_progress"')
    expect(source).toContain('p_new_status: "cancelled"')
    expect(source).not.toContain('.from("pharmacy_audit_logs").insert({')
  })
})
