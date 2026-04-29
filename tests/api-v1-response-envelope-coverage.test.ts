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

describe("API v1 response envelope coverage", () => {
  it("ensures all API v1 routes keep ok/api.version/server_time_utc fields", async () => {
    const files = await walk(API_V1_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const file of files) {
      const rel = path.relative(API_V1_ROOT, file)
      const source = await fs.readFile(file, "utf8")

      if (!source.includes("ok: true")) {
        violations.push(`${rel} is missing ok: true in response payload`)
      }
      if (!source.includes("API_V1_VERSION")) {
        violations.push(`${rel} is missing API_V1_VERSION in response payload`)
      }
      if (!source.includes("server_time_utc")) {
        violations.push(`${rel} is missing server_time_utc in response payload`)
      }
    }

    expect(violations).toEqual([])
  })
})

