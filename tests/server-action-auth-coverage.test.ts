import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const ROOTS = [path.join(process.cwd(), "app", "dashboard"), path.join(process.cwd(), "app", "actions")]
const ALLOWLIST = new Set([path.join("app", "actions", "auth.ts")])

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)))
      continue
    }
    if (!entry.isFile()) continue
    if (!fullPath.endsWith(".ts") && !fullPath.endsWith(".tsx")) continue
    files.push(fullPath)
  }
  return files
}

describe("server action auth coverage", () => {
  it("ensures files using server actions enforce permission guards", async () => {
    const files = (await Promise.all(ROOTS.map((root) => walk(root)))).flat()
    const violations: string[] = []

    for (const file of files) {
      const rel = path.relative(process.cwd(), file)
      if (ALLOWLIST.has(rel)) continue
      const source = await fs.readFile(file, "utf8")

      if (!source.includes("\"use server\"") && !source.includes("'use server'")) {
        continue
      }

      const hasGuard = source.includes("requireServerActionPermission(")
      if (!hasGuard) {
        violations.push(`${rel} uses server actions but is missing requireServerActionPermission`)
      }
    }

    expect(violations).toEqual([])
  })
})
