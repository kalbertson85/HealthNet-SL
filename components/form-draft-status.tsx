"use client"

import { Button } from "@/components/ui/button"

export function FormDraftStatus({
  title = "Offline draft",
  description = "Your progress is saved locally on this device.",
  lastSavedAt,
  onClear,
}: {
  title?: string
  description?: string
  lastSavedAt: number | null
  onClear: () => void
}) {
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-xs text-blue-800/80">
            {description}
            {lastSavedAt ? ` Last saved ${new Date(lastSavedAt).toLocaleTimeString()}.` : ""}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onClear}>
          Clear local draft
        </Button>
      </div>
    </div>
  )
}
