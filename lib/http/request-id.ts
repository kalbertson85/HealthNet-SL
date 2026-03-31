import { randomUUID } from "node:crypto"
import type { NextRequest } from "next/server"

export const REQUEST_ID_HEADER = "x-request-id"

export function resolveRequestId(request: NextRequest): string {
  const existing = request.headers.get(REQUEST_ID_HEADER)?.trim()
  if (existing) return existing
  return randomUUID()
}
