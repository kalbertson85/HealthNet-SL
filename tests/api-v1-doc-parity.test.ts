import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import { API_V1_CAPABILITY_MAP } from "@/lib/api/v1-capability-map"

const DOC_PATH = path.join(process.cwd(), "API_CONTRACT_V1.md")

describe("api v1 contract doc parity", () => {
  it("documents every declared capability endpoint", async () => {
    const doc = await fs.readFile(DOC_PATH, "utf8")
    for (const entry of API_V1_CAPABILITY_MAP) {
      expect(doc).toContain(entry.docHeader)
    }
  })
})
