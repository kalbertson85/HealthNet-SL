import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("post-migration security verify workflow", () => {
  it("is manual, uses node24 runtime guard, and uploads artifact via v5", () => {
    const workflowPath = path.resolve(process.cwd(), ".github/workflows/post-migration-security-verify.yml")
    const workflow = readFileSync(workflowPath, "utf8")

    expect(workflow).toContain("workflow_dispatch:")
    expect(workflow).toContain("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: \"true\"")
    expect(workflow).toContain("uses: actions/upload-artifact@v5")
    expect(workflow).toContain("SUPABASE_DB_URL")
    expect(workflow).toContain("scripts/086_post_migration_security_verification.sql")
  })
})
