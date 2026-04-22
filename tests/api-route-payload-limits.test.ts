import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const API_ROOT = path.join(process.cwd(), "app", "api")

const PAYLOAD_LIMIT_EXCEPTIONS = new Set([
  path.join("patients", "photo", "route.ts"),
])

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

describe("API payload limit coverage", () => {
  it("ensures JSON POST routes enforce payload size limits", async () => {
    const files = await walk(API_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []

    for (const file of files) {
      const rel = path.relative(API_ROOT, file)
      const source = await fs.readFile(file, "utf8")
      const hasPost = source.includes("export async function POST(")
      if (!hasPost || PAYLOAD_LIMIT_EXCEPTIONS.has(rel)) continue

      const isJsonRoute =
        source.includes("unsupported_media_type") || source.includes("application/json")
      if (!isJsonRoute) continue

      if (!source.includes("content-length")) {
        violations.push(`${rel} is missing content-length payload size guard`)
      }

      if (!source.includes("payload_too_large")) {
        violations.push(`${rel} is missing payload_too_large response path`)
      }
    }

    expect(violations).toEqual([])
  })
})

