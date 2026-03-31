import { createServerClient } from "@/lib/supabase/server"
import { getSupabaseAdminClient } from "@/lib/storage"
import type { SessionUserLike } from "@/lib/utils"

export interface AuditEvent {
  action: string
  resourceType?: string
  resourceId?: string
  user?: SessionUserLike | null
  facilityId?: string | null
  metadata?: Record<string, unknown>
}

export async function logAuditEvent(event: AuditEvent) {
  try {
    const supabase = await createServerClient()

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    const userId = event.user?.id ?? authUser?.id ?? null
    const role = event.user?.role ?? null
    const facilityId = event.facilityId ?? event.user?.facility_id ?? null

    await supabase.from("audit_logs").insert({
      action: event.action,
      resource_type: event.resourceType ?? null,
      resource_id: event.resourceId ?? null,
      user_id: userId,
      role,
      facility_id: facilityId,
      metadata: event.metadata ?? null,
    })
  } catch (error) {
    console.error("[v0] Failed to write audit log", error)
  }
}

export async function logSystemAuditEvent(event: AuditEvent) {
  try {
    const supabase = getSupabaseAdminClient()
    await supabase.from("audit_logs").insert({
      action: event.action,
      resource_type: event.resourceType ?? null,
      resource_id: event.resourceId ?? null,
      user_id: event.user?.id ?? null,
      role: event.user?.role ?? null,
      facility_id: event.facilityId ?? event.user?.facility_id ?? null,
      metadata: event.metadata ?? null,
    })
  } catch (error) {
    console.error("[v0] Failed to write system audit log", error)
  }
}
