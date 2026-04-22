import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const ADMIN_API_ROOT = path.join(process.cwd(), "app", "api", "admin")

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

describe("Admin route hardening coverage", () => {
  it("ensures admin APIs enforce admin role checks, rate limits, and auth error mapping", async () => {
    const files = await walk(ADMIN_API_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const file of files) {
      const rel = path.relative(ADMIN_API_ROOT, file)
      const source = await fs.readFile(file, "utf8")

      if (!source.includes("enforceFixedWindowRateLimit(")) {
        violations.push(`${rel} is missing enforceFixedWindowRateLimit`)
      }
      if (!source.includes("requireRole([ROLES.ADMIN])")) {
        violations.push(`${rel} is missing requireRole([ROLES.ADMIN])`)
      }
      if (!source.includes("toAuthErrorResponse(") && !source.includes("resolveAuthError(")) {
        violations.push(`${rel} is missing toAuthErrorResponse/resolveAuthError mapping`)
      }
    }

    expect(violations).toEqual([])
  })
})

