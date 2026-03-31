import { z } from "zod"

export const MAX_SYNC_OPERATIONS = 100
export const MAX_OPERATION_PAYLOAD_BYTES = 32 * 1024

const operationSchema = z
  .object({
    type: z.string().trim().min(1).max(100),
  })
  .passthrough()

export const syncOperationsInputSchema = z.union([operationSchema, z.array(operationSchema).min(1).max(MAX_SYNC_OPERATIONS)])

export type SyncQueueRow = {
  user_id: string
  operation_type: string
  payload: Record<string, unknown>
}

export function buildSyncQueueRows(userId: string, body: unknown): SyncQueueRow[] {
  const parsed = syncOperationsInputSchema.parse(body)
  const operations = Array.isArray(parsed) ? parsed : [parsed]

  return operations.map((operation) => {
    const payload = operation as Record<string, unknown>
    const payloadBytes = Buffer.byteLength(JSON.stringify(payload), "utf8")
    if (payloadBytes > MAX_OPERATION_PAYLOAD_BYTES) {
      throw new Error("Operation payload is too large")
    }

    return {
      user_id: userId,
      operation_type: operation.type,
      payload,
    }
  })
}
