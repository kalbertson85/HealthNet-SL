"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  listOfflineQueueOperations,
  subscribeOfflineQueueOperations,
  syncOfflineQueueOperations,
} from "@/lib/offline-queue-sync"

export function OfflineSyncStatus() {
  const [pendingCount, setPendingCount] = useState(0)
  const [online, setOnline] = useState(true)
  const [lastMessage, setLastMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const refresh = useMemo(
    () => () => {
      setPendingCount(listOfflineQueueOperations().length)
      setOnline(typeof navigator === "undefined" ? true : navigator.onLine)
    },
    [],
  )

  useEffect(() => {
    refresh()
    const unsubscribe = subscribeOfflineQueueOperations(refresh)
    const handleOnline = () => {
      refresh()
      startTransition(async () => {
        const result = await syncOfflineQueueOperations()
        refresh()
        if (result.synced || result.discarded) {
          setLastMessage(
            `Synced ${result.synced} queued action${result.synced === 1 ? "" : "s"}${result.discarded ? `, skipped ${result.discarded} stale action${result.discarded === 1 ? "" : "s"}` : ""}.`,
          )
        }
      })
    }
    const handleOffline = () => refresh()
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      unsubscribe()
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [refresh])

  if (pendingCount === 0 && online) {
    return null
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-medium">{online ? "Queue sync pending" : "Offline queue mode"}</p>
          <p className="text-xs text-amber-800/80">
            {online
              ? `${pendingCount} queue action${pendingCount === 1 ? "" : "s"} waiting to sync.`
              : "Queue actions will be saved on this device and retried automatically when the connection returns."}
            {lastMessage ? ` ${lastMessage}` : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!online || pendingCount === 0 || isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await syncOfflineQueueOperations()
              refresh()
              setLastMessage(
                result.synced || result.discarded
                  ? `Synced ${result.synced} queued action${result.synced === 1 ? "" : "s"}${result.discarded ? `, skipped ${result.discarded} stale action${result.discarded === 1 ? "" : "s"}` : ""}.`
                  : "No queued actions were synced."
              )
            })
          }
        >
          {isPending ? "Syncing..." : "Retry sync"}
        </Button>
      </div>
    </div>
  )
}
