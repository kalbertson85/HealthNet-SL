import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const SCRIPTS_DIR = path.join(process.cwd(), "scripts")

const CRITICAL_TABLES = [
  "patients",
  "visits",
  "invoices",
  "prescriptions",
  "facilities",
  "insurance_billing_batches",
  "insurance_billing_batch_items",
  "audit_logs",
]

async function loadSqlCorpus(): Promise<string> {
  const entries = await fs.readdir(SCRIPTS_DIR, { withFileTypes: true })
  const sqlFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  const chunks = await Promise.all(
    sqlFiles.map(async (file) => {
      const fullPath = path.join(SCRIPTS_DIR, file.name)
      return await fs.readFile(fullPath, "utf8")
    }),
  )
  return chunks.join("\n").toLowerCase()
}

describe("RLS critical table coverage", () => {
  it("ensures SQL scripts include RLS enablement for critical tables", async () => {
    const sql = await loadSqlCorpus()
    const violations: string[] = []

    for (const table of CRITICAL_TABLES) {
      const enableRlsToken = `alter table public.${table} enable row level security`
      if (!sql.includes(enableRlsToken)) {
        violations.push(`Missing RLS enable statement for public.${table}`)
      }
    }

    expect(violations).toEqual([])
  })
})

