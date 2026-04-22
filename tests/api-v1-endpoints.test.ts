import { describe, expect, it } from "vitest"
import { API_V1_CAPABILITY_MAP } from "@/lib/api/v1-capability-map"
import { getApiV1Endpoint } from "@/lib/api/v1-endpoints"

describe("api v1 endpoint derivation", () => {
  it("derives endpoint paths that match documented route headers", () => {
    for (const entry of API_V1_CAPABILITY_MAP) {
      const resolved = getApiV1Endpoint(entry.capability)
      const documented = entry.docHeader
        .replace(/^## `GET /, "")
        .replace(/`$/, "")
      const normalizedDocumented = `/${documented.replace(/^\/?api\/v1\/?/, "")}`
      expect(resolved).toBe(normalizedDocumented)
    }
  })

  it("returns normalized path format", () => {
    for (const entry of API_V1_CAPABILITY_MAP) {
      const endpoint = getApiV1Endpoint(entry.capability)
      expect(endpoint.startsWith("/")).toBe(true)
      expect(endpoint.endsWith("/")).toBe(false)
      expect(endpoint.includes("route.ts")).toBe(false)
      expect(endpoint).toMatch(/^\/[a-z0-9/-]+$/)
    }
  })
})
