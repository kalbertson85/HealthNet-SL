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

describe("Export route security coverage", () => {
  it("ensures export routes enforce rate-limit, trusted origin, and permission checks", async () => {
    const files = await walk(EXPORT_API_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []

    for (const file of files) {
      const rel = path.relative(EXPORT_API_ROOT, file)
      const source = await fs.readFile(file, "utf8")

      if (!source.includes("enforceFixedWindowRateLimit(")) {
        violations.push(`${rel} is missing enforceFixedWindowRateLimit`)
      }
      if (!source.includes("enforceTrustedOriginOrReferer(")) {
        violations.push(`${rel} is missing enforceTrustedOriginOrReferer`)
      }
      if (!source.includes('requirePermission(request, "admin.export")')) {
        violations.push(`${rel} is missing requirePermission(request, "admin.export")`)
      }
      if (!source.includes("toAuthErrorResponse(")) {
        violations.push(`${rel} is missing toAuthErrorResponse error mapping`)
      }
      if (!source.includes("NO_STORE_DOWNLOAD_HEADERS")) {
        violations.push(`${rel} is missing NO_STORE_DOWNLOAD_HEADERS`)
      }
    }

    expect(violations).toEqual([])
  })
})

