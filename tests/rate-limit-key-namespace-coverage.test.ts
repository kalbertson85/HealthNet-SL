import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const ROOT = path.join(process.cwd(), "app", "api")

type ScopeRule = {
  folder: string
  expectedPrefix: string
}

const RULES: ScopeRule[] = [
  { folder: path.join("v1"), expectedPrefix: "api_v1_" },
  { folder: path.join("admin"), expectedPrefix: "api_admin_" },
  { folder: path.join("export"), expectedPrefix: "api_export_" },
]

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

function firstRateLimitKey(source: string): string | null {
  const match = source.match(/key:\s*"([^"]+)"/)
  return match?.[1] ?? null
}

describe("Rate-limit key namespace coverage", () => {
  it("ensures key namespaces are consistent for v1/admin/export routes", async () => {
    const violations: string[] = []

    for (const rule of RULES) {
      const scopeRoot = path.join(ROOT, rule.folder)
      const files = await walk(scopeRoot)
      expect(files.length).toBeGreaterThan(0)

      for (const file of files) {
        const rel = path.relative(ROOT, file)
        const source = await fs.readFile(file, "utf8")

        if (!source.includes("enforceFixedWindowRateLimit(")) {
          violations.push(`${rel} is missing enforceFixedWindowRateLimit`)
          continue
        }

        const key = firstRateLimitKey(source)
        if (!key) {
          violations.push(`${rel} is missing explicit rate-limit key`)
          continue
        }

        if (!key.startsWith(rule.expectedPrefix)) {
          violations.push(
            `${rel} has rate-limit key "${key}" outside expected prefix "${rule.expectedPrefix}"`,
          )
        }
      }
    }

    expect(violations).toEqual([])
  })
})

