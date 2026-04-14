"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { enqueueOfflineQueueOperation, type OfflineQueueActionType } from "@/lib/offline-queue-sync"

type QueueActionPayload = {
  type: OfflineQueueActionType | "start_visit"
  department?: string
  queueId?: string
}

export function OfflineQueueActionButton({
  payload,
  label,
  variant = "default",
  size = "sm",
  className,
  disabled,
}: {
  payload: QueueActionPayload
  label: string
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || isPending}
      onClick={async () => {
        if (payload.type !== "start_visit" && typeof navigator !== "undefined" && !navigator.onLine) {
          enqueueOfflineQueueOperation({
            type: payload.type as OfflineQueueActionType,
            department: payload.department,
            queueId: payload.queueId,
          })
          router.refresh()
          return
        }

        setIsPending(true)
        try {
          const response = await fetch("/api/queue/actions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          })

          if (!response.ok) {
            throw new Error("Queue action failed")
          }

          const data = (await response.json().catch(() => null)) as { redirectTo?: string | null } | null
          if (data?.redirectTo) {
            router.push(data.redirectTo)
            return
          }
          router.refresh()
        } catch (error) {
          console.error("[v0] Queue action request failed:", error)
          if (payload.type !== "start_visit") {
            enqueueOfflineQueueOperation({
              type: payload.type as OfflineQueueActionType,
              department: payload.department,
              queueId: payload.queueId,
            })
            router.refresh()
            return
          }
          alert("This queue action could not be completed. Please try again.")
        } finally {
          setIsPending(false)
        }
      }}
    >
      {isPending ? "Working..." : label}
    </Button>
  )
}
