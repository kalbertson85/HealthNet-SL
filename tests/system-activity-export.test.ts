import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

function getHeaderColumns(): string[] {
  const routePath = join(process.cwd(), "app/api/admin/system-activity/route.ts")
  const source = readFileSync(routePath, "utf8")
  const match = source.match(/SYSTEM_ACTIVITY_CSV_HEADER\s*=\s*\[([\s\S]*?)\]/)
  if (!match) return []
  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((m) => m[1])
}

describe("system activity export header", () => {
  it("has unique column names", () => {
    const header = getHeaderColumns()
    const unique = new Set(header)
    expect(unique.size).toBe(header.length)
  })

  it("keeps resource columns in the expected order", () => {
    const header = getHeaderColumns()
    const resourceIdIndex = header.indexOf("resource_id")
    const resourceLabelIndex = header.indexOf("resource_label")
    expect(resourceIdIndex).toBeGreaterThan(-1)
    expect(resourceLabelIndex).toBe(resourceIdIndex + 1)
  })
})
