import { describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import { API_V1_CAPABILITIES } from "@/lib/api/v1"
import { API_V1_CAPABILITY_MAP } from "@/lib/api/v1-capability-map"
import { getApiV1Endpoint } from "@/lib/api/v1-endpoints"

const META_ROUTE_PATH = path.join(process.cwd(), "app", "api", "v1", "meta", "route.ts")
const CLIENT_PATH = path.join(process.cwd(), "lib", "api", "v1-client.ts")

describe("api v1 contract invariants", () => {
  it("keeps capabilities, map entries, and resolver endpoints unique", async () => {
    const capabilities = [...API_V1_CAPABILITIES]
    const mappedCapabilities = API_V1_CAPABILITY_MAP.map((entry) => entry.capability)
    const endpoints = API_V1_CAPABILITY_MAP.map((entry) => getApiV1Endpoint(entry.capability))

    expect(new Set(capabilities).size).toBe(capabilities.length)
    expect(new Set(mappedCapabilities).size).toBe(mappedCapabilities.length)
    expect(new Set(endpoints).size).toBe(endpoints.length)
  })

  it("ensures meta route advertises all declared capabilities", async () => {
    const source = await fs.readFile(META_ROUTE_PATH, "utf8")
    expect(source).toContain("API_V1_CAPABILITIES")
    expect(source).toContain("capabilities: API_V1_CAPABILITIES")
    expect(API_V1_CAPABILITIES.length).toBeGreaterThan(0)
  })

  it("ensures client references endpoint resolver and all mapped methods", async () => {
    const clientSource = await fs.readFile(CLIENT_PATH, "utf8")
    expect(clientSource).toContain('from "@/lib/api/v1-endpoints"')
    expect(clientSource).toContain("const endpoint = getApiV1Endpoint")

    for (const entry of API_V1_CAPABILITY_MAP) {
      expect(clientSource).toContain(`async ${entry.clientMethod}(`)
      expect(clientSource).toContain(`endpoint("${entry.capability}")`)
    }
  })
})
