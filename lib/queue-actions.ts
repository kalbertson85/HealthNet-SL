import type { SupabaseClient } from "@supabase/supabase-js"
import { assertQueueTransition, type QueueStatus } from "@/lib/queues"
import { ensureActiveVisitForPatient } from "@/lib/visit-flow"

type QueueActionResult =
  | { ok: true; redirectTo?: string | null }
  | { ok: false; code: "not_found" | "invalid_state" | "unauthorized" | "forbidden" | "invalid_department"; message: string }

async function getPatientFacilityMap(supabase: SupabaseClient, patientIds: string[]): Promise<Map<string, string | null>> {
  if (patientIds.length === 0) return new Map()
  const { data: patients } = await supabase
    .from("patients")
    .select("id, facility_id")
    .in("id", Array.from(new Set(patientIds)))
  const map = new Map<string, string | null>()
  for (const row of (patients || []) as Array<{ id: string; facility_id?: string | null }>) {
    map.set(row.id, row.facility_id ?? null)
  }
  return map
}

function canAccessFacility(actorFacilityId: string | null | undefined, recordFacilityId: string | null | undefined, isGlobalAdmin?: boolean) {
  if (isGlobalAdmin) return true
  if (!actorFacilityId) return true
  if (!recordFacilityId) return true
  return actorFacilityId === recordFacilityId
}

export async function callNextQueuePatient(
  supabase: SupabaseClient,
  department: string,
  actorUserId?: string | null,
  actorFacilityId?: string | null,
  isGlobalAdmin?: boolean,
): Promise<QueueActionResult> {
  const rpcResult = await supabase.rpc("queue_call_next_transactional", {
    p_department: department,
    p_actor_user_id: actorUserId ?? null,
    p_actor_facility_id: actorFacilityId ?? null,
    p_is_global_admin: Boolean(isGlobalAdmin),
  })

  if (!rpcResult.error) {
    const payload = (rpcResult.data || null) as
      | { ok?: boolean; code?: "not_found" | "forbidden" | "invalid_state"; message?: string }
      | null
      | undefined

    if (payload?.ok) {
      return { ok: true }
    }

    if (payload && payload.ok === false) {
      const code = payload.code || "invalid_state"
      return {
        ok: false,
        code,
        message: payload.message || "Unable to process queue action.",
      }
    }
  } else {
    const rpcErrorCode = String((rpcResult.error as { code?: string } | null)?.code || "")
    if (rpcErrorCode !== "42883") {
      throw rpcResult.error
    }
  }

  const { data: queueRows } = await supabase
    .from("queues")
    .select("id, status, queue_number, patient_id")
    .eq("department", department)
    .eq("status", "waiting")
    .order("priority", { ascending: false })
    .order("check_in_time", { ascending: true })
    .limit(50)

  const rows = (queueRows || []) as Array<{ id: string; status: string | null; queue_number: string | null; patient_id: string | null }>
  if (rows.length === 0) {
    return { ok: false, code: "not_found", message: "No waiting patient found for this department." }
  }

  const patientFacilityMap = await getPatientFacilityMap(
    supabase,
    rows.map((row) => row.patient_id).filter((value): value is string => Boolean(value)),
  )

  const nextQueue =
    rows.find((row) => canAccessFacility(actorFacilityId, patientFacilityMap.get(row.patient_id || ""), isGlobalAdmin)) ?? null

  if (!nextQueue) {
    return { ok: false, code: "forbidden", message: "No queue items available for your facility." }
  }

  const currentStatus = (nextQueue.status as QueueStatus | null) ?? null
  if (!currentStatus) {
    return { ok: false, code: "invalid_state", message: "Queue item is missing a valid current state." }
  }

  try {
    assertQueueTransition(currentStatus, "in_progress")
  } catch {
    return { ok: false, code: "invalid_state", message: "Queue item is no longer in a compatible state." }
  }

  const { error: updateError } = await supabase
    .from("queues")
    .update({
      status: "in_progress",
      called_time: new Date().toISOString(),
    })
    .eq("id", nextQueue.id)

  if (updateError) {
    throw updateError
  }

  const { error: auditInsertError } = await supabase.from("queue_audit_logs").insert({
    queue_id: nextQueue.id,
    action: "call_next",
    old_status: currentStatus,
    new_status: "in_progress",
    actor_user_id: actorUserId ?? null,
  })
  if (auditInsertError) {
    throw auditInsertError
  }

  const { error: settingsUpdateError } = await supabase
    .from("queue_settings")
    .update({ current_serving: nextQueue.queue_number })
    .eq("department", department)
  if (settingsUpdateError) {
    throw settingsUpdateError
  }

  return { ok: true }
}

export async function completeQueueEntry(
  supabase: SupabaseClient,
  queueId: string,
  actorUserId?: string | null,
  actorFacilityId?: string | null,
  isGlobalAdmin?: boolean,
): Promise<QueueActionResult> {
  const { data: existing } = await supabase
    .from("queues")
    .select("id, status, patient_id")
    .eq("id", queueId)
    .maybeSingle()

  const currentStatus = (existing?.status as QueueStatus | null) ?? null
  if (!existing || !currentStatus) {
    return { ok: false, code: "not_found", message: "Queue item could not be found." }
  }

  const patientId = (existing.patient_id as string | null) ?? null
  const patientFacilityMap = await getPatientFacilityMap(supabase, patientId ? [patientId] : [])
  if (!canAccessFacility(actorFacilityId, patientFacilityMap.get(patientId || ""), isGlobalAdmin)) {
    return { ok: false, code: "forbidden", message: "Queue item belongs to another facility." }
  }

  try {
    assertQueueTransition(currentStatus, "completed")
  } catch {
    return { ok: false, code: "invalid_state", message: "Queue item is no longer in a compatible state." }
  }

  const { error: updateError } = await supabase
    .from("queues")
    .update({
      status: "completed",
      completed_time: new Date().toISOString(),
    })
    .eq("id", queueId)

  if (updateError) {
    throw updateError
  }

  const { error: auditInsertError } = await supabase.from("queue_audit_logs").insert({
    queue_id: queueId,
    action: "complete",
    old_status: currentStatus,
    new_status: "completed",
    actor_user_id: actorUserId ?? null,
  })
  if (auditInsertError) {
    throw auditInsertError
  }

  return { ok: true }
}

export async function cancelQueueEntry(
  supabase: SupabaseClient,
  queueId: string,
  actorUserId?: string | null,
  actorFacilityId?: string | null,
  isGlobalAdmin?: boolean,
): Promise<QueueActionResult> {
  const { data: existing } = await supabase
    .from("queues")
    .select("id, status, patient_id")
    .eq("id", queueId)
    .maybeSingle()

  const currentStatus = (existing?.status as QueueStatus | null) ?? null
  if (!existing || !currentStatus) {
    return { ok: false, code: "not_found", message: "Queue item could not be found." }
  }

  const patientId = (existing.patient_id as string | null) ?? null
  const patientFacilityMap = await getPatientFacilityMap(supabase, patientId ? [patientId] : [])
  if (!canAccessFacility(actorFacilityId, patientFacilityMap.get(patientId || ""), isGlobalAdmin)) {
    return { ok: false, code: "forbidden", message: "Queue item belongs to another facility." }
  }

  try {
    assertQueueTransition(currentStatus, "cancelled")
  } catch {
    return { ok: false, code: "invalid_state", message: "Queue item is no longer in a compatible state." }
  }

  const { error: updateError } = await supabase.from("queues").update({ status: "cancelled" }).eq("id", queueId)
  if (updateError) {
    throw updateError
  }

  const { error: auditInsertError } = await supabase.from("queue_audit_logs").insert({
    queue_id: queueId,
    action: "cancel",
    old_status: currentStatus,
    new_status: "cancelled",
    actor_user_id: actorUserId ?? null,
  })
  if (auditInsertError) {
    throw auditInsertError
  }

  return { ok: true }
}

export async function startOrContinueVisitForQueueEntry(
  supabase: SupabaseClient,
  queueId: string,
  actorUserId?: string | null,
  actorFacilityId?: string | null,
  isGlobalAdmin?: boolean,
): Promise<QueueActionResult> {
  if (!actorUserId) {
    return { ok: false, code: "unauthorized", message: "Authenticated user is required." }
  }

  const { data: queue } = await supabase
    .from("queues")
    .select("id, patient_id, department, visit_id")
    .eq("id", queueId)
    .maybeSingle()

  if (!queue) {
    return { ok: false, code: "not_found", message: "Queue item could not be found." }
  }

  const department = queue.department as string | null
  const patientId = queue.patient_id as string | null

  if (!department || !patientId) {
    return { ok: false, code: "invalid_state", message: "Queue item is missing a linked patient or department." }
  }

  const patientFacilityMap = await getPatientFacilityMap(supabase, [patientId])
  if (!canAccessFacility(actorFacilityId, patientFacilityMap.get(patientId), isGlobalAdmin)) {
    return { ok: false, code: "forbidden", message: "Queue item belongs to another facility." }
  }

  if (department !== "opd") {
    return { ok: false, code: "invalid_department", message: "Only OPD queue items can start or continue a visit." }
  }

  let visitId = (queue.visit_id as string | null) ?? null

  if (!visitId) {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const { data: existingVisit } = await supabase
      .from("visits")
      .select("id")
      .eq("patient_id", patientId)
      .gte("created_at", startOfDay.toISOString())
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (existingVisit?.id) {
      visitId = existingVisit.id as string
    } else {
      visitId = await ensureActiveVisitForPatient(supabase, patientId, { facilityCode: "opd" })
    }

    if (!visitId) {
      return { ok: false, code: "invalid_state", message: "Unable to create or locate an active visit for this patient." }
    }

    const { error: queueUpdateError } = await supabase.from("queues").update({ visit_id: visitId }).eq("id", queueId)
    if (queueUpdateError) {
      throw queueUpdateError
    }
  }

  return { ok: true, redirectTo: `/dashboard/records/visit/${visitId}` }
}
