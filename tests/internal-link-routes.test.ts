import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs"
import { join } from "node:path"

const APP_DIR = join(process.cwd(), "app")
const SCAN_DIRS = [join(APP_DIR, "auth"), join(APP_DIR, "dashboard")]

function listTsxFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listTsxFiles(fullPath))
      continue
    }
    if (entry.isFile() && fullPath.endsWith(".tsx")) {
      files.push(fullPath)
    }
  }
  return files
}

function collectInternalHrefs(filePath: string): string[] {
  const source = readFileSync(filePath, "utf8")
  return Array.from(source.matchAll(/href="(\/[^"]*)"/g)).map((m) => m[1])
}

function routeExists(pathname: string): boolean {
  if (pathname === "/") {
    return existsSync(join(APP_DIR, "page.tsx"))
  }

  const cleanPath = pathname.split("?")[0].split("#")[0]
  const segments = cleanPath.split("/").filter(Boolean)
  if (!segments.length) return false

  const walk = (dir: string, idx: number): boolean => {
    if (idx === segments.length) {
      return existsSync(join(dir, "page.tsx")) || existsSync(join(dir, "route.ts"))
    }

    const current = segments[idx]
    const childEntries = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

    const candidates = new Set<string>()
    if (childEntries.includes(current)) {
      candidates.add(current)
    }
    for (const name of childEntries) {
      if (/^\[\.\.\..+\]$/.test(name) || /^\[.+\]$/.test(name)) {
        candidates.add(name)
      }
    }

    for (const candidate of candidates) {
      if (walk(join(dir, candidate), idx + 1)) return true
    }
    return false
  }

  return walk(APP_DIR, 0)
}

describe("internal auth/dashboard links", () => {
  it("do not contain placeholder hash links", () => {
    for (const dir of SCAN_DIRS) {
      const files = listTsxFiles(dir)
      for (const filePath of files) {
        const source = readFileSync(filePath, "utf8")
        expect(source.includes('href="#"')).toBe(false)
      }
    }
  })

  it("resolve static href targets to existing app routes", () => {
    const hrefs = new Set<string>()

    for (const dir of SCAN_DIRS) {
      if (!statSync(dir).isDirectory()) continue
      const files = listTsxFiles(dir)
      for (const filePath of files) {
        for (const href of collectInternalHrefs(filePath)) {
          hrefs.add(href)
        }
      }
    }

    for (const href of hrefs) {
      expect(routeExists(href)).toBe(true)
    }
  })
})
