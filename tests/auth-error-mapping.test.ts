import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

function getPermissionProtectedRoutes(): string[] {
  const roots = ["app/api", "app/dashboard"]
  const routeFiles: string[] = []

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry)
      const stats = statSync(fullPath)
      if (stats.isDirectory()) {
        walk(fullPath)
      } else if (entry === "route.ts") {
        routeFiles.push(fullPath)
      }
    }
  }

  for (const root of roots) {
    walk(join(process.cwd(), root))
  }

  return routeFiles
    .filter((absPath) => readFileSync(absPath, "utf8").includes("requirePermission("))
    .map((absPath) => absPath.replace(`${process.cwd()}/`, ""))
    .sort()
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
