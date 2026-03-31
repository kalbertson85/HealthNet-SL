import { createClient as createSupabaseClient } from "@supabase/supabase-js"

export type ReplayRegisterResult = "registered" | "duplicate" | "unavailable"
const REPLAY_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000
const REPLAY_CLEANUP_LAST_RUN_KEY = "__hmsReplayCleanupLastRun__"

type SupabaseLikeError = {
  code?: string | null
  message?: string | null
}

function isDuplicateError(error: SupabaseLikeError | null | undefined): boolean {
  if (!error) return false
  if (error.code === "23505") return true
  const message = (error.message || "").toLowerCase()
  return message.includes("duplicate key")
}

export async function registerWebhookReplayEvent(provider: string, eventId: string): Promise<ReplayRegisterResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return "unavailable"

  try {
    const supabase = createSupabaseClient(url, serviceRoleKey)
    const { error } = await supabase.from("webhook_replay_events").insert({
      provider,
      event_id: eventId,
    })

    if (!error) return "registered"
    if (isDuplicateError(error)) return "duplicate"
    return "unavailable"
  } catch {
    return "unavailable"
  }
}

function shouldRunCleanup(nowMs: number): boolean {
  const globalObj = globalThis as unknown as { [REPLAY_CLEANUP_LAST_RUN_KEY]?: number }
  const lastRun = globalObj[REPLAY_CLEANUP_LAST_RUN_KEY] ?? 0
  if (nowMs - lastRun < REPLAY_CLEANUP_INTERVAL_MS) return false
  globalObj[REPLAY_CLEANUP_LAST_RUN_KEY] = nowMs
  return true
}

export async function maybeCleanupWebhookReplayEvents(maxAgeDays = 30): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return

  const nowMs = Date.now()
  if (!shouldRunCleanup(nowMs)) return

  const before = new Date(nowMs - maxAgeDays * 24 * 60 * 60 * 1000).toISOString()

  try {
    const supabase = createSupabaseClient(url, serviceRoleKey)
    const { error } = await supabase
      .from("webhook_replay_events")
      .delete()
      .lt("created_at", before)
    if (error) {
      console.error("[v0] Failed cleaning webhook replay events", error.message || error)
    }
  } catch (error) {
    console.error("[v0] Failed cleaning webhook replay events", error)
  }
}
