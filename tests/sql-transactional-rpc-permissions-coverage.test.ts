import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const SCRIPTS_DIR = path.join(process.cwd(), "scripts")
const TARGET_SCRIPTS = [
  "073_queue_call_next_transactional_rpc.sql",
  "074_create_prescription_transactional_rpc.sql",
  "075_create_invoice_transactional_rpc.sql",
  "076_reconcile_insurance_batch_payment_rpc.sql",
  "077_mark_visit_invoice_paid_transactional_rpc.sql",
  "078_discharge_admission_transactional_rpc.sql",
  "079_create_admission_transactional_rpc.sql",
]

async function readScript(name: string): Promise<string> {
  const content = await fs.readFile(path.join(SCRIPTS_DIR, name), "utf8")
  return content.toLowerCase()
}

describe("SQL transactional RPC permissions coverage", () => {
  it("enforces revoke-public and explicit execute grants on transactional RPC functions", async () => {
    const violations: string[] = []

    for (const scriptName of TARGET_SCRIPTS) {
      const sql = await readScript(scriptName)

      if (!sql.includes("create or replace function public.")) {
        violations.push(`${scriptName}: missing function definition`)
      }
      if (!sql.includes("revoke all on function public.")) {
        violations.push(`${scriptName}: missing REVOKE ALL ... FROM PUBLIC`)
      }
      if (!sql.includes("from public;")) {
        violations.push(`${scriptName}: missing explicit FROM PUBLIC on revoke`)
      }
      if (!sql.includes("grant execute on function public.")) {
        violations.push(`${scriptName}: missing GRANT EXECUTE`)
      }
      if (!sql.includes("to authenticated;")) {
        violations.push(`${scriptName}: missing grant to authenticated`)
      }
      if (!sql.includes("to service_role;")) {
        violations.push(`${scriptName}: missing grant to service_role`)
      }
    }

    expect(violations).toEqual([])
  })
})

