import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import { API_V1_CAPABILITIES } from "@/lib/api/v1"
import { API_V1_CAPABILITY_MAP } from "@/lib/api/v1-capability-map"

describe("api v1 capability parity", () => {
  it("maps every declared capability to a route and client method", async () => {
    const capabilities = [...API_V1_CAPABILITIES]
    expect(API_V1_CAPABILITY_MAP.map((entry) => entry.capability).sort()).toEqual([...capabilities].sort())

    const clientPath = path.join(process.cwd(), "lib", "api", "v1-client.ts")
    const clientSource = await fs.readFile(clientPath, "utf8")

    for (const entry of API_V1_CAPABILITY_MAP) {
      const absoluteRoutePath = path.join(process.cwd(), entry.routePath)
      await expect(fs.access(absoluteRoutePath)).resolves.toBeUndefined()
      expect(clientSource).toContain(`async ${entry.clientMethod}(`)
    }
  })
})
