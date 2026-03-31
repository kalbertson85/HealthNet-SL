import { createServerClient } from "@/lib/supabase/server"

export type SmsNotificationType =
  | "appointment_reminder"
  | "lab_result_ready"
  | "prescription_ready"
  | "payment_reminder"
  | "system_alert"

export interface SmsSendResult {
  ok: boolean
  skipped?: boolean
  reason?: string
}

async function getUserPreferences(userId: string) {
  const supabase = await createServerClient()

  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  return prefs
}

export async function shouldSendSms(userId: string, type: SmsNotificationType): Promise<boolean> {
  const prefs = await getUserPreferences(userId)

  if (!prefs) return false
  if (!prefs.sms_enabled) return false

  switch (type) {
    case "appointment_reminder":
      return !!prefs.appointment_reminders
    case "lab_result_ready":
      return !!prefs.lab_results
    case "prescription_ready":
      return !!prefs.prescription_ready
    case "payment_reminder":
      return !!prefs.payment_reminders
    case "system_alert":
      return !!prefs.system_alerts
    default:
      return false
  }
}

export async function sendSms(phoneNumber: string, message: string): Promise<SmsSendResult> {
  const apiUrl = process.env.SMS_API_URL
  const apiKey = process.env.SMS_API_KEY

  if (!apiUrl || !apiKey) {
    console.warn("[v0] SMS disabled: SMS_API_URL or SMS_API_KEY not set.", { phoneNumber, message })
    return { ok: false, skipped: true, reason: "SMS not configured" }
  }

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ to: phoneNumber, message }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      console.error("[v0] SMS send failed", { status: res.status, body: text })
      return { ok: false, reason: `Provider error ${res.status}` }
    }

    return { ok: true }
  } catch (error) {
    console.error("[v0] SMS send exception", error)
    return { ok: false, reason: "Exception while sending SMS" }
  }
}
