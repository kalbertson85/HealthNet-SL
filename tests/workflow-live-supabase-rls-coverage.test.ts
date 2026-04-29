import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("live supabase rls workflow", () => {
  it("uses manual trigger, validates env, and executes live rls tests", () => {
    const workflowPath = path.resolve(process.cwd(), ".github/workflows/live-supabase-rls.yml")
    const workflow = readFileSync(workflowPath, "utf8")

    expect(workflow).toContain("workflow_dispatch:")
    expect(workflow).toContain("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: \"true\"")
    expect(workflow).toContain("node scripts/verify-live-rls-env.mjs")
    expect(workflow).toContain("pnpm run test:live:rls:enabled")
    expect(workflow).toContain("uses: actions/upload-artifact@v5")
  })
})
