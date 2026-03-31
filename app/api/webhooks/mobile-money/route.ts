import { NextResponse, type NextRequest } from "next/server"
import { createHash } from "node:crypto"
import { z } from "zod"
import { WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS, registerWebhookEventId, verifyMobileMoneyWebhook } from "@/lib/webhooks/mobile-money"
import { maybeCleanupWebhookReplayEvents, registerWebhookReplayEvent } from "@/lib/webhooks/replay-store"
import { maybeApplyMobileMoneyInvoicePayment } from "@/lib/webhooks/mobile-money-mutation"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"
import { logSystemAuditEvent } from "@/lib/audit"

const MAX_WEBHOOK_BODY_BYTES = 128 * 1024
const MAX_EVENT_ID_LENGTH = 128
const MAX_STATUS_LENGTH = 32
const MAX_EVENT_TYPE_LENGTH = 64
const MAX_EXTERNAL_ID_LENGTH = 128
const MAX_INVOICE_ID_LENGTH = 64
const MAX_AMOUNT_LENGTH = 24
const WEBHOOK_PROVIDER = "mobile_money"

const webhookPayloadSchema = z
  .object({
    event_id: z.string().trim().min(1).max(MAX_EVENT_ID_LENGTH).optional(),
    id: z.string().trim().min(1).max(MAX_EVENT_ID_LENGTH).optional(),
    status: z.string().trim().min(1).max(MAX_STATUS_LENGTH),
    amount: z.union([
      z.number().finite().nonnegative(),
      z.string().trim().min(1).max(MAX_AMOUNT_LENGTH).regex(/^\d+(\.\d+)?$/),
    ]),
    event_type: z.string().trim().min(1).max(MAX_EVENT_TYPE_LENGTH).optional(),
    transaction_id: z.string().trim().min(1).max(MAX_EXTERNAL_ID_LENGTH).optional(),
    reference: z.string().trim().min(1).max(MAX_EXTERNAL_ID_LENGTH).optional(),
    invoice_id: z.string().trim().min(1).max(MAX_INVOICE_ID_LENGTH).optional(),
  })
  .passthrough()

function summarizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {}
  const record = payload as Record<string, unknown>
  return {
    event_id: record.event_id ?? record.id ?? null,
    event_type: record.event_type ?? record.type ?? null,
    transaction_id: record.transaction_id ?? record.reference ?? null,
    invoice_id: record.invoice_id ?? null,
    status: record.status ?? null,
  }
}

function extractEventId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const id = record.event_id ?? record.id ?? null
  if (typeof id !== "string") return null
  const normalized = id.trim()
  if (!normalized || normalized.length > MAX_EVENT_ID_LENGTH) return null
  return normalized
}

async function logRejectedWebhookAttempt(
  request: NextRequest,
  reason: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"
  const userAgent = request.headers.get("user-agent") || "unknown"
  const timestampHeader = request.headers.get("x-timestamp") || ""
  const fingerprint = createHash("sha256").update(`${WEBHOOK_PROVIDER}|${ip}|${userAgent}|${timestampHeader}`).digest("hex")

  await logSystemAuditEvent({
    action: "webhook.mobile_money.rejected",
    resourceType: "webhook",
    metadata: {
      provider: WEBHOOK_PROVIDER,
      reason,
      fingerprint,
      ...extra,
    },
  })
}

function webhookVerificationError(verification: {
  reason: "missing_headers" | "invalid_signature" | "invalid_timestamp" | "stale_timestamp"
}, request: NextRequest) {
  switch (verification.reason) {
    case "missing_headers":
      return apiError(401, "missing_signature_headers", "Missing signature headers", request)
    case "invalid_timestamp":
      return apiError(400, "invalid_timestamp", "Invalid timestamp", request)
    case "stale_timestamp":
      return apiError(401, "stale_timestamp", "Stale timestamp", request)
    case "invalid_signature":
    default:
      return apiError(401, "invalid_signature", "Invalid signature", request)
  }
}

// Basic mobile money webhook stub
// Expects a shared secret in the `X-Signature` header matching MOBILE_MONEY_WEBHOOK_SECRET.
// For now, it only logs the payload and returns 200, without mutating billing state.

export async function POST(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_webhook_mobile_money",
    maxRequests: 240,
    windowMs: 60_000,
  })
  if (limited) return limited

  const secret = process.env.MOBILE_MONEY_WEBHOOK_SECRET
  const signature = request.headers.get("x-signature") || request.headers.get("X-Signature")
  const timestamp = request.headers.get("x-timestamp") || request.headers.get("X-Timestamp")

  if (!secret) {
    console.error("[v0] Mobile money webhook called but MOBILE_MONEY_WEBHOOK_SECRET is not configured")
    return apiError(500, "webhook_not_configured", "Webhook not configured", request)
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() || ""
  if (!contentType.includes("application/json")) {
    await logRejectedWebhookAttempt(request, "unsupported_media_type")
    return apiError(415, "unsupported_media_type", "Content-Type must be application/json", request)
  }

  const contentLength = request.headers.get("content-length")
  if (contentLength) {
    const declaredSize = Number.parseInt(contentLength, 10)
    if (Number.isFinite(declaredSize) && declaredSize > MAX_WEBHOOK_BODY_BYTES) {
      await logRejectedWebhookAttempt(request, "payload_too_large_declared")
      return apiError(413, "payload_too_large", "Payload too large", request)
    }
  }

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    await logRejectedWebhookAttempt(request, "payload_too_large_actual")
    return apiError(413, "payload_too_large", "Payload too large", request)
  }

  const verification = verifyMobileMoneyWebhook({
    secret,
    signatureHeader: signature,
    timestampHeader: timestamp,
    rawBody,
  })

  if (!verification.ok) {
    console.warn("[v0] Mobile money webhook rejected", { reason: verification.reason })
    await logRejectedWebhookAttempt(request, verification.reason)
    return webhookVerificationError(verification, request)
  }

  let payload: unknown = null
  try {
    payload = rawBody ? JSON.parse(rawBody) : null
  } catch {
    await logRejectedWebhookAttempt(request, "invalid_json")
    return apiError(400, "invalid_json", "Invalid JSON", request)
  }

  if (!payload || typeof payload !== "object") {
    await logRejectedWebhookAttempt(request, "invalid_payload_not_object")
    return apiError(400, "invalid_payload", "Payload must be a JSON object", request)
  }

  const parsedPayload = webhookPayloadSchema.safeParse(payload)
  if (!parsedPayload.success) {
    await logRejectedWebhookAttempt(request, "invalid_payload_schema", {
      issues: parsedPayload.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
      })),
    })
    return apiError(400, "invalid_payload", "Payload missing required fields", request)
  }

  const validatedPayload = parsedPayload.data
  const eventId = extractEventId(validatedPayload)
  if (!eventId) {
    await logRejectedWebhookAttempt(request, "invalid_event_id")
    return apiError(400, "invalid_payload", "Payload must include a valid event_id", request)
  }

  const persistent = await registerWebhookReplayEvent(WEBHOOK_PROVIDER, eventId)
  if (persistent === "duplicate") {
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 })
  }
  if (persistent === "unavailable" && !registerWebhookEventId(eventId)) {
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 })
  }

  await maybeApplyMobileMoneyInvoicePayment({
    eventId,
    invoiceId: validatedPayload.invoice_id ?? null,
    amount: validatedPayload.amount,
    status: validatedPayload.status,
    transactionId: validatedPayload.transaction_id ?? null,
    reference: validatedPayload.reference ?? null,
  })

  void maybeCleanupWebhookReplayEvents()

  // Log a minimal event summary only to avoid leaking full payment payloads.
  console.log("[v0] Mobile money webhook received", summarizePayload(validatedPayload))

  return NextResponse.json({ ok: true }, { status: 200 })
}

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_webhook_mobile_money_health",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  const secret = process.env.MOBILE_MONEY_WEBHOOK_SECRET
  return NextResponse.json(
    {
      ok: true,
      provider: WEBHOOK_PROVIDER,
      configured: Boolean(secret),
      timestampToleranceSeconds: WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
      dedupe: {
        persistentStoreConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
    },
    { headers: NO_STORE_JSON_HEADERS },
  )
}
