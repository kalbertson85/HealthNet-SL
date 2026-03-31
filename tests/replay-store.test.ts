import { afterEach, describe, expect, it } from "vitest"
import { maybeCleanupWebhookReplayEvents, registerWebhookReplayEvent } from "../lib/webhooks/replay-store"

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole
})

describe("registerWebhookReplayEvent", () => {
  it("returns unavailable when service-role Supabase env is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    const result = await registerWebhookReplayEvent("mobile_money", "evt_missing_env")
    expect(result).toBe("unavailable")
  })

  it("cleanup no-ops when service-role Supabase env is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    await expect(maybeCleanupWebhookReplayEvents()).resolves.toBeUndefined()
  })
})
