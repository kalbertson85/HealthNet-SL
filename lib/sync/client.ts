// Minimal client-side helper stub for offline/PWA sync.
// In a real PWA, this would be called when offline operations are performed
// and later flushed to /api/sync/queue when connectivity is restored.

export interface OfflineOperation {
  type: string
  payload: Record<string, unknown>
}

export async function queueOfflineOperation(operation: OfflineOperation) {
  try {
    const res = await fetch("/api/sync/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(operation),
    })

    if (!res.ok) {
      // For now we just log; in a full PWA we would store locally (IndexedDB) and retry.
      console.error("[v0] Failed to queue offline operation", res.status)
    }
  } catch (error) {
    console.error("[v0] Error queuing offline operation", error)
  }
}
