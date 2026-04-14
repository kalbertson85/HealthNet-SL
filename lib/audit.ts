import { createServerClient } from "@/lib/supabase/server"
import { getSupabaseAdminClient } from "@/lib/storage"
import type { SessionUserLike } from "@/lib/utils"

export interface AuditEvent {
  action: string
  resourceType?: string
  resourceId?: string
  entityType?: string
  entityId?: string
  user?: SessionUserLike | null
  facilityId?: string | null
  metadata?: Record<string, unknown>
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

function toJsonObject(value: Record<string, unknown> | null | undefined) {
  return value ?? null
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
    const resourceType = event.resourceType ?? event.entityType ?? null
    const resourceId = event.resourceId ?? event.entityId ?? null

    await supabase.from("audit_logs").insert({
      action: event.action,
      resource_type: resourceType,
      resource_id: resourceId,
      entity_type: event.entityType ?? resourceType,
      entity_id: event.entityId ?? resourceId,
      user_id: userId,
      role,
      facility_id: facilityId,
      metadata: event.metadata ?? null,
      before_state: toJsonObject(event.before),
      after_state: toJsonObject(event.after),
    })
  } catch (error) {
    console.error("[v0] Failed to write audit log", error)
  }
}

export async function logSystemAuditEvent(event: AuditEvent) {
  try {
    const supabase = getSupabaseAdminClient()
    const resourceType = event.resourceType ?? event.entityType ?? null
    const resourceId = event.resourceId ?? event.entityId ?? null
    await supabase.from("audit_logs").insert({
      action: event.action,
      resource_type: resourceType,
      resource_id: resourceId,
      entity_type: event.entityType ?? resourceType,
      entity_id: event.entityId ?? resourceId,
      user_id: event.user?.id ?? null,
      role: event.user?.role ?? null,
      facility_id: event.facilityId ?? event.user?.facility_id ?? null,
      metadata: event.metadata ?? null,
      before_state: toJsonObject(event.before),
      after_state: toJsonObject(event.after),
    })
  } catch (error) {
    console.error("[v0] Failed to write system audit log", error)
  }
}
