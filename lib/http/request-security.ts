import type { NextRequest } from "next/server"
import { apiError } from "./api"

function getExpectedOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim()
  const host = (forwardedHost || request.headers.get("host") || request.nextUrl.host || "").trim()
  const proto = (request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "") || "https").trim()
  return `${proto}://${host}`
}

export function enforceTrustedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin")?.trim()
  if (!origin) return null

  const expected = getExpectedOrigin(request).toLowerCase()
  const normalizedOrigin = origin.toLowerCase()

  if (normalizedOrigin !== expected) {
    return apiError(403, "forbidden_origin", "Cross-origin request rejected", request)
  }

  return null
}
