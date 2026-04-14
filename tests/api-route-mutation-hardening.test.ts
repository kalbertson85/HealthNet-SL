import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const API_ROOT = path.join(process.cwd(), "app", "api")

// Routes that intentionally use non-JSON bodies (multipart uploads) or
// provider-signature workflows with custom verification logic.
const JSON_VALIDATION_EXCEPTIONS = new Set([
  path.join("patients", "photo", "route.ts"),
  path.join("webhooks", "mobile-money", "route.ts"),
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
    if (entry.isFile() && entry.name === "route.ts") files.push(fullPath)
  }
  return files
}

describe("API mutation hardening coverage", () => {
  it("ensures POST routes include rate limits and payload-validation guards", async () => {
    const files = await walk(API_ROOT)
    const violations: string[] = []

    for (const file of files) {
      const rel = path.relative(API_ROOT, file)
      const source = await fs.readFile(file, "utf8")
      const hasPost = source.includes("export async function POST(")
      if (!hasPost) continue

      if (!source.includes("enforceFixedWindowRateLimit(")) {
        violations.push(`${rel} is missing enforceFixedWindowRateLimit`)
      }

      if (JSON_VALIDATION_EXCEPTIONS.has(rel)) {
        continue
      }

      if (!source.includes("enforceTrustedOrigin(") && !source.includes("enforceTrustedOriginOrReferer(")) {
        violations.push(`${rel} is missing enforceTrustedOrigin`)
      }
      if (!source.includes("unsupported_media_type")) {
        violations.push(`${rel} is missing unsupported_media_type response path`)
      }
      if (!source.includes("invalid_json")) {
        violations.push(`${rel} is missing invalid_json response path`)
      }
    }

    expect(violations).toEqual([])
  })
})
