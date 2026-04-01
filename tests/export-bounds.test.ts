import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const EXPORT_ROUTE_PATHS = [
  "app/api/export/appointments/route.ts",
  "app/api/export/complete/route.ts",
  "app/api/export/invoices/route.ts",
  "app/api/export/lab-tests/route.ts",
  "app/api/export/patients/route.ts",
  "app/api/export/prescriptions/route.ts",
  "app/dashboard/reports/company-billing/export/route.ts",
  "app/dashboard/reports/company-insurance/export/route.ts",
  "app/dashboard/reports/free-health-care/export/route.ts",
  "app/dashboard/reports/free-health-care/facility-cost/export/route.ts",
]

describe("export route hardening", () => {
  for (const routePath of EXPORT_ROUTE_PATHS) {
    it(`${routePath} enforces row limits and exposes truncation metadata`, () => {
      const source = readFileSync(join(process.cwd(), routePath), "utf8")
      expect(source).toMatch(/const\s+EXPORT_.*_LIMIT\s*=\s*[0-9_]+/)
      expect(source).toContain("X-Export-Truncated")
      expect(source).toContain("X-Export-Row-Limit")
      expect(source).toMatch(/\.limit\(EXPORT_.*_LIMIT \+ 1\)/)
    })
  }
})
