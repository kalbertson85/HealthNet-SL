import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { redirect } from "next/navigation"

interface PatientSummary {
  id: string
  full_name: string | null
  patient_number: string | null
  date_of_birth: string | null
}

interface VisitRow {
  id: string
  visit_status: string
  created_at: string
  is_free_health_care?: boolean
  payer_category?: string | null
  patients?: PatientSummary | null
  facilities?: {
    name?: string | null
    code?: string | null
  } | null
}

interface TriageRow {
  id: string
  visit_id: string | null
  triage_priority: string | null
  bp: string | null
  temperature_c: number | null
  spo2: number | null
  pulse: number | null
  weight_kg: number | null
  created_at: string
}

export const revalidate = 0

export default async function TriagePage(props: {
  searchParams?: Promise<{ error?: string }>
}) {
  const supabase = await createServerClient()

  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const errorCode = resolvedSearchParams?.error

  const errorMessage = (() => {
    switch (errorCode) {
      case "validation":
        return "Some values in the triage form were invalid. Please check vitals and triage level and try again."
      case "unauthorized":
        return "You must be signed in as staff to record triage information."
      default:
        return null
    }
  })()

  // Define today in UTC for visit filtering
  const now = new Date()
  const startOfDay = new Date(now)
  startOfDay.setUTCHours(0, 0, 0, 0)
  const endOfDay = new Date(now)
  endOfDay.setUTCHours(23, 59, 59, 999)

  const { data: visitsData, error: visitsError } = await supabase
    .from("visits")
    .select(
      `id, visit_status, created_at, is_free_health_care, payer_category,
       patients ( id, full_name, patient_number, date_of_birth ),
       facilities(name, code)`
    )
    .gte("created_at", startOfDay.toISOString())
    .lte("created_at", endOfDay.toISOString())
    .neq("visit_status", "completed")
    .order("created_at", { ascending: true })

  if (visitsError) {
    console.error("[triage] Error loading visits for triage:", visitsError.message || visitsError)
  }

  interface RawVisitRow {
    id: string
    visit_status: string
    created_at: string
    is_free_health_care?: boolean | null
    payer_category?: string | null
    patients?: { id: string; full_name: string | null; patient_number: string | null; date_of_birth: string | null }[] | null
    facilities?: { name: string | null; code: string | null }[] | null
  }

  // Normalise types (take the first related patient/facility if arrays are returned)
  const visits: VisitRow[] = (visitsData || []).map((raw) => {
    const v = raw as RawVisitRow
    const patient = (v.patients && v.patients[0]) || null
    const facility = (v.facilities && v.facilities[0]) || null

    return {
      id: v.id,
      visit_status: v.visit_status,
      created_at: v.created_at,
      is_free_health_care: Boolean(v.is_free_health_care ?? false),
      payer_category: v.payer_category ?? null,
      patients: patient
        ? {
            id: patient.id,
            full_name: patient.full_name,
            patient_number: patient.patient_number,
            date_of_birth: patient.date_of_birth,
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

  const visitIds = visits.map((v) => v.id)

  const latestTriageByVisitId = new Map<string, TriageRow>()

  if (visitIds.length > 0) {
    const { data: triageData, error: triageError } = await supabase
      .from("triage_assessments")
      .select("id, visit_id, triage_priority, bp, temperature_c, spo2, pulse, weight_kg, created_at")
      .in("visit_id", visitIds)
      .order("created_at", { ascending: false })

    if (triageError) {
      console.error("[triage] Error loading triage assessments:", triageError.message || triageError)
    }

    for (const row of triageData || []) {
      const visitId = (row.visit_id as string | null) ?? null
      if (!visitId) continue
      if (!latestTriageByVisitId.has(visitId)) {
        latestTriageByVisitId.set(visitId, {
          id: row.id as string,
          visit_id: visitId,
          triage_priority: (row.triage_priority as string | null) ?? null,
          bp: (row.bp as string | null) ?? null,
          temperature_c: (row.temperature_c as number | null) ?? null,
          spo2: (row.spo2 as number | null) ?? null,
          pulse: (row.pulse as number | null) ?? null,
          weight_kg: (row.weight_kg as number | null) ?? null,
          created_at: row.created_at as string,
        })
      }
    }
  }

  async function saveTriage(formData: FormData) {
    "use server"

    const supabase = await createServerClient()

    const visitId = (formData.get("visit_id") as string | null) ?? null
    const patientId = (formData.get("patient_id") as string | null) ?? null
    const priority = (formData.get("triage_priority") as string | null) ?? null
    const bpRaw = (formData.get("bp") as string | null) ?? ""
    const tempRaw = (formData.get("temperature_c") as string | null) ?? ""
    const spo2Raw = (formData.get("spo2") as string | null) ?? ""
    const pulseRaw = (formData.get("pulse") as string | null) ?? ""
    const weightRaw = (formData.get("weight_kg") as string | null) ?? ""

    if (!visitId || !patientId) {
      redirect("/dashboard/triage?error=validation")
    }

    const allowedPriorities = ["emergency", "urgent", "routine"] as const
    if (!priority || !allowedPriorities.includes(priority as (typeof allowedPriorities)[number])) {
      redirect("/dashboard/triage?error=validation")
    }

    const parseOptionalNumber = (value: string): number | null => {
      const trimmed = value.trim()
      if (!trimmed) return null
      const num = Number(trimmed)
      if (!Number.isFinite(num)) {
        throw new Error("invalid_number")
      }
      return num
    }

    let temperatureValue: number | null = null
    let spo2Value: number | null = null
    let pulseValue: number | null = null
    let weightValue: number | null = null

    try {
      temperatureValue = parseOptionalNumber(tempRaw)
      spo2Value = parseOptionalNumber(spo2Raw)
      pulseValue = parseOptionalNumber(pulseRaw)
      weightValue = parseOptionalNumber(weightRaw)
    } catch {
      redirect("/dashboard/triage?error=validation")
    }

    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) {
      redirect("/dashboard/triage?error=unauthorized")
    }

    const actorId = authData.user.id

    const { data: existingTriage, error: existingError } = await supabase
      .from("triage_assessments")
      .select("id, triage_priority")
      .eq("visit_id", visitId)
      .maybeSingle()

    if (existingError && existingError.code !== "PGRST116") {
      console.error("[triage] Error checking existing triage:", existingError.message || existingError)
      redirect("/dashboard/triage?error=validation")
    }

    let triageId: string
    let oldStatus: string | null = null
    let newStatus: string | null = priority
    let action: "created" | "status_updated" | "notes_updated" = "created"

    if (!existingTriage) {
      const { data: inserted, error: insertError } = await supabase
        .from("triage_assessments")
        .insert({
          patient_id: patientId,
          visit_id: visitId,
          triage_priority: priority,
          bp: bpRaw || null,
          temperature_c: temperatureValue,
          spo2: spo2Value,
          pulse: pulseValue,
          weight_kg: weightValue,
          assessed_by: actorId,
        })
        .select("id, triage_priority")
        .single()

      if (insertError || !inserted) {
        console.error("[triage] Error inserting triage assessment:", insertError?.message || insertError)
        redirect("/dashboard/triage?error=validation")
      }

      triageId = inserted.id as string
      newStatus = (inserted.triage_priority as string | null) ?? priority
      action = "created"
    } else {
      oldStatus = (existingTriage.triage_priority as string | null) ?? null

      const { data: updated, error: updateError } = await supabase
        .from("triage_assessments")
        .update({
          triage_priority: priority,
          bp: bpRaw || null,
          temperature_c: temperatureValue,
          spo2: spo2Value,
          pulse: pulseValue,
          weight_kg: weightValue,
          assessed_by: actorId,
        })
        .eq("id", existingTriage.id)
        .select("id, triage_priority")
        .single()

      if (updateError || !updated) {
        console.error("[triage] Error updating triage assessment:", updateError?.message || updateError)
        redirect("/dashboard/triage?error=validation")
      }

      triageId = updated.id as string
      newStatus = (updated.triage_priority as string | null) ?? priority
      action = oldStatus === newStatus ? "notes_updated" : "status_updated"
    }

    const { error: auditError } = await supabase.from("triage_audit_logs").insert({
      triage_id: triageId,
      actor_user_id: actorId,
      action,
      old_status: oldStatus,
      new_status: newStatus,
      notes: null,
    })

    if (auditError) {
      console.error("[triage] Error inserting triage audit log:", auditError.message || auditError)
    }

    redirect("/dashboard/triage")
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

  const triageBadgeVariant = (priority: string | null | undefined): "default" | "secondary" | "destructive" => {
    switch (priority) {
      case "emergency":
        return "destructive"
      case "urgent":
        return "default"
      case "routine":
      default:
        return "secondary"
    }
  }

  return (
    <div className="space-y-8">
      {errorMessage && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Triage (Nursing)</h1>
          <p className="text-pretty text-muted-foreground">
            Capture vital signs and triage level for today&apos;s visits. This helps doctors and nurses quickly see who
            needs attention first.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/queue/opd">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to OPD Queue
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s visits</CardTitle>
          <CardDescription>
            Enter or update triage for each active visit. All fields are optional except triage level.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {visits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active visits for today.</p>
          ) : (
            visits.map((visit) => {
              const triage = latestTriageByVisitId.get(visit.id)

              return (
                <div key={visit.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{visit.patients?.full_name || "Unknown patient"}</p>
                      <p className="text-xs text-muted-foreground">
                        {(visit.patients?.patient_number || "-") + " | Age " + formatAge(visit.patients?.date_of_birth)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs">
                      <Badge variant="outline">{visit.visit_status}</Badge>
                      {visit.is_free_health_care && (
                        <Badge variant="default" className="text-[10px] font-normal">
                          Free Health Care visit
                        </Badge>
                      )}
                      {visit.facilities?.name && (
                        <span className="text-[11px] text-muted-foreground">
                          {visit.facilities.name}
                          {visit.facilities.code ? ` (${visit.facilities.code})` : ""}
                        </span>
                      )}
                      {triage ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <Badge variant={triageBadgeVariant(triage.triage_priority)}>
                            Triage: {triage.triage_priority}
                          </Badge>
                          <p className="text-[11px] text-muted-foreground">
                            {`BP ${triage.bp || "-"} | Temp ${
                              triage.temperature_c ?? "-"
                            }°C | SpO2 ${triage.spo2 ?? "-"}%`}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">No triage recorded yet.</p>
                      )}
                    </div>
                  </div>

                  <form action={saveTriage} className="mt-3 grid gap-3 md:grid-cols-5 md:items-end">
                    <input type="hidden" name="visit_id" value={visit.id} />
                    {visit.patients?.id && <input type="hidden" name="patient_id" value={visit.patients.id} />}

                    <div className="space-y-1">
                      <Label htmlFor={`bp-${visit.id}`}>BP</Label>
                      <Input
                        id={`bp-${visit.id}`}
                        name="bp"
                        defaultValue={triage?.bp ?? ""}
                        placeholder="120/80"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`temp-${visit.id}`}>Temp (°C)</Label>
                      <Input
                        id={`temp-${visit.id}`}
                        name="temperature_c"
                        defaultValue={triage?.temperature_c?.toString() ?? ""}
                        inputMode="decimal"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`spo2-${visit.id}`}>SpO2 (%)</Label>
                      <Input
                        id={`spo2-${visit.id}`}
                        name="spo2"
                        defaultValue={triage?.spo2?.toString() ?? ""}
                        inputMode="numeric"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`pulse-${visit.id}`}>Pulse</Label>
                      <Input
                        id={`pulse-${visit.id}`}
                        name="pulse"
                        defaultValue={triage?.pulse?.toString() ?? ""}
                        inputMode="numeric"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`weight-${visit.id}`}>Weight (kg)</Label>
                      <Input
                        id={`weight-${visit.id}`}
                        name="weight_kg"
                        defaultValue={triage?.weight_kg?.toString() ?? ""}
                        inputMode="decimal"
                      />
                    </div>

                    <div className="space-y-1 md:col-span-2">
                      <Label htmlFor={`priority-${visit.id}`}>Triage level</Label>
                      <select
                        id={`priority-${visit.id}`}
                        name="triage_priority"
                        aria-label="Triage level"
                        defaultValue={triage?.triage_priority ?? ""}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="" disabled>
                          Select level
                        </option>
                        <option value="emergency">Emergency</option>
                        <option value="urgent">Urgent</option>
                        <option value="routine">Routine</option>
                      </select>
                    </div>

                    <div className="flex justify-end md:col-span-3">
                      <Button type="submit" size="sm">
                        Save triage
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
}
