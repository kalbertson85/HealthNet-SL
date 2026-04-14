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

function normalizeOrigin(value: string | null): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    return `${parsed.protocol}//${parsed.host}`.toLowerCase()
  } catch {
    return null
  }
}

export function enforceTrustedOriginOrReferer(request: NextRequest) {
  const expected = getExpectedOrigin(request).toLowerCase()
  const origin = normalizeOrigin(request.headers.get("origin"))
  const referer = normalizeOrigin(request.headers.get("referer"))

  if (origin && origin !== expected) {
    return apiError(403, "forbidden_origin", "Cross-origin request rejected", request)
  }
  if (!origin && referer && referer !== expected) {
    return apiError(403, "forbidden_origin", "Cross-origin request rejected", request)
  }
  if (!origin && !referer) {
    return apiError(403, "forbidden_origin", "Origin or Referer header is required", request)
  }

  return null
}

export function enforceXmlHttpRequestHeader(request: NextRequest) {
  const requestedWith = (request.headers.get("x-requested-with") || "").trim()
  if (requestedWith.toLowerCase() !== "xmlhttprequest") {
    return apiError(403, "forbidden_client", "Request missing required client header", request)
  }
  return null
}
