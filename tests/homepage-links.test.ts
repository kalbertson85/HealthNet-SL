import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

function routeFileForPath(pathname: string): string {
  if (pathname === "/") {
    return join(process.cwd(), "app/page.tsx")
  }
  return join(process.cwd(), "app", pathname.replace(/^\//, ""), "page.tsx")
}

describe("homepage link integrity", () => {
  it("does not use placeholder hash links", () => {
    const source = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8")
    expect(source).not.toContain('href="#"')
  })

  it("footer/legal links resolve to real pages", () => {
    const expectedPaths = ["/about", "/privacy", "/terms", "/contact"]
    for (const pathname of expectedPaths) {
      expect(existsSync(routeFileForPath(pathname))).toBe(true)
    }
  })
})
