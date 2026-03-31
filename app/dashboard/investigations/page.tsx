import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { redirect } from "next/navigation"

interface VisitRow {
  id: string
  visit_status: string
  patients?: {
    id: string
    full_name?: string | null
    patient_number?: string | null
    date_of_birth?: string | null
  } | Array<{
    id: string
    full_name?: string | null
    patient_number?: string | null
    date_of_birth?: string | null
  }> | null
}

interface InvestigationRow {
  id: string
  visit_id: string
  type: string
  notes: string | null
  status: string
}

export const revalidate = 0

export default async function InvestigationsPage() {
  const supabase = await createServerClient()

  const { data: visitsData, error: visitsError } = await supabase
    .from("visits")
    .select(
      `id, visit_status,
       patients(id, full_name, patient_number, date_of_birth),
       investigations(id, visit_id, type, notes, status)`
    )
    .eq("visit_status", "lab_pending")
    .order("created_at", { ascending: true })

  if (visitsError) {
    console.error("[v0] Error loading investigation visits:", visitsError.message || visitsError)
  }

  const visits = (visitsData || []) as (VisitRow & { investigations?: InvestigationRow[] })[]

  async function completeInvestigation(formData: FormData) {
    "use server"

    const supabase = await createServerClient()

    const investigationId = formData.get("investigation_id") as string
    const visitId = formData.get("visit_id") as string
    const resultNotes = (formData.get("result_notes") as string | null) ?? ""

    if (!investigationId || !visitId) {
      redirect("/dashboard/investigations")
    }

    await supabase
      .from("investigations")
      .update({
        notes: resultNotes,
        status: "completed",
      })
      .eq("id", investigationId)

    // Check if all investigations for this visit are now completed
    const { data: remaining, error: remainingError } = await supabase
      .from("investigations")
      .select("id, status")
      .eq("visit_id", visitId)

    if (remainingError) {
      console.error("[v0] Error checking remaining investigations:", remainingError)
    }

    const allCompleted = (remaining || []).every((inv) => inv.status === "completed")

    if (allCompleted) {
      await supabase
        .from("visits")
        .update({ visit_status: "doctor_review" })
        .eq("id", visitId)
    }

    redirect("/dashboard/investigations")
  }

  const formatAge = (dob?: string | null) => {
    if (!dob) return "-"
    try {
      const birth = new Date(dob)
      const years = Math.floor((Date.now() - birth.getTime()) / 31557600000)
      return `${years}y`
    } catch {
      return "-"
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Investigations</h1>
          <p className="text-pretty text-muted-foreground">
            View and complete pending investigations for lab and imaging.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {visits.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              No visits currently waiting for investigations.
            </CardContent>
          </Card>
        ) : (
          visits.map((visit) => (
            <Card key={visit.id} className="border">
              {(() => {
                const patient = Array.isArray(visit.patients) ? visit.patients[0] : visit.patients
                return (
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-sm font-medium">
                    {patient?.full_name || "Unknown patient"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {patient?.patient_number || "–"} · Age {formatAge(patient?.date_of_birth)}
                  </CardDescription>
                </div>
                <Badge variant="outline">lab_pending</Badge>
              </CardHeader>
                )
              })()}
              <CardContent className="space-y-3 text-sm">
                {(visit.investigations || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No investigations recorded for this visit yet.</p>
                ) : (
                  (visit.investigations || []).map((inv) => (
                    <div key={inv.id} className="rounded-md border px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-xs uppercase tracking-wide">{inv.type}</p>
                          <p className="text-xs text-muted-foreground">Status: {inv.status}</p>
                        </div>
                      </div>

                      {inv.status !== "completed" ? (
                        <form action={completeInvestigation} className="mt-2 space-y-2">
                          <input type="hidden" name="investigation_id" value={inv.id} />
                          <input type="hidden" name="visit_id" value={visit.id} />
                          <div className="space-y-1">
                            <Label htmlFor={`result_notes-${inv.id}`}>Result notes</Label>
                            <Textarea
                              id={`result_notes-${inv.id}`}
                              name="result_notes"
                              rows={2}
                              placeholder="Enter result summary, key findings, etc."
                            />
                          </div>
                          <div className="flex justify-end">
                            <Button type="submit" size="sm">
                              Save result
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div className="mt-2 text-xs text-muted-foreground">
                          <span className="font-medium">Result:</span> {inv.notes || "No notes recorded."}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
