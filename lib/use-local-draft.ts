"use client"

import { useEffect, useRef, useState } from "react"

const DRAFT_VERSION = 1
const DRAFT_TTL_MS = 72 * 60 * 60 * 1000

interface StoredDraft<T> {
  version: number
  savedAt: number
  data: T
}

export function useLocalDraft<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue)
  const [hasHydrated, setHasHydrated] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const skipNextSaveRef = useRef(true)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) {
        setHasHydrated(true)
        return
      }

      const parsed = JSON.parse(raw) as StoredDraft<T>
      const isExpired = !parsed?.savedAt || Date.now() - parsed.savedAt > DRAFT_TTL_MS
      if (parsed?.version !== DRAFT_VERSION || isExpired) {
        window.localStorage.removeItem(key)
        setHasHydrated(true)
        return
      }

      setValue(parsed.data)
      setLastSavedAt(parsed.savedAt)
    } catch {
      window.localStorage.removeItem(key)
    } finally {
      setHasHydrated(true)
    }
  }, [key])

  useEffect(() => {
    if (!hasHydrated) return

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }

    const timeoutId = window.setTimeout(() => {
      const payload: StoredDraft<T> = {
        version: DRAFT_VERSION,
        savedAt: Date.now(),
        data: value,
      }
      window.localStorage.setItem(key, JSON.stringify(payload))
      setLastSavedAt(payload.savedAt)
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [hasHydrated, key, value])

  const clearDraft = () => {
    window.localStorage.removeItem(key)
    setLastSavedAt(null)
  }

  const resetDraft = () => {
    clearDraft()
    skipNextSaveRef.current = true
    setValue(initialValue)
  }

  return {
    value,
    setValue,
    hasHydrated,
    lastSavedAt,
    clearDraft,
    resetDraft,
  }
}
