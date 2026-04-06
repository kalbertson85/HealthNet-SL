"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

const MINUTE_MS = 60_000
const DEFAULT_IDLE_TIMEOUT_MINUTES = 30
const WARNING_WINDOW_MINUTES = 2

function getIdleTimeoutMs() {
  const raw = Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES || DEFAULT_IDLE_TIMEOUT_MINUTES)
  const safe = Number.isFinite(raw) && raw >= 5 ? raw : DEFAULT_IDLE_TIMEOUT_MINUTES
  return safe * MINUTE_MS
}

export function SessionIdleGuard() {
  const router = useRouter()
  const supabase = useMemo(() => createBrowserClient(), [])
  const idleTimeoutMs = useMemo(getIdleTimeoutMs, [])
  const warningWindowMs = useMemo(() => Math.min(WARNING_WINDOW_MINUTES * MINUTE_MS, Math.floor(idleTimeoutMs / 2)), [idleTimeoutMs])

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [warningVisible, setWarningVisible] = useState(false)

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current)
      warningTimerRef.current = null
    }
  }, [])

  const handleTimeout = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } catch {
      // Ignore sign-out errors and still force login redirect.
    }
    router.replace("/auth/login?timeout=1")
  }, [router, supabase.auth])

  const resetTimers = useCallback(() => {
    clearTimers()
    setWarningVisible(false)

    warningTimerRef.current = setTimeout(() => {
      setWarningVisible(true)
    }, Math.max(0, idleTimeoutMs - warningWindowMs))

    idleTimerRef.current = setTimeout(() => {
      void handleTimeout()
    }, idleTimeoutMs)
  }, [clearTimers, handleTimeout, idleTimeoutMs, warningWindowMs])

  useEffect(() => {
    const handleActivity = () => resetTimers()

    const activityEvents: Array<keyof WindowEventMap> = [
      "click",
      "keydown",
      "mousemove",
      "scroll",
      "touchstart",
    ]

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, handleActivity, { passive: true })
    }

    resetTimers()

    return () => {
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, handleActivity)
      }
      clearTimers()
    }
  }, [clearTimers, resetTimers])

  if (!warningVisible) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm rounded-md border bg-background p-4 shadow-lg">
      <p className="text-sm font-medium">Session expiring soon</p>
      <p className="mt-1 text-xs text-muted-foreground">
        You have been inactive. Continue working to keep your session active.
      </p>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={resetTimers}>
          Stay signed in
        </Button>
      </div>
    </div>
  )
}
