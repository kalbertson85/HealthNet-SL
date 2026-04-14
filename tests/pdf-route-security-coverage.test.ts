import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const API_ROOT = path.join(process.cwd(), "app", "api")

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)))
      continue
    }
    if (entry.isFile() && fullPath.endsWith(path.join("pdf", "route.ts"))) {
      files.push(fullPath)
    }
  }

  return files
}

describe("PDF route security coverage", () => {
  it("ensures all PDF routes enforce role auth and facility access", async () => {
    const files = await walk(API_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []

    for (const file of files) {
      const rel = path.relative(API_ROOT, file)
      const source = await fs.readFile(file, "utf8")

      if (!source.includes("requireRole(")) {
        violations.push(`${rel} is missing requireRole guard`)
      }

      if (!source.includes("requireFacilityAccess(")) {
        violations.push(`${rel} is missing requireFacilityAccess guard`)
      }

      if (!source.includes("resolveAuthError(")) {
        violations.push(`${rel} is missing resolveAuthError handling`)
      }

      if (!source.includes("enforceTrustedOriginOrReferer(")) {
        violations.push(`${rel} is missing enforceTrustedOriginOrReferer`)
      }
    }

    expect(violations).toEqual([])
  })
})
