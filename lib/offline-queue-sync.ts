"use client"

export type OfflineQueueActionType = "call_next" | "complete" | "cancel"

export type OfflineQueueOperation = {
  id: string
  type: OfflineQueueActionType
  department?: string
  queueId?: string
  createdAt: number
}

const STORAGE_KEY = "offline-sync:queue-actions"

function isBrowser() {
  return typeof window !== "undefined"
}

export function listOfflineQueueOperations(): OfflineQueueOperation[] {
  if (!isBrowser()) return []
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as OfflineQueueOperation[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return []
  }
}

function saveOfflineQueueOperations(operations: OfflineQueueOperation[]) {
  if (!isBrowser()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(operations))
  window.dispatchEvent(new CustomEvent("offline-queue-sync:changed"))
}

export function enqueueOfflineQueueOperation(operation: Omit<OfflineQueueOperation, "id" | "createdAt">) {
  const next: OfflineQueueOperation = {
    ...operation,
    id: `${operation.type}:${operation.queueId ?? operation.department ?? "unknown"}:${Date.now()}`,
    createdAt: Date.now(),
  }
  saveOfflineQueueOperations([...listOfflineQueueOperations(), next])
}

async function postQueueAction(operation: OfflineQueueOperation) {
  const response = await fetch("/api/queue/actions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: operation.type,
      department: operation.department,
      queueId: operation.queueId,
    }),
  })

  const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: { code?: string } } | null

  if (response.ok) {
    return { ok: true as const }
  }

  const code = payload?.error?.code ?? "queue_action_failed"
  const discard = response.status === 404 || response.status === 409
  return { ok: false as const, discard, code }
}

export async function syncOfflineQueueOperations(): Promise<{
  synced: number
  discarded: number
  remaining: number
}> {
  if (!isBrowser()) {
    return { synced: 0, discarded: 0, remaining: 0 }
  }

  const operations = listOfflineQueueOperations()
  if (operations.length === 0) {
    return { synced: 0, discarded: 0, remaining: 0 }
  }

  const remaining: OfflineQueueOperation[] = []
  let synced = 0
  let discarded = 0

  for (const operation of operations) {
    try {
      const result = await postQueueAction(operation)
      if (result.ok) {
        synced += 1
        continue
      }
      if (result.discard) {
        discarded += 1
        continue
      }
      remaining.push(operation)
    } catch {
      remaining.push(operation)
      break
    }
  }

  saveOfflineQueueOperations(remaining)
  return { synced, discarded, remaining: remaining.length }
}

export function subscribeOfflineQueueOperations(callback: () => void) {
  if (!isBrowser()) return () => undefined

  const handler = () => callback()
  window.addEventListener("storage", handler)
  window.addEventListener("offline-queue-sync:changed", handler as EventListener)
  return () => {
    window.removeEventListener("storage", handler)
    window.removeEventListener("offline-queue-sync:changed", handler as EventListener)
  }
}
