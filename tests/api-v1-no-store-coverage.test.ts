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

describe("API v1 no-store coverage", () => {
  it("ensures all API v1 GET routes apply NO_STORE_JSON_HEADERS", async () => {
    const files = await walk(API_V1_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []

    for (const file of files) {
      const rel = path.relative(API_V1_ROOT, file)
      const source = await fs.readFile(file, "utf8")
      const hasGet = source.includes("export async function GET(")
      if (!hasGet) continue

      if (!source.includes('from "@/lib/http/headers"')) {
        violations.push(`${rel} is missing shared headers module import`)
      }
      if (!source.includes("NO_STORE_JSON_HEADERS")) {
        violations.push(`${rel} is missing NO_STORE_JSON_HEADERS import/use`)
      }
      if (!source.includes("headers: NO_STORE_JSON_HEADERS")) {
        violations.push(`${rel} is missing no-store response headers`)
      }
    }

    expect(violations).toEqual([])
  })
})
