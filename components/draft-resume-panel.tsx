"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatDateTime, type GlobalSettingsInput } from "@/lib/locale-format"

interface StoredDraftEnvelope {
  savedAt?: number
}

interface KnownDraft {
  key: string
  title: string
  description: string
  href: string
}

interface DraftEntry extends KnownDraft {
  savedAt: number
}

const KNOWN_DRAFTS: KnownDraft[] = [
  { key: "draft:patients:new", title: "Patient registration", description: "Resume unfinished patient registration.", href: "/dashboard/patients/new" },
  { key: "draft:appointments:new", title: "Appointment", description: "Resume unfinished appointment scheduling.", href: "/dashboard/appointments/new" },
  { key: "draft:billing:new", title: "Invoice", description: "Resume unfinished billing entry.", href: "/dashboard/billing/new" },
  { key: "draft:prescriptions:new", title: "Prescription", description: "Resume unfinished prescription drafting.", href: "/dashboard/prescriptions/new" },
  { key: "draft:emergency:new", title: "Emergency triage", description: "Resume unfinished emergency intake.", href: "/dashboard/emergency/new" },
  { key: "draft:inpatient:new", title: "Admission", description: "Resume unfinished inpatient admission.", href: "/dashboard/inpatient/new" },
  { key: "draft:surgery:new", title: "Surgery", description: "Resume unfinished surgery record.", href: "/dashboard/surgery/new" },
  { key: "draft:pharmacy:new", title: "Medication", description: "Resume unfinished medication and stock entry.", href: "/dashboard/pharmacy/new" },
  { key: "draft:lab:new", title: "Lab order", description: "Resume unfinished lab test order.", href: "/dashboard/lab/new" },
]

export function DraftResumePanel({ settings }: { settings?: GlobalSettingsInput }) {
  const [drafts, setDrafts] = useState<DraftEntry[]>([])

  useEffect(() => {
    const loadDrafts = () => {
      const nextDrafts: DraftEntry[] = []

      for (const draft of KNOWN_DRAFTS) {
        try {
          const raw = window.localStorage.getItem(draft.key)
          if (!raw) continue
          const parsed = JSON.parse(raw) as StoredDraftEnvelope | null
          if (!parsed?.savedAt || !Number.isFinite(parsed.savedAt)) continue
          nextDrafts.push({ ...draft, savedAt: parsed.savedAt })
        } catch {
          continue
        }
      }

      nextDrafts.sort((left, right) => right.savedAt - left.savedAt)
      setDrafts(nextDrafts)
    }

    loadDrafts()
    window.addEventListener("focus", loadDrafts)
    return () => window.removeEventListener("focus", loadDrafts)
  }, [])

  const summary = useMemo(() => `${drafts.length} saved draft${drafts.length === 1 ? "" : "s"} ready to resume`, [drafts.length])

  if (drafts.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resume Drafts</CardTitle>
        <CardDescription>{summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {drafts.map((draft) => (
          <div key={draft.key} className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">{draft.title}</p>
              <p className="text-sm text-muted-foreground">{draft.description}</p>
              <p className="text-xs text-muted-foreground">Last saved {formatDateTime(new Date(draft.savedAt), settings)}</p>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={draft.href}>Resume</Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  window.localStorage.removeItem(draft.key)
                  setDrafts((current) => current.filter((entry) => entry.key !== draft.key))
                }}
              >
                Discard
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
