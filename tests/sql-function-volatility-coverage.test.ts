import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const SCRIPTS_DIR = path.join(process.cwd(), "scripts")
const TARGET_SCRIPTS = new Set([
  "068_security_workflow_integrity.sql",
  "073_queue_call_next_transactional_rpc.sql",
  "074_create_prescription_transactional_rpc.sql",
  "075_create_invoice_transactional_rpc.sql",
  "076_reconcile_insurance_batch_payment_rpc.sql",
  "077_mark_visit_invoice_paid_transactional_rpc.sql",
  "078_discharge_admission_transactional_rpc.sql",
  "079_create_admission_transactional_rpc.sql",
])

async function loadSqlFiles(): Promise<Array<{ name: string; content: string }>> {
  const entries = await fs.readdir(SCRIPTS_DIR, { withFileTypes: true })
  const sqlFiles = entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".sql") && TARGET_SCRIPTS.has(entry.name),
  )
  return await Promise.all(
    sqlFiles.map(async (file) => {
      const fullPath = path.join(SCRIPTS_DIR, file.name)
      return {
        name: file.name,
        content: await fs.readFile(fullPath, "utf8"),
      }
    }),
  )
}

describe("SQL function volatility coverage", () => {
  it("ensures transactional/security SQL functions explicitly declare volatility", async () => {
    const files = await loadSqlFiles()
    const violations: string[] = []

    for (const file of files) {
      const lowered = file.content.toLowerCase()
      let cursor = 0
      while (true) {
        const createIdx = lowered.indexOf("create or replace function", cursor)
        if (createIdx === -1) break
        const nextCreateIdx = lowered.indexOf("create or replace function", createIdx + 1)
        const block = lowered.slice(createIdx, nextCreateIdx === -1 ? lowered.length : nextCreateIdx)

        const hasVolatility =
          block.includes(" immutable ") ||
          block.includes("\nimmutable") ||
          block.includes(" stable ") ||
          block.includes("\nstable") ||
          block.includes(" volatile ") ||
          block.includes("\nvolatile")

        if (!hasVolatility) {
          const headerEnd = block.indexOf("as $$")
          const header = block.slice(0, headerEnd === -1 ? 280 : Math.min(headerEnd, 280)).replace(/\s+/g, " ").trim()
          violations.push(`${file.name}: function missing explicit volatility (${header.slice(0, 200)})`)
        }

        cursor = nextCreateIdx === -1 ? lowered.length : nextCreateIdx
      }
    }

    expect(violations).toEqual([])
  })
})
