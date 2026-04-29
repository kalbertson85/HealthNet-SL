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

describe("Admin route no-store coverage", () => {
  it("ensures admin JSON routes apply shared no-store response headers", async () => {
    const files = await walk(ADMIN_API_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const file of files) {
      const rel = path.relative(ADMIN_API_ROOT, file)
      const source = await fs.readFile(file, "utf8")
      const isJsonRoute = source.includes("NextResponse.json(")
      if (!isJsonRoute) continue

      if (!source.includes('from "@/lib/http/headers"')) {
        violations.push(`${rel} is missing shared headers module import`)
      }
      if (!source.includes("NO_STORE_JSON_HEADERS")) {
        violations.push(`${rel} is missing NO_STORE_JSON_HEADERS usage`)
      }
      if (!source.includes("headers: NO_STORE_JSON_HEADERS")) {
        violations.push(`${rel} is missing no-store headers on JSON response`)
      }
    }

    expect(violations).toEqual([])
  })
})

