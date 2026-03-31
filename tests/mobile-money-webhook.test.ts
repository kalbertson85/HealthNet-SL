import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { registerWebhookEventId, verifyMobileMoneyWebhook } from "../lib/webhooks/mobile-money"
import { toMobileMoneyRawBody } from "./fixtures/mobile-money-payload"

function sign(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")
}

describe("verifyMobileMoneyWebhook", () => {
  const secret = "test-secret"
  const rawBody = toMobileMoneyRawBody({ event_id: "evt_1", amount: "10.00" })
  const nowMs = 1_700_000_000_000

  it("accepts valid signature and fresh timestamp", () => {
    const timestamp = String(Math.floor(nowMs / 1000))
    const signature = sign(secret, timestamp, rawBody)

    const result = verifyMobileMoneyWebhook({
      secret,
      signatureHeader: signature,
      timestampHeader: timestamp,
      rawBody,
      nowMs,
    })

    expect(result.ok).toBe(true)
  })

  it("accepts sha256= prefixed signatures", () => {
    const timestamp = String(Math.floor(nowMs / 1000))
    const signature = `sha256=${sign(secret, timestamp, rawBody)}`

    const result = verifyMobileMoneyWebhook({
      secret,
      signatureHeader: signature,
      timestampHeader: timestamp,
      rawBody,
      nowMs,
    })

    expect(result.ok).toBe(true)
  })

  it("rejects stale timestamps (replay window)", () => {
    const staleTimestamp = String(Math.floor((nowMs - 10 * 60 * 1000) / 1000))
    const signature = sign(secret, staleTimestamp, rawBody)

    const result = verifyMobileMoneyWebhook({
      secret,
      signatureHeader: signature,
      timestampHeader: staleTimestamp,
      rawBody,
      nowMs,
    })

    expect(result).toEqual({ ok: false, reason: "stale_timestamp" })
  })

  it("rejects invalid signatures", () => {
    const timestamp = String(Math.floor(nowMs / 1000))

    const result = verifyMobileMoneyWebhook({
      secret,
      signatureHeader: "abc123",
      timestampHeader: timestamp,
      rawBody,
      nowMs,
    })

    expect(result).toEqual({ ok: false, reason: "invalid_signature" })
  })

  it("rejects missing headers", () => {
    const result = verifyMobileMoneyWebhook({
      secret,
      signatureHeader: null,
      timestampHeader: null,
      rawBody,
      nowMs,
    })

    expect(result).toEqual({ ok: false, reason: "missing_headers" })
  })

  it("rejects duplicate event ids in replay cache", () => {
    const first = registerWebhookEventId("evt-dup-1", nowMs)
    const second = registerWebhookEventId("evt-dup-1", nowMs + 1)
    expect(first).toBe(true)
    expect(second).toBe(false)
  })
})
