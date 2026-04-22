import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const EXPORT_API_ROOT = path.join(process.cwd(), "app", "api", "export")

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)))
      continue
    }
    if (entry.isFile() && entry.name === "route.ts") {
      files.push(fullPath)
    }
  }
  return files
}

describe("Export route bounds coverage", () => {
  it("ensures export routes remain bounded and disclose truncation metadata", async () => {
    const files = await walk(EXPORT_API_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []

    for (const file of files) {
      const rel = path.relative(EXPORT_API_ROOT, file)
      const source = await fs.readFile(file, "utf8")

      const hasLimitConst =
        source.includes("EXPORT_ROW_LIMIT") || source.includes("EXPORT_TABLE_LIMIT")
      if (!hasLimitConst) {
        violations.push(`${rel} is missing export row/table limit constant`)
      }

      const hasBoundedQuery =
        source.includes(".limit(EXPORT_ROW_LIMIT + 1)") ||
        source.includes(".limit(EXPORT_TABLE_LIMIT + 1)")
      if (!hasBoundedQuery) {
        violations.push(`${rel} is missing bounded query limit(+1) pattern`)
      }

      if (!source.includes("X-Export-Row-Limit")) {
        violations.push(`${rel} is missing X-Export-Row-Limit header`)
      }
      if (!source.includes("X-Export-Truncated")) {
        violations.push(`${rel} is missing X-Export-Truncated header`)
      }
    }

    expect(violations).toEqual([])
  })
})

