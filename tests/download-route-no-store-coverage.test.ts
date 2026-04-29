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
    if (entry.isFile() && entry.name === "route.ts") {
      files.push(fullPath)
    }
  }
  return files
}

describe("Download route no-store coverage", () => {
  it("ensures PDF/export download routes apply NO_STORE_DOWNLOAD_HEADERS", async () => {
    const files = await walk(API_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const file of files) {
      const rel = path.relative(API_ROOT, file)
      const source = await fs.readFile(file, "utf8")
      const isDownloadRoute = source.includes("Content-Disposition") || rel.includes(path.join("pdf", "route.ts"))
      if (!isDownloadRoute) continue

      if (!source.includes('from "@/lib/http/headers"')) {
        violations.push(`${rel} is missing shared headers module import`)
      }
      if (!source.includes("NO_STORE_DOWNLOAD_HEADERS")) {
        violations.push(`${rel} is missing NO_STORE_DOWNLOAD_HEADERS usage`)
      }
    }

    expect(violations).toEqual([])
  })
})

