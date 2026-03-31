import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { enforceTrustedOrigin } from "../lib/http/request-security"

describe("enforceTrustedOrigin", () => {
  it("allows same-origin requests", () => {
    const request = new NextRequest("https://hms.example.com/api/sync/queue", {
      headers: {
        host: "hms.example.com",
        origin: "https://hms.example.com",
      },
    })

    expect(enforceTrustedOrigin(request)).toBeNull()
  })

  it("rejects mismatched origins", async () => {
    const request = new NextRequest("https://hms.example.com/api/sync/queue", {
      headers: {
        host: "hms.example.com",
        origin: "https://evil.example.com",
      },
    })

    const response = enforceTrustedOrigin(request)
    expect(response?.status).toBe(403)
    const body = await response?.json()
    expect(body?.error?.code).toBe("forbidden_origin")
  })

  it("allows requests without origin header", () => {
    const request = new NextRequest("https://hms.example.com/api/sync/queue", {
      headers: {
        host: "hms.example.com",
      },
    })

    expect(enforceTrustedOrigin(request)).toBeNull()
  })
})
