import { createHmac } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { POST } from "../app/api/webhooks/mobile-money/route"
import { toMobileMoneyRawBody } from "./fixtures/mobile-money-payload"

function sign(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")
}

describe("POST /api/webhooks/mobile-money", () => {
  const secret = "test-mobile-money-secret"

  afterEach(() => {
    delete process.env.MOBILE_MONEY_WEBHOOK_SECRET
  })

  it("returns 401 when required signature headers are missing", async () => {
    process.env.MOBILE_MONEY_WEBHOOK_SECRET = secret
    const body = JSON.stringify({ event_id: "evt_missing_headers" })
    const request = new NextRequest("http://localhost/api/webhooks/mobile-money", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.11" },
      body,
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toMatchObject({
      ok: false,
      error: { code: "invalid_signature" },
    })
  })

  it("returns 401 when signature is invalid", async () => {
    process.env.MOBILE_MONEY_WEBHOOK_SECRET = secret
    const timestamp = String(Math.floor(Date.now() / 1000))
    const body = JSON.stringify({ event_id: "evt_invalid_sig" })
    const request = new NextRequest("http://localhost/api/webhooks/mobile-money", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.12",
        "x-timestamp": timestamp,
        "x-signature": sign("wrong-secret", timestamp, body),
      },
      body,
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toMatchObject({
      ok: false,
      error: { code: "invalid_signature" },
    })
  })

  it("returns 401 when timestamp is stale even with a valid signature", async () => {
    process.env.MOBILE_MONEY_WEBHOOK_SECRET = secret
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600)
    const body = JSON.stringify({ event_id: "evt_stale_ts" })
    const request = new NextRequest("http://localhost/api/webhooks/mobile-money", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.13",
        "x-timestamp": staleTimestamp,
        "x-signature": sign(secret, staleTimestamp, body),
      },
      body,
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toMatchObject({
      ok: false,
      error: { code: "invalid_signature" },
    })
  })

  it("returns 415 for non-JSON content types", async () => {
    process.env.MOBILE_MONEY_WEBHOOK_SECRET = secret
    const timestamp = String(Math.floor(Date.now() / 1000))
    const body = "event_id=evt_non_json"
    const request = new NextRequest("http://localhost/api/webhooks/mobile-money", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": "10.0.0.14",
        "x-timestamp": timestamp,
        "x-signature": sign(secret, timestamp, body),
      },
      body,
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(415)
    expect(payload).toMatchObject({
      ok: false,
      error: { code: "unsupported_media_type" },
    })
  })

  it("returns 400 when event_id is missing", async () => {
    process.env.MOBILE_MONEY_WEBHOOK_SECRET = secret
    const timestamp = String(Math.floor(Date.now() / 1000))
    const body = JSON.stringify({ status: "success" })
    const request = new NextRequest("http://localhost/api/webhooks/mobile-money", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.15",
        "x-timestamp": timestamp,
        "x-signature": sign(secret, timestamp, body),
      },
      body,
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toMatchObject({
      ok: false,
      error: { code: "invalid_payload" },
    })
  })

  it("returns 400 when required status field is missing", async () => {
    process.env.MOBILE_MONEY_WEBHOOK_SECRET = secret
    const timestamp = String(Math.floor(Date.now() / 1000))
    const body = JSON.stringify({ event_id: "evt_missing_status", amount: 1000 })
    const request = new NextRequest("http://localhost/api/webhooks/mobile-money", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.16",
        "x-timestamp": timestamp,
        "x-signature": sign(secret, timestamp, body),
      },
      body,
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toMatchObject({
      ok: false,
      error: { code: "invalid_payload" },
    })
  })

  it("returns 400 when required amount field is missing", async () => {
    process.env.MOBILE_MONEY_WEBHOOK_SECRET = secret
    const timestamp = String(Math.floor(Date.now() / 1000))
    const body = JSON.stringify({ event_id: "evt_missing_amount", status: "success" })
    const request = new NextRequest("http://localhost/api/webhooks/mobile-money", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.17",
        "x-timestamp": timestamp,
        "x-signature": sign(secret, timestamp, body),
      },
      body,
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toMatchObject({
      ok: false,
      error: { code: "invalid_payload" },
    })
  })

  it("accepts a realistic provider payload and deduplicates the same event_id", async () => {
    process.env.MOBILE_MONEY_WEBHOOK_SECRET = secret
    const timestamp = String(Math.floor(Date.now() / 1000))
    const body = toMobileMoneyRawBody()

    const request = new NextRequest("http://localhost/api/webhooks/mobile-money", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.18",
        "x-timestamp": timestamp,
        "x-signature": sign(secret, timestamp, body),
      },
      body,
    })

    const firstResponse = await POST(request)
    const firstPayload = await firstResponse.json()

    expect(firstResponse.status).toBe(200)
    expect(firstPayload).toEqual({ ok: true })

    const secondRequest = new NextRequest("http://localhost/api/webhooks/mobile-money", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.18",
        "x-timestamp": timestamp,
        "x-signature": sign(secret, timestamp, body),
      },
      body,
    })

    const secondResponse = await POST(secondRequest)
    const secondPayload = await secondResponse.json()

    expect(secondResponse.status).toBe(200)
    expect(secondPayload).toEqual({ ok: true, duplicate: true })
  })
})
