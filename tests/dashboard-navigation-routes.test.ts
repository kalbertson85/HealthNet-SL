import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

function routeExists(pathname: string): boolean {
  if (pathname === "/") return existsSync(join(process.cwd(), "app/page.tsx"))
  const normalized = pathname.replace(/^\//, "")
  return (
    existsSync(join(process.cwd(), "app", normalized, "page.tsx")) ||
    existsSync(join(process.cwd(), "app", normalized, "route.ts"))
  )
}

function readSidebarHrefs(): string[] {
  const source = readFileSync(join(process.cwd(), "components/dashboard-sidebar.tsx"), "utf8")
  const hrefMatches = Array.from(source.matchAll(/href:\s*"([^"]+)"/g)).map((m) => m[1])
  return Array.from(new Set(hrefMatches))
}

describe("dashboard sidebar route integrity", () => {
  it("all sidebar href targets resolve to an app route file", () => {
    const hrefs = readSidebarHrefs()
    for (const href of hrefs) {
      expect(routeExists(href)).toBe(true)
    }
  })
})
