import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const FILES = {
  meta: path.join(process.cwd(), "app", "api", "v1", "meta", "route.ts"),
  session: path.join(process.cwd(), "app", "api", "v1", "session", "route.ts"),
  patientsSummary: path.join(process.cwd(), "app", "api", "v1", "patients", "summary", "route.ts"),
  billingSummary: path.join(process.cwd(), "app", "api", "v1", "billing", "summary", "route.ts"),
}

describe("api v1 contract coverage", () => {
  it("protects v1 endpoints with permission guards", async () => {
    const [meta, session, patientsSummary, billingSummary] = await Promise.all([
      fs.readFile(FILES.meta, "utf8"),
      fs.readFile(FILES.session, "utf8"),
      fs.readFile(FILES.patientsSummary, "utf8"),
      fs.readFile(FILES.billingSummary, "utf8"),
    ])

    expect(meta).toContain("requirePermission(")
    expect(session).toContain("requirePermission(")
    expect(patientsSummary).toContain("requirePermission(")
    expect(billingSummary).toContain("requirePermission(")
  })

  it("returns versioned payload fields for cross-platform clients", async () => {
    const [meta, session, patientsSummary, billingSummary] = await Promise.all([
      fs.readFile(FILES.meta, "utf8"),
      fs.readFile(FILES.session, "utf8"),
      fs.readFile(FILES.patientsSummary, "utf8"),
      fs.readFile(FILES.billingSummary, "utf8"),
    ])

    expect(meta).toContain("API_V1_VERSION")
    expect(meta).toContain("release_channel")
    expect(session).toContain("permissions")
    expect(patientsSummary).toContain("created_in_range")
    expect(billingSummary).toContain("outstanding_balance")
    expect(billingSummary).toContain("open_invoice_count")
  })
})

