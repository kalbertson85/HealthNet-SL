import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { redirect } from "next/navigation"
import { startPageRenderTimer } from "@/lib/observability/page-performance"

interface VisitRow {
  id: string
  visit_status: string
  created_at: string
  patients?: {
    id: string
    full_name?: string | null
    patient_number?: string | null
  } | null
  is_free_health_care?: boolean | null
  facilities?: {
    name?: string | null
    code?: string | null
  } | null
}

interface NursingNoteRow {
  id: string
  note_type: string | null
  note: string
  procedure_type: string | null
  performed_at: string
}

export const revalidate = 0
const MAX_ACTIVE_VISITS = 200
const MAX_NOTES_SCAN = 1500

interface NursingPageProps {
  searchParams?: Promise<{ notes_table?: string }>
}

export default async function NursingPage({ searchParams }: NursingPageProps) {
  const pagePerf = startPageRenderTimer("dashboard.nursing")
  const supabase = await createServerClient()
  try {
    const sp = (await searchParams) ?? {}
    const notesTableMissingFromAction = sp.notes_table === "missing"

  const { data: visitsData, error: visitsError } = await supabase
    .from("visits")
    .select(
      `id, visit_status, created_at, is_free_health_care,
       patients(id, full_name, patient_number),
       facilities(name, code)`
    )
    .in("visit_status", ["doctor_pending", "doctor_review", "lab_pending", "billing_pending"])
    .order("created_at", { ascending: false })
    .limit(MAX_ACTIVE_VISITS)

  if (visitsError) {
    console.error("[nursing] Error loading visits for nursing notes:", visitsError.message || visitsError)
  }

  interface RawVisitRow {
    id: string
    visit_status: string
    created_at: string
    is_free_health_care?: boolean | null
    patients?: { id: string; full_name: string | null; patient_number: string | null }[] | null
    facilities?: { name: string | null; code: string | null }[] | null
  }

  // Normalise visit rows so nested relations match VisitRow shape
  const visits: VisitRow[] = (visitsData || []).map((raw) => {
    const v = raw as RawVisitRow
    const patient = (v.patients && v.patients[0]) || null
    const facility = (v.facilities && v.facilities[0]) || null

    return {
      id: v.id,
      visit_status: v.visit_status,
      created_at: v.created_at,
      is_free_health_care: Boolean(v.is_free_health_care ?? false),
      patients: patient
        ? {
            id: patient.id,
            full_name: patient.full_name,
            patient_number: patient.patient_number,
          }
        : null,
      facilities: facility
        ? {
            name: facility.name,
            code: facility.code,
          }
        : null,
    }
  })
    const visitsTruncated = (visitsData?.length || 0) >= MAX_ACTIVE_VISITS
    const visitIds = visits.map((v) => v.id)

    const notesByVisitId = new Map<string, NursingNoteRow[]>()
    let notesTableMissing = notesTableMissingFromAction
    let notesTruncated = false

    if (visitIds.length > 0) {
    const { data: notesData, error: notesError } = await supabase
      .from("visit_nursing_notes")
      .select("id, visit_id, note_type, note, procedure_type, performed_at")
      .in("visit_id", visitIds)
      .order("performed_at", { ascending: false })
      .limit(MAX_NOTES_SCAN)

    if (notesError) {
      const msg = notesError.message || ""
      const missingTable =
        msg.includes("Could not find the table 'public.visit_nursing_notes'") ||
        msg.includes("relation \"public.visit_nursing_notes\" does not exist")
      if (missingTable) {
        notesTableMissing = true
      } else {
        console.error("[nursing] Error loading visit nursing notes:", notesError.message || notesError)
      }
    }

      for (const row of notesData || []) {
      const visitId = (row.visit_id as string | null) ?? null
      if (!visitId) continue
      const arr = notesByVisitId.get(visitId) ?? []
      arr.push({
        id: row.id as string,
        note_type: (row.note_type as string | null) ?? null,
        note: row.note as string,
        procedure_type: (row.procedure_type as string | null) ?? null,
        performed_at: row.performed_at as string,
      })
        notesByVisitId.set(visitId, arr)
      }
      notesTruncated = (notesData?.length || 0) >= MAX_NOTES_SCAN
    }

    async function addNursingNote(formData: FormData) {
    "use server"

    const supabase = await createServerClient()

    const visitId = (formData.get("visit_id") as string | null) ?? null
    const patientId = (formData.get("patient_id") as string | null) ?? null
    const noteType = (formData.get("note_type") as string | null) ?? null
    const procedureType = (formData.get("procedure_type") as string | null) ?? null
    const note = (formData.get("note") as string | null) ?? ""

    if (!visitId || !patientId || !note.trim()) {
      redirect("/dashboard/nursing")
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect("/auth/login")
    }

    const { error } = await supabase.from("visit_nursing_notes").insert({
      visit_id: visitId,
      recorded_by: user.id,
      note_type: noteType || null,
      note,
      procedure_type: procedureType || null,
      performed_at: new Date().toISOString(),
    })

    if (error) {
      const msg = error.message || ""
      const missingTable =
        msg.includes("Could not find the table 'public.visit_nursing_notes'") ||
        msg.includes("relation \"public.visit_nursing_notes\" does not exist")
      if (missingTable) {
        redirect("/dashboard/nursing?notes_table=missing")
      }
      console.error("[nursing] Error adding visit nursing note:", error.message || error)
    }

      redirect("/dashboard/nursing")
    }

    const formatTime = (iso: string) => {
      try {
        return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      } catch {
        return "-"
      }
    }

    pagePerf.done({
      query_count: 2,
      visit_rows: visits.length,
      note_rows: Array.from(notesByVisitId.values()).reduce((sum, rows) => sum + rows.length, 0),
      notes_table_missing: notesTableMissing,
      visits_truncated: visitsTruncated,
      notes_truncated: notesTruncated,
    })

    return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Nursing Notes & Procedures</h1>
          <p className="text-pretty text-muted-foreground">
            Record bedside observations and simple procedures linked to each visit.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/nursing/ward-request">New ward request</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/inpatient">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Inpatient
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active visits</CardTitle>
          <CardDescription>Choose a visit and add nursing notes and procedures.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {visitsTruncated ? (
            <div className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Showing the most recent {MAX_ACTIVE_VISITS} active visits for performance.
            </div>
          ) : null}
          {notesTableMissing ? (
            <div className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Nursing notes table is not available in this database yet. Apply migration
              {" "}
              <code>034_nursing_visit_notes_and_procedures.sql</code>
              {" "}
              to enable note history and saving.
            </div>
          ) : null}
          {notesTruncated ? (
            <div className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Showing the latest {MAX_NOTES_SCAN} nursing note entries across active visits for performance.
            </div>
          ) : null}
          {visits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active visits found.</p>
          ) : (
            visits.map((visit, index) => {
              const notes = notesByVisitId.get(visit.id) || []

              return (
                <div key={visit.id} className="rounded-md border p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{visit.patients?.full_name || "Unknown patient"}</p>
                      <p className="text-xs text-muted-foreground">
                        {(visit.patients?.patient_number || "-") + " | Visit " + new Date(visit.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline">{visit.visit_status}</Badge>
                  </div>

                  {notes.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {notes.slice(0, 3).map((note) => (
                        <div key={note.id} className="rounded border bg-muted/40 px-2 py-1 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {note.procedure_type ? note.procedure_type.replace("_", " ") : note.note_type || "note"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{formatTime(note.performed_at)}</span>
                          </div>
                          <p className="mt-0.5 leading-snug">{note.note}</p>
                        </div>
                      ))}
                      {notes.length > 3 && (
                        <p className="text-[11px] text-muted-foreground">Showing latest 3 of {notes.length} entries.</p>
                      )}
                    </div>
                  )}

                  <form action={addNursingNote} className="mt-2 grid gap-2 md:grid-cols-5 md:items-end">
                    <input type="hidden" name="visit_id" value={visit.id} />
                    {visit.patients?.id && <input type="hidden" name="patient_id" value={visit.patients.id} />}

                    <div className="space-y-1 md:col-span-2">
                      <Label htmlFor={`note-${visit.id}-${index}`}>Note</Label>
                      <Textarea
                        id={`note-${visit.id}-${index}`}
                        name="note"
                        rows={2}
                        placeholder="Observation, response to treatment, wound status, etc."
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`note-type-${visit.id}-${index}`}>Note type</Label>
                      <select
                        id={`note-type-${visit.id}-${index}`}
                        name="note_type"
                        aria-label="Note type"
                        defaultValue="general"
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="general">General</option>
                        <option value="pre_procedure">Pre-procedure</option>
                        <option value="post_procedure">Post-procedure</option>
                        <option value="observation">Observation</option>
                        <option value="incident">Incident</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`procedure-type-${visit.id}-${index}`}>Procedure</Label>
                      <select
                        id={`procedure-type-${visit.id}-${index}`}
                        name="procedure_type"
                        aria-label="Procedure type"
                        defaultValue=""
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">None</option>
                        <option value="injection">Injection</option>
                        <option value="dressing">Dressing</option>
                        <option value="wound_cleaning">Wound cleaning</option>
                        <option value="other">Other procedure</option>
                      </select>
                    </div>

                    <div className="flex justify-end">
                      <Button type="submit" size="sm">
                        Add note
                      </Button>
                    </div>
                  </form>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
    )
  } catch (error) {
    pagePerf.fail(error, { query_count: 2 })
    throw error
  }
}
