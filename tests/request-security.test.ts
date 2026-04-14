import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { enforceTrustedOrigin, enforceTrustedOriginOrReferer, enforceXmlHttpRequestHeader } from "../lib/http/request-security"

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

describe("enforceTrustedOriginOrReferer", () => {
  it("allows trusted referer when origin is missing", () => {
    const request = new NextRequest("https://hms.example.com/api/auth/login-audit", {
      headers: {
        host: "hms.example.com",
        referer: "https://hms.example.com/auth/login",
      },
    })

    expect(enforceTrustedOriginOrReferer(request)).toBeNull()
  })

  it("rejects when both origin and referer are missing", async () => {
    const request = new NextRequest("https://hms.example.com/api/auth/login-audit", {
      headers: {
        host: "hms.example.com",
      },
    })

    const response = enforceTrustedOriginOrReferer(request)
    expect(response?.status).toBe(403)
    const body = await response?.json()
    expect(body?.error?.code).toBe("forbidden_origin")
  })
})

describe("enforceXmlHttpRequestHeader", () => {
  it("allows ajax requests", () => {
    const request = new NextRequest("https://hms.example.com/api/auth/login-audit", {
      headers: {
        "x-requested-with": "XMLHttpRequest",
      },
    })
    expect(enforceXmlHttpRequestHeader(request)).toBeNull()
  })

  it("rejects missing ajax header", async () => {
    const request = new NextRequest("https://hms.example.com/api/auth/login-audit")
    const response = enforceXmlHttpRequestHeader(request)
    expect(response?.status).toBe(403)
    const body = await response?.json()
    expect(body?.error?.code).toBe("forbidden_client")
  })
})
