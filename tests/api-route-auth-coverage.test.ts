import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const API_ROOT = path.join(process.cwd(), "app", "api")

const PUBLIC_ROUTE_ALLOWLIST = new Set([
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

function hasPrivateAuthGuard(source: string): boolean {
  return (
    source.includes("requirePermission(") ||
    source.includes("requireRole(") ||
    source.includes("requireAuth(")
  )
}

function hasPublicHardening(source: string): boolean {
  const hasRateLimit = source.includes("enforceFixedWindowRateLimit(")
  const hasOriginGuard =
    source.includes("enforceTrustedOrigin(") || source.includes("enforceTrustedOriginOrReferer(")
  const hasWebhookSignatureGuard = source.includes("verifyMobileMoneyWebhook(")
  return hasRateLimit && (hasOriginGuard || hasWebhookSignatureGuard)
}

describe("API route auth coverage", () => {
  it("ensures every API route has private auth guards or explicit public hardening", async () => {
    const routeFiles = await walk(API_ROOT)
    expect(routeFiles.length).toBeGreaterThan(0)

    const violations: string[] = []

    for (const file of routeFiles) {
      const rel = path.relative(API_ROOT, file)
      const source = await fs.readFile(file, "utf8")

      if (PUBLIC_ROUTE_ALLOWLIST.has(rel)) {
        if (!hasPublicHardening(source)) {
          violations.push(`${rel} is allowlisted as public but missing origin/rate-limit hardening`)
        }
        continue
      }

      if (!hasPrivateAuthGuard(source)) {
        violations.push(`${rel} is missing requireAuth/requireRole/requirePermission guard`)
      }
    }

    expect(violations).toEqual([])
  })
})
