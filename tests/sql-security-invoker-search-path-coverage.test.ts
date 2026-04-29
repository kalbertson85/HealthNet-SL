import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const SCRIPTS_DIR = path.join(process.cwd(), "scripts")

async function loadSqlFiles(): Promise<Array<{ name: string; content: string }>> {
  const entries = await fs.readdir(SCRIPTS_DIR, { withFileTypes: true })
  const sqlFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
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

describe("SQL SECURITY INVOKER search_path coverage", () => {
  it("ensures SECURITY INVOKER functions specify explicit SET search_path", async () => {
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

        const isSecurityInvoker = block.includes("security invoker")
        if (isSecurityInvoker && !block.includes("set search_path")) {
          const headerEnd = block.indexOf("as $$")
          const header = block.slice(0, headerEnd === -1 ? 240 : Math.min(headerEnd, 240)).replace(/\s+/g, " ").trim()
          violations.push(`${file.name}: SECURITY INVOKER function missing SET search_path (${header.slice(0, 180)})`)
        }
        cursor = nextCreateIdx === -1 ? lowered.length : nextCreateIdx
      }
    }

    expect(violations).toEqual([])
  })
})

