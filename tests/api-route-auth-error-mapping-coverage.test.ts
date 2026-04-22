import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const API_ROOT = path.join(process.cwd(), "app", "api")

const PUBLIC_MUTATION_ROUTES = new Set([
  path.join("auth", "login-audit", "route.ts"),
  path.join("auth", "password-reset-audit", "route.ts"),
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
    if (entry.isFile() && entry.name === "route.ts") {
      files.push(fullPath)
    }
  }
  return files
}

describe("API mutation auth error mapping coverage", () => {
  it("ensures private mutation routes normalize auth errors consistently", async () => {
    const files = await walk(API_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []

    for (const file of files) {
      const rel = path.relative(API_ROOT, file)
      const source = await fs.readFile(file, "utf8")

      const hasMutation =
        source.includes("export async function POST(") ||
        source.includes("export async function PUT(") ||
        source.includes("export async function PATCH(") ||
        source.includes("export async function DELETE(")

      if (!hasMutation || PUBLIC_MUTATION_ROUTES.has(rel)) continue

      const hasAuthErrorMapping =
        source.includes("toAuthErrorResponse(") || source.includes("resolveAuthError(")

      if (!hasAuthErrorMapping) {
        violations.push(`${rel} is missing toAuthErrorResponse/resolveAuthError mapping`)
      }
    }

    expect(violations).toEqual([])
  })
})

