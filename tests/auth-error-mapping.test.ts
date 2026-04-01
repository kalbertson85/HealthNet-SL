import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { join } from "node:path"

function getPermissionProtectedRoutes(): string[] {
  const output = execSync(
    "rg \"requirePermission\\(\" app/api app/dashboard -g \"**/route.ts\" -l | sort",
    { cwd: process.cwd(), encoding: "utf8" },
  )
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

describe("permission route auth error mapping", () => {
  it("maps permission failures to auth error responses", () => {
    const routes = getPermissionProtectedRoutes()
    expect(routes.length).toBeGreaterThan(0)

    for (const routePath of routes) {
      const source = readFileSync(join(process.cwd(), routePath), "utf8")
      expect(source).toContain("toAuthErrorResponse")
      expect(source).toMatch(/catch\s*\(\s*error\s*\)[\s\S]*toAuthErrorResponse\(error,\s*request\)/)
    }
  })
})
