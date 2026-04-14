import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const PRESCRIPTION_DETAIL_PAGE = path.join(process.cwd(), "app", "dashboard", "prescriptions", "[id]", "page.tsx")

describe("prescription dispense transactional rpc coverage", () => {
  it("uses transactional dispense rpc without manual stock rollback path", async () => {
    const source = await fs.readFile(PRESCRIPTION_DETAIL_PAGE, "utf8")

    expect(source).toContain('supabase.rpc("dispense_prescription_transactional"')
    expect(source).toContain("p_prescription_id: id")
    expect(source).toContain("p_actor_user_id: user.id")
    expect(source).toContain("transactional_dependency_unavailable")
    expect(source).not.toContain("rollbackDispenseSideEffects")
    expect(source).not.toContain('.from("medication_stock").update({ quantity_on_hand')
    expect(source).not.toContain('.from("dispense_events").insert({')
  })
})
