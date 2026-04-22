import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const ROOT = process.cwd()
const SCAN_DIRS = ["app", "components", "lib"]
const FILE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mdx"])

const BANNED_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\bSierra Leone\b/i, message: "Found hardcoded country name 'Sierra Leone'" },
  { pattern: /\bChiefdom\b/i, message: "Found country-specific location tier 'Chiefdom'" },
  { pattern: /\bDistrict\b/i, message: "Found hardcoded location tier 'District' (use dynamic region labels)" },
  { pattern: /\bHealthNet-SL\b/i, message: "Found country-scoped branding token 'HealthNet-SL'" },
  { pattern: /\be\.g\.\s*SL-/i, message: "Found SL-prefixed sample token in UI placeholder" },
]

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue
      files.push(...(await walk(full)))
      continue
    }
    if (!entry.isFile()) continue
    if (!FILE_EXTENSIONS.has(path.extname(entry.name))) continue
    files.push(full)
  }
  return files
}

describe("globalization hardcoding guardrails", () => {
  it("blocks country-specific hardcoded terms in app runtime code", async () => {
    const violations: string[] = []

    for (const scanDir of SCAN_DIRS) {
      const absDir = path.join(ROOT, scanDir)
      const files = await walk(absDir)
      for (const file of files) {
        const content = await fs.readFile(file, "utf8")
        for (const { pattern, message } of BANNED_PATTERNS) {
          if (pattern.test(content)) {
            violations.push(`${path.relative(ROOT, file)}: ${message}`)
          }
        }
      }
    }

    expect(violations).toEqual([])
  })
})

