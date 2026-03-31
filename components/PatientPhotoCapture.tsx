"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface PatientPhotoCaptureProps {
  patientId: string
  initialPhotoUrl?: string | null
  className?: string
}

export function PatientPhotoCapture({ patientId, initialPhotoUrl, className }: PatientPhotoCaptureProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialPhotoUrl ?? null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    const localUrl = URL.createObjectURL(file)
    setPreviewUrl(localUrl)

    const formData = new FormData()
    formData.append("patientId", patientId)
    formData.append("file", file)

    startTransition(async () => {
      try {
        const res = await fetch("/api/patients/photo", {
          method: "POST",
          body: formData,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => null)
          setError(data?.error || "Failed to upload photo")
          return
        }

        const data = (await res.json()) as { photoUrl?: string }
        if (data.photoUrl) {
          setPreviewUrl(data.photoUrl)
        }
      } catch (e) {
        console.error("[v0] Error uploading patient photo", e)
        setError("Error uploading photo. Please try again.")
      }
    })
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 overflow-hidden rounded-full border bg-muted">
          {previewUrl ? (
            <Image src={previewUrl} alt="Patient photo" fill className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              No photo
            </div>
          )}
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Patient photo</p>
          <p>Used on patient profile and printed documents.</p>
          <div className="flex items-center gap-2">
            <Input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="max-w-[220px] cursor-pointer text-xs"
              disabled={isPending}
            />
            {isPending && (
              <span className="text-[11px] text-muted-foreground">Uploading...</span>
            )}
          </div>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
