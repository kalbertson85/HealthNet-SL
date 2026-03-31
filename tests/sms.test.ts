import { describe, it, expect, beforeEach, vi } from "vitest"
import { shouldSendSms, sendSms, type SmsNotificationType } from "../lib/notifications/sms"

// Mock Supabase server client used inside sms helpers
type NotificationPrefs = {
  sms_enabled?: boolean
  appointment_reminders?: boolean
  lab_results?: boolean
  prescription_ready?: boolean
  payment_reminders?: boolean
  system_alerts?: boolean
} | null

let mockPrefs: NotificationPrefs = null

vi.mock("@/lib/supabase/server", () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mockPrefs }),
        }),
      }),
    }),
  }

  return {
    createServerClient: async () => supabase,
  }
})

describe("shouldSendSms", () => {
  beforeEach(() => {
    mockPrefs = null
  })

  function setPrefs(prefs: NotificationPrefs) {
    mockPrefs = prefs
  }

  it("returns false when no preferences are found", async () => {
    setPrefs(null)

    const result = await shouldSendSms("user-1", "appointment_reminder")
    expect(result).toBe(false)
  })

  it("respects global sms_enabled flag", async () => {
    setPrefs({ sms_enabled: false, appointment_reminders: true })
    const result = await shouldSendSms("user-1", "appointment_reminder")
    expect(result).toBe(false)
  })

  it("checks per-type preferences", async () => {
    setPrefs({
      sms_enabled: true,
      appointment_reminders: true,
      lab_results: false,
      prescription_ready: true,
      payment_reminders: false,
      system_alerts: true,
    })

    const cases: Array<[SmsNotificationType, boolean]> = [
      ["appointment_reminder", true],
      ["lab_result_ready", false],
      ["prescription_ready", true],
      ["payment_reminder", false],
      ["system_alert", true],
    ]

    for (const [type, expected] of cases) {
      const result = await shouldSendSms("user-1", type)
      expect(result).toBe(expected)
    }
  })
})

describe("sendSms", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    ;(globalThis as any).fetch = undefined
  })

  it("skips when SMS is not configured", async () => {
    delete process.env.SMS_API_URL
    delete process.env.SMS_API_KEY

    const result = await sendSms("+123", "Hello")
    expect(result.ok).toBe(false)
    expect(result.skipped).toBe(true)
    expect(result.reason).toBe("SMS not configured")
  })

  it("returns ok=true on successful provider response", async () => {
    process.env.SMS_API_URL = "https://sms.test/send"
    process.env.SMS_API_KEY = "key"

    ;(globalThis as any).fetch = vi.fn(async () => ({ ok: true }))

    const result = await sendSms("+123", "Hello")
    expect(result.ok).toBe(true)
  })

  it("handles provider error responses", async () => {
    process.env.SMS_API_URL = "https://sms.test/send"
    process.env.SMS_API_KEY = "key"

    ;(globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "error",
    }))

    const result = await sendSms("+123", "Hello")
    expect(result.ok).toBe(false)
    expect(result.reason).toBe("Provider error 500")
  })

  it("handles exceptions thrown by fetch", async () => {
    process.env.SMS_API_URL = "https://sms.test/send"
    process.env.SMS_API_KEY = "key"

    ;(globalThis as any).fetch = vi.fn(async () => {
      throw new Error("network")
    })

    const result = await sendSms("+123", "Hello")
    expect(result.ok).toBe(false)
    expect(result.reason).toBe("Exception while sending SMS")
  })
})
