import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const API_V1_ROOT = path.join(process.cwd(), "app", "api", "v1")

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

describe("API v1 error contract coverage", () => {
  it("ensures API v1 routes map auth errors and use apiError for failure responses", async () => {
    const files = await walk(API_V1_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const file of files) {
      const rel = path.relative(API_V1_ROOT, file)
      const source = await fs.readFile(file, "utf8")

      if (!source.includes("catch (error)")) {
        violations.push(`${rel} is missing catch(error) block`)
      }
      if (!source.includes("toAuthErrorResponse(")) {
        violations.push(`${rel} is missing toAuthErrorResponse mapping`)
      }
      if (!source.includes("apiError(")) {
        violations.push(`${rel} is missing apiError(...) failure response`)
      }

      const hasRaw500 =
        /NextResponse\.json\([^)]*status:\s*500/.test(source) ||
        /new NextResponse\([^)]*status:\s*500/.test(source)
      if (hasRaw500) {
        violations.push(`${rel} contains raw NextResponse 500 response; use apiError(...)`)
      }
    }

    expect(violations).toEqual([])
  })
})

