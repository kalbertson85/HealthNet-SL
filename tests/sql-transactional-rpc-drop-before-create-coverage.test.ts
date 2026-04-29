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
  return (await fs.readFile(path.join(SCRIPTS_DIR, name), "utf8")).toLowerCase()
}

describe("SQL transactional RPC drop-before-create coverage", () => {
  it("ensures each transactional RPC script drops the function signature before recreate", async () => {
    const violations: string[] = []

    for (const scriptName of TARGET_SCRIPTS) {
      const sql = await readScript(scriptName)

      if (!sql.includes("create or replace function public.")) {
        violations.push(`${scriptName}: missing CREATE OR REPLACE FUNCTION`)
      }

      if (!sql.includes("drop function if exists public.")) {
        violations.push(`${scriptName}: missing DROP FUNCTION IF EXISTS public....`)
      }
    }

    expect(violations).toEqual([])
  })
})

