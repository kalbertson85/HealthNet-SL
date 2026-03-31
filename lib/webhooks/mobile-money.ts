import { createHmac, timingSafeEqual } from "node:crypto"

export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300
const WEBHOOK_REPLAY_TTL_MS = 10 * 60 * 1000
const WEBHOOK_REPLAY_CACHE_LIMIT = 10_000
const REPLAY_CACHE_KEY = "__hmsWebhookReplayCache__"

function normalizeHexSignature(signature: string): string | null {
  const trimmed = signature.trim()
  const withoutPrefix = trimmed.startsWith("sha256=") ? trimmed.slice("sha256=".length) : trimmed
  if (!/^[a-fA-F0-9]{64}$/.test(withoutPrefix)) return null
  return withoutPrefix.toLowerCase()
}

function toTimestampMs(timestampHeader: string): number | null {
  const trimmed = timestampHeader.trim()
  if (!trimmed) return null

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(numeric)) return null
    // Treat <= 10 digits as seconds, otherwise milliseconds.
    return trimmed.length <= 10 ? numeric * 1000 : numeric
  }

  const parsed = Date.parse(trimmed)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function safeEqualHex(expectedHex: string, receivedHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex")
  const received = Buffer.from(receivedHex, "hex")
  if (expected.length !== received.length) return false
  return timingSafeEqual(expected, received)
}

export interface VerifyWebhookInput {
  secret: string
  signatureHeader: string | null
  timestampHeader: string | null
  rawBody: string
  nowMs?: number
  toleranceSeconds?: number
}

export type VerifyWebhookResult =
  | { ok: true; timestampMs: number }
  | { ok: false; reason: "missing_headers" | "invalid_signature" | "invalid_timestamp" | "stale_timestamp" }

export function verifyMobileMoneyWebhook(input: VerifyWebhookInput): VerifyWebhookResult {
  const nowMs = input.nowMs ?? Date.now()
  const toleranceSeconds = input.toleranceSeconds ?? WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS

  if (!input.signatureHeader || !input.timestampHeader) {
    return { ok: false, reason: "missing_headers" }
  }

  const normalizedSignature = normalizeHexSignature(input.signatureHeader)
  if (!normalizedSignature) {
    return { ok: false, reason: "invalid_signature" }
  }

  const timestampMs = toTimestampMs(input.timestampHeader)
  if (!timestampMs) {
    return { ok: false, reason: "invalid_timestamp" }
  }

  if (Math.abs(nowMs - timestampMs) > toleranceSeconds * 1000) {
    return { ok: false, reason: "stale_timestamp" }
  }

  const payloadToSign = `${input.timestampHeader}.${input.rawBody}`
  const expectedHex = createHmac("sha256", input.secret).update(payloadToSign).digest("hex")

  if (!safeEqualHex(expectedHex, normalizedSignature)) {
    return { ok: false, reason: "invalid_signature" }
  }

  return { ok: true, timestampMs }
}

type ReplayCache = Map<string, number>

function getReplayCache(): ReplayCache {
  const globalObj = globalThis as unknown as { [REPLAY_CACHE_KEY]?: ReplayCache }
  if (!globalObj[REPLAY_CACHE_KEY]) {
    globalObj[REPLAY_CACHE_KEY] = new Map<string, number>()
  }
  return globalObj[REPLAY_CACHE_KEY] as ReplayCache
}

export function registerWebhookEventId(eventId: string, nowMs = Date.now()): boolean {
  const normalized = eventId.trim()
  if (!normalized) return true

  const cache = getReplayCache()

  for (const [id, expiresAt] of cache.entries()) {
    if (expiresAt <= nowMs) cache.delete(id)
  }

  if (cache.has(normalized)) return false

  if (cache.size >= WEBHOOK_REPLAY_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value as string | undefined
    if (oldestKey) cache.delete(oldestKey)
  }

  cache.set(normalized, nowMs + WEBHOOK_REPLAY_TTL_MS)
  return true
}
