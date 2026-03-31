export type QueueStatus = "waiting" | "in_progress" | "completed" | "cancelled"

const ALLOWED_QUEUE_TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  waiting: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
}

export function canTransitionQueueStatus(from: QueueStatus, to: QueueStatus): boolean {
  if (from === to) return true
  return ALLOWED_QUEUE_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertQueueTransition(from: QueueStatus, to: QueueStatus): void {
  if (!canTransitionQueueStatus(from, to)) {
    throw new Error(`Invalid queue status transition: ${from} -> ${to}`)
  }
}
