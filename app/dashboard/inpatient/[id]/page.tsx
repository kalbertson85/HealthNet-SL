import { createServerClient } from "@/lib/supabase/server"
import { notFound, redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { AlertCircle } from "lucide-react"
import { assertVisitTransition, type VisitStatus } from "@/lib/visits"

interface Vital {
  id: string
  recorded_at: string
  blood_pressure_systolic: number | null
  blood_pressure_diastolic: number | null
  pulse_rate: number | null
  temperature: number | null
  oxygen_saturation: number | null
}

interface NursingNote {
  id: string
  admission_id: string
  recorded_by: string | null
  note_type: string | null
  note: string
  created_at: string
}

interface AdmissionDetailRow {
  id: string
  admission_number: string
  admission_date: string
  admission_reason: string | null
  diagnosis: string | null
  treatment_plan: string | null
  discharge_date: string | null
  discharge_summary: string | null
  discharge_instructions: string | null
  emergency_admission: boolean | null
  status: string
  bed_id: string | null
  ward_id: string | null
  visit_id: string | null
  patients?:
    | {
        full_name?: string | null
        patient_number?: string | null
        phone_number?: string | null
      }
    | Array<{
        full_name?: string | null
        patient_number?: string | null
        phone_number?: string | null
      }>
    | null
  wards?:
    | {
        name?: string | null
        ward_number?: string | null
      }
    | Array<{
        name?: string | null
        ward_number?: string | null
      }>
    | null
  beds?:
    | {
        bed_number?: string | null
        bed_type?: string | null
      }
    | Array<{
        bed_number?: string | null
        bed_type?: string | null
      }>
    | null
  profiles?:
    | {
        full_name?: string | null
      }
    | Array<{
        full_name?: string | null
      }>
    | null
  visits?:
    | {
        is_free_health_care?: boolean | null
        facilities?:
          | {
              name?: string | null
              code?: string | null
            }
          | Array<{
              name?: string | null
              code?: string | null
            }>
          | null
      }
    | Array<{
        is_free_health_care?: boolean | null
        facilities?:
          | {
              name?: string | null
              code?: string | null
            }
          | Array<{
              name?: string | null
              code?: string | null
            }>
          | null
      }>
    | null
}

function normalizeSingle<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null
  return Array.isArray(relation) ? (relation[0] ?? null) : relation
}

export default async function AdmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createServerClient()

  const { data: admission } = await supabase
    .from("admissions")
    .select(`
      id, admission_number, admission_date, admission_reason, diagnosis, treatment_plan,
      discharge_date, discharge_summary, discharge_instructions,
      emergency_admission, status, bed_id, ward_id, visit_id,
      patients(full_name, patient_number, phone_number),
      wards(name, ward_number),
      beds(bed_number, bed_type),
      profiles(full_name),
      visits(is_free_health_care, facilities(name, code))
    `)
    .eq("id", id)
    .single()

  if (!admission) {
    notFound()
  }
  const admissionRow = admission as AdmissionDetailRow
  const admissionPatient = normalizeSingle(admissionRow.patients)
  const admissionWard = normalizeSingle(admissionRow.wards)
  const admissionBed = normalizeSingle(admissionRow.beds)
  const admissionDoctor = normalizeSingle(admissionRow.profiles)
  const admissionVisit = normalizeSingle(admissionRow.visits)
  const admissionFacility = normalizeSingle(admissionVisit?.facilities)

  // Fetch vitals
  const { data: vitals } = await supabase
    .from("admission_vitals")
    .select(
      "id, recorded_at, blood_pressure_systolic, blood_pressure_diastolic, pulse_rate, temperature, oxygen_saturation",
    )
    .eq("admission_id", id)
    .order("recorded_at", { ascending: false })
    .limit(5)

  const { data: nursingNotes } = await supabase
    .from("nursing_notes")
    .select("id, admission_id, recorded_by, note_type, note, created_at")
    .eq("admission_id", id)
    .order("created_at", { ascending: false })
    .limit(20)

  // Debug context: look up the linked visit metadata so power users can inspect routing
  let visitMeta: {
    id: string
    facility_id: string | null
    payer_category: string | null
    is_free_health_care: boolean | null
  } | null = null

  if (admissionRow.visit_id) {
    const { data } = await supabase
      .from("visits")
      .select("id, facility_id, payer_category, is_free_health_care")
      .eq("id", admissionRow.visit_id as string)
      .maybeSingle()

    visitMeta = (data || null) as {
      id: string
      facility_id: string | null
      payer_category: string | null
      is_free_health_care: boolean | null
    } | null
  }

  async function addNursingNote(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const note = (formData.get("note") as string) || ""
    const noteType = (formData.get("note_type") as string) || null

    if (!note.trim()) {
      redirect(`/dashboard/inpatient/${id}`)
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    await supabase.from("nursing_notes").insert({
      admission_id: id,
      note,
      note_type: noteType,
      recorded_by: user?.id ?? null,
    })

    redirect(`/dashboard/inpatient/${id}`)
  }

  async function discharge(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const dischargeSummary = formData.get("discharge_summary") as string
    const dischargeInstructions = formData.get("discharge_instructions") as string

    // Update admission
    await supabase
      .from("admissions")
      .update({
        status: "discharged",
        discharge_date: new Date().toISOString(),
        discharge_summary: dischargeSummary,
        discharge_instructions: dischargeInstructions,
      })
      .eq("id", id)

    // Update bed status
    await supabase.from("beds").update({ status: "available" }).eq("id", admissionRow.bed_id)

    // Update ward available beds
    const { data: ward } = await supabase.from("wards").select("available_beds").eq("id", admissionRow.ward_id).single()

    if (ward) {
      await supabase
        .from("wards")
        .update({ available_beds: (ward.available_beds || 0) + 1 })
        .eq("id", admissionRow.ward_id)
    }

    // If this admission is linked to a visit, reflect completion on that visit
    const visitId = (admissionRow.visit_id as string | null) ?? null
    if (visitId) {
      const { data: beforeVisit } = await supabase
        .from("visits")
        .select("visit_status")
        .eq("id", visitId)
        .maybeSingle()

      const currentStatus = (beforeVisit?.visit_status as VisitStatus | null) ?? null

      if (currentStatus) {
        try {
          assertVisitTransition(currentStatus, "completed")
          await supabase.from("visits").update({ visit_status: "completed" }).eq("id", visitId)
        } catch (err) {
          console.error("[inpatient] Invalid visit status transition on discharge", {
            visitId,
            from: currentStatus,
            to: "completed",
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    redirect(`/dashboard/inpatient/${id}`)
  }

  const daysAdmitted = admissionRow.admission_date
    ? Math.floor((new Date().getTime() - new Date(admissionRow.admission_date).getTime()) / 86400000)
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Admission Details</h1>
          <p className="text-pretty text-muted-foreground flex flex-wrap items-center gap-2">
            <span>Admission #{admissionRow.admission_number}</span>
            {admissionVisit?.is_free_health_care && (
              <Badge variant="secondary" className="text-[11px]">
                Free Health Care
              </Badge>
            )}
            {admissionFacility?.name && (
              <span className="text-xs text-muted-foreground">
                {admissionFacility.name}
                {admissionFacility.code ? ` (${admissionFacility.code})` : ""}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {admissionRow.emergency_admission && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Emergency
            </Badge>
          )}
          <Badge variant={admissionRow.status === "admitted" ? "default" : "secondary"}>{admissionRow.status}</Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Days Admitted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{daysAdmitted}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ward & Bed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{admissionWard?.name}</p>
            <p className="text-sm text-muted-foreground">
              Bed {admissionBed?.bed_number} ({admissionBed?.bed_type})
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admission Date</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{new Date(admissionRow.admission_date).toLocaleDateString()}</p>
            <p className="text-sm text-muted-foreground">{new Date(admissionRow.admission_date).toLocaleTimeString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
            <CardDescription>Key demographic details for this admission</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Name</p>
              <p className="text-lg font-medium">{admissionPatient?.full_name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Patient Number</p>
              <p>{admissionPatient?.patient_number}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Phone</p>
              <p>{admissionPatient?.phone_number || "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Medical Team</CardTitle>
            <CardDescription>Primary clinician responsible for this admission</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Admitting Doctor</p>
              <p>Dr. {admissionDoctor?.full_name}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="md:max-w-md">
        <CardHeader>
          <CardTitle className="text-sm">Visit debug context</CardTitle>
          <CardDescription>Technical identifiers for this admission&apos;s linked visit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-xs font-mono text-muted-foreground">
          <p>
            visit_id: {visitMeta?.id ?? ((admissionRow.visit_id as string | null) || "none")}
          </p>
          <p>facility_id: {visitMeta?.facility_id ?? "none"}</p>
          <p>payer_category: {visitMeta?.payer_category ?? "unknown"}</p>
          <p>is_free_health_care: {String(visitMeta?.is_free_health_care ?? false)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clinical Information</CardTitle>
          <CardDescription>Reason for admission and current treatment plan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Reason for Admission</p>
            <p>{admissionRow.admission_reason}</p>
          </div>
          <Separator />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Diagnosis</p>
            <p>{admissionRow.diagnosis || "Not specified"}</p>
          </div>
          <Separator />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Treatment Plan</p>
            <p className="whitespace-pre-wrap">{admissionRow.treatment_plan || "Not specified"}</p>
          </div>
        </CardContent>
      </Card>

      {vitals && vitals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Vitals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {vitals.map((vital: Vital) => (
                <div key={vital.id} className="flex justify-between items-start border-b pb-2 last:border-0">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{new Date(vital.recorded_at).toLocaleString()}</p>
                    <div className="text-sm text-muted-foreground">
                      BP: {vital.blood_pressure_systolic}/{vital.blood_pressure_diastolic} | Pulse: {vital.pulse_rate} |
                      Temp: {vital.temperature}°C | SpO2: {vital.oxygen_saturation}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nursing Notes</CardTitle>
          <CardDescription>Ongoing bedside assessments and handover notes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {nursingNotes && nursingNotes.length > 0 ? (
            <div className="space-y-3">
              {nursingNotes.map((note: NursingNote) => (
                <div key={note.id} className="border-l-2 border-muted pl-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    {new Date(note.created_at).toLocaleString()} {note.note_type ? `• ${note.note_type}` : ""}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No nursing notes recorded yet.</p>
          )}

          {admissionRow.status === "admitted" && (
            <form action={addNursingNote} className="space-y-3 pt-2 border-t mt-2">
              <div className="grid gap-3 md:grid-cols-3 items-end">
                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor="note_type">Note Type</Label>
                  <select
                    id="note_type"
                    name="note_type"
                    aria-label="Nursing note type"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    defaultValue=""
                  >
                    <option value="">(Optional)</option>
                    <option value="routine">Routine</option>
                    <option value="pain">Pain</option>
                    <option value="incident">Incident</option>
                    <option value="handover">Handover</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="note">Add Note *</Label>
                  <Textarea
                    id="note"
                    name="note"
                    rows={3}
                    placeholder="Brief shift note, observation, intervention, or handover..."
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-1 rounded-md text-sm font-medium"
              >
                Add Nursing Note
              </button>
            </form>
          )}
        </CardContent>
      </Card>

      {admissionRow.status === "admitted" && (
        <Card>
          <CardHeader>
            <CardTitle>Discharge Patient</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={discharge} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="discharge_summary">Discharge Summary *</Label>
                <Textarea
                  id="discharge_summary"
                  name="discharge_summary"
                  placeholder="Summary of treatment and condition at discharge..."
                  rows={4}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="discharge_instructions">Discharge Instructions *</Label>
                <Textarea
                  id="discharge_instructions"
                  name="discharge_instructions"
                  placeholder="Instructions for patient care after discharge, medications, follow-up appointments..."
                  rows={4}
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 rounded-md font-medium"
              >
                Discharge Patient
              </button>
            </form>
          </CardContent>
        </Card>
      )}

      {admissionRow.status === "discharged" && admissionRow.discharge_summary && (
        <Card>
          <CardHeader>
            <CardTitle>Discharge Information</CardTitle>
            <CardDescription>Summary of discharge and follow-up instructions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Discharge Date</p>
              <p>{admissionRow.discharge_date ? new Date(admissionRow.discharge_date).toLocaleString() : "N/A"}</p>
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Discharge Summary</p>
              <p className="whitespace-pre-wrap">{admissionRow.discharge_summary}</p>
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Discharge Instructions</p>
              <p className="whitespace-pre-wrap">{admissionRow.discharge_instructions}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
