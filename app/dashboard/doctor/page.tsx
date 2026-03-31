import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { assertVisitTransition, type VisitStatus } from "@/lib/visits"
import { getSessionUserAndProfile } from "@/app/actions/auth"

interface VisitRow {
  id: string
  visit_status: string
  diagnosis: string | null
  prescription_list: { notes?: string } | null
  is_free_health_care?: boolean
  payer_category?: string | null
  symptoms?: string | null
  history?: string | null
  exam_findings?: string | null
  treatment_plan?: string | null
  patients?: {
    id: string
    full_name?: string | null
    patient_number?: string | null
    date_of_birth?: string | null
  } | null
  facilities?: {
    name?: string | null
    code?: string | null
  } | null
}

interface TriageSummaryRow {
  triage_priority: string | null
  bp: string | null
  temperature_c: number | null
  spo2: number | null
}

export const revalidate = 0

export default async function DoctorPage(props: {
  searchParams?: Promise<{ error?: string }>
}) {
  const supabase = await createServerClient()

  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const doctorId = user.id

  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const errorCode = resolvedSearchParams?.error

  const { data: visitsData, error: visitsError } = await supabase
    .from("visits")
    .select(
      `id, visit_status, diagnosis, prescription_list, is_free_health_care, payer_category, symptoms, history, exam_findings, treatment_plan,
       patients(id, full_name, patient_number, date_of_birth),
       facilities(name, code)`
    )
    .in("visit_status", ["doctor_pending", "doctor_review"])
    .order("created_at", { ascending: true })

  // Look for active OPD queue entries that are already linked to a visit via visit_id
  const { data: opdQueues } = await supabase
    .from("queues")
    .select("id, visit_id, department, status, queue_number")
    .eq("department", "opd")
    .in("status", ["waiting", "in_progress"])
    .not("visit_id", "is", null)

  if (visitsError) {
    console.error("[v0] Error loading doctor visits:", visitsError.message || visitsError)
  }

  interface RawVisitRow {
    id: string
    visit_status: string
    diagnosis: string | null
    prescription_list: { notes?: string } | null
    is_free_health_care?: boolean | null
    payer_category?: string | null
    symptoms?: string | null
    history?: string | null
    exam_findings?: string | null
    treatment_plan?: string | null
    patients?: { id: string; full_name: string | null; patient_number: string | null; date_of_birth: string | null }[] | null
    facilities?: { name: string | null; code: string | null }[] | null
  }

  const errorMessage = (() => {
    switch (errorCode) {
      case "visit_transition_invalid":
        return "This visit could not be moved because its current status does not allow that action. Please refresh and confirm the visit is in the expected stage before trying again."
      default:
        return null
    }
  })()

  const visits: VisitRow[] = (visitsData || []).map((raw) => {
    const v = raw as RawVisitRow

    const rawPatients = v.patients
    const patient = Array.isArray(rawPatients) ? rawPatients[0] ?? null : rawPatients ?? null

    const rawFacilities = v.facilities
    const facility = Array.isArray(rawFacilities) ? rawFacilities[0] ?? null : rawFacilities ?? null

    return {
      id: v.id,
      visit_status: v.visit_status,
      diagnosis: v.diagnosis,
      prescription_list: v.prescription_list,
      is_free_health_care: Boolean(v.is_free_health_care ?? false),
      payer_category: v.payer_category ?? null,
      symptoms: v.symptoms,
      history: v.history,
      exam_findings: v.exam_findings,
      treatment_plan: v.treatment_plan,
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

  const triageByVisitId = new Map<string, TriageSummaryRow>()

  if (visitIds.length > 0) {
    const { data: triageData, error: triageError } = await supabase
      .from("triage_assessments")
      .select("visit_id, triage_priority, bp, temperature_c, spo2, created_at")
      .in("visit_id", visitIds)
      .order("created_at", { ascending: false })

    if (triageError) {
      console.error("[v0] Error loading triage for doctor workflow:", triageError.message || triageError)
    }

    for (const row of triageData || []) {
      const visitId = (row.visit_id as string | null) ?? null
      if (!visitId) continue
      if (triageByVisitId.has(visitId)) continue
      triageByVisitId.set(visitId, {
        triage_priority: (row.triage_priority as string | null) ?? null,
        bp: (row.bp as string | null) ?? null,
        temperature_c: (row.temperature_c as number | null) ?? null,
        spo2: (row.spo2 as number | null) ?? null,
      })
    }
  }

  // Look up any active admissions linked to these visits
  const admissionByVisitId = new Map<string, { id: string; status: string }>()

  if (visitIds.length > 0) {
    const { data: admissions, error: admissionsError } = await supabase
      .from("admissions")
      .select("id, visit_id, status")
      .in("visit_id", visitIds)
      .in("status", ["admitted"])

    if (admissionsError) {
      console.error("[doctor] Error loading admissions for doctor workflow:", admissionsError.message || admissionsError)
    }

    for (const row of admissions || []) {
      const visitId = (row.visit_id as string | null) ?? null
      if (!visitId) continue
      admissionByVisitId.set(visitId, {
        id: row.id as string,
        status: (row.status as string) || "admitted",
      })
    }
  }

  const opdQueueByVisitId = new Map<
    string,
    {
      status: string
      queue_number: string | null
    }
  >(
    (opdQueues || [])
      .map((q) => {
        const visitId = q.visit_id as string | null
        if (!visitId) return null
        return [
          visitId,
          {
            status: (q.status as string) ?? "waiting",
            queue_number: (q.queue_number as string | null) ?? null,
          },
        ] as const
      })
      .filter((entry): entry is readonly [string, { status: string; queue_number: string | null }] => Boolean(entry))
  )

  const pending = visits.filter((v) => v.visit_status === "doctor_pending")
  const review = visits.filter((v) => v.visit_status === "doctor_review")

  const triagePriorityRank = (visitId: string): number => {
    const triage = triageByVisitId.get(visitId)
    const priority = triage?.triage_priority || "routine"
    switch (priority) {
      case "emergency":
        return 0
      case "urgent":
        return 1
      case "routine":
      default:
        return 2
    }
  }

  const sortByTriage = (rows: VisitRow[]): VisitRow[] => {
    return [...rows].sort((a, b) => {
      const rankA = triagePriorityRank(a.id)
      const rankB = triagePriorityRank(b.id)
      if (rankA !== rankB) return rankA - rankB
      return 0
    })
  }

  const orderedPending = sortByTriage(pending)
  const orderedReview = sortByTriage(review)

  // This doctor's current inpatients
  const { data: myAdmissionsData } = await supabase
    .from("admissions")
    .select(
      `id, admission_number, admission_date, status,
       patients(full_name, patient_number),
       wards(name),
       beds(bed_number),
       visits(is_free_health_care, facilities(name, code))`
    )
    .eq("admitting_doctor_id", doctorId)
    .eq("status", "admitted")
    .order("admission_date", { ascending: false })
    .limit(10)

  const myAdmissions = (myAdmissionsData || []) as {
    id: string
    admission_number: string
    admission_date: string
    status: string
    patients?: { full_name?: string | null; patient_number?: string | null } | null
    wards?: { name?: string | null } | null
    beds?: { bed_number?: string | null } | null
    visits?: { is_free_health_care?: boolean | null; facilities?: { name?: string | null; code?: string | null } | null } | null
  }[]

  // This doctor's recent lab tests (investigations)
  const { data: myLabTestsData } = await supabase
    .from("lab_tests")
    .select(
      `id, test_number, test_type, test_category, status,
       patients(full_name, patient_number)`
    )
    .eq("doctor_id", doctorId)
    .order("created_at", { ascending: false })
    .limit(10)

  const myLabTests = (myLabTestsData || []) as {
    id: string
    test_number: string
    test_type: string
    test_category: string
    status: string
    patients?: { full_name?: string | null; patient_number?: string | null } | null
  }[]

  // This doctor's recent prescriptions
  const { data: myPrescriptionsData } = await supabase
    .from("prescriptions")
    .select(
      `id, prescription_number, status, created_at,
       patients(full_name, patient_number)`
    )
    .eq("doctor_id", doctorId)
    .order("created_at", { ascending: false })
    .limit(10)

  const myPrescriptions = (myPrescriptionsData || []) as {
    id: string
    prescription_number: string
    status: string
    created_at: string
    patients?: { full_name?: string | null; patient_number?: string | null } | null
  }[]

  const renderTriageSnippet = (visitId: string) => {
    const triage = triageByVisitId.get(visitId)
    if (!triage) return null

    const priority = triage.triage_priority || "routine"
    const priorityLabel = priority

    const badgeVariant: "outline" | "default" | "destructive" =
      priority === "emergency" ? "destructive" : priority === "urgent" ? "default" : "outline"

    const vitalsText = `BP ${triage.bp || "-"} | Temp ${
      triage.temperature_c ?? "-"
    }°C | SpO2 ${triage.spo2 ?? "-"}%`

    return (
      <div className="flex flex-col items-end gap-0.5 text-[10px] text-muted-foreground">
        <Badge variant={badgeVariant}>Triage: {priorityLabel}</Badge>
        <span>{vitalsText}</span>
      </div>
    )
  }

  async function updateVisit(formData: FormData) {
    "use server"

    const supabase = await createServerClient()

    const visitId = formData.get("visit_id") as string
    const mode = formData.get("mode") as string

    if (!visitId || !mode) {
      redirect("/dashboard/doctor")
    }

    if (mode === "initial") {
      const diagnosis = (formData.get("diagnosis") as string | null) ?? ""
      const symptoms = (formData.get("symptoms") as string | null) ?? ""
      const historyText = (formData.get("history") as string | null) ?? ""
      const examFindings = (formData.get("exam_findings") as string | null) ?? ""
      const treatmentPlan = (formData.get("treatment_plan") as string | null) ?? ""
      const investigationType = (formData.get("investigation_type") as string | null) ?? ""
      const investigationNotes = (formData.get("investigation_notes") as string | null) ?? ""

      const { data: beforeVisit } = await supabase
        .from("visits")
        .select("visit_status, patient_id")
        .eq("id", visitId)
        .maybeSingle()

      const currentStatus = (beforeVisit?.visit_status as VisitStatus | null) ?? null

      if (!currentStatus) {
        console.error("[v0] Doctor updateVisit(initial): missing current visit_status", { visitId })
        redirect("/dashboard/doctor?error=visit_transition_invalid")
      }

      if (investigationType) {
        try {
          assertVisitTransition(currentStatus as VisitStatus, "lab_pending")
        } catch (err) {
          console.error("[v0] Invalid visit status transition (doctor initial -> lab_pending)", {
            visitId,
            from: currentStatus,
            to: "lab_pending",
            error: err instanceof Error ? err.message : String(err),
          })
          redirect("/dashboard/doctor?error=visit_transition_invalid")
        }

        const {
          data: investigationRows,
          error: investigationError,
        } = await supabase
          .from("investigations")
          .insert({
            visit_id: visitId,
            type: investigationType,
            notes: investigationNotes,
            status: "pending",
          })
          .select("id")
          .maybeSingle()

        if (investigationError) {
          console.error("[v0] Error creating investigation from doctor workflow:", investigationError)
        }

        // For imaging investigations, also create a structured radiology request
        const isImaging = ["xray", "mri", "ultrasound"].includes(investigationType)

        if (isImaging && investigationRows?.id && beforeVisit?.patient_id) {
          const {
            data: { user: actingUser },
          } = await supabase.auth.getUser()

          if (!actingUser) {
            redirect("/auth/login")
          }

          try {
            await supabase.from("radiology_requests").insert({
              investigation_id: investigationRows.id,
              visit_id: visitId,
              patient_id: beforeVisit.patient_id as string,
              doctor_id: actingUser.id,
              modality: investigationType,
              study_type: investigationType,
              priority: "routine",
              status: "pending",
              clinical_notes: investigationNotes,
            })
          } catch (radiologyError) {
            console.error("[v0] Error creating radiology request from doctor workflow:", radiologyError)
          }
        }

        await supabase
          .from("visits")
          .update({
            diagnosis,
            symptoms: symptoms || null,
            history: historyText || null,
            exam_findings: examFindings || null,
            treatment_plan: treatmentPlan || null,
            visit_status: "lab_pending",
          })
          .eq("id", visitId)
      } else {
        try {
          assertVisitTransition(currentStatus as VisitStatus, "billing_pending")
        } catch (err) {
          console.error("[v0] Invalid visit status transition (doctor initial -> billing_pending)", {
            visitId,
            from: currentStatus,
            to: "billing_pending",
            error: err instanceof Error ? err.message : String(err),
          })
          redirect("/dashboard/doctor?error=visit_transition_invalid")
        }

        await supabase
          .from("visits")
          .update({
            diagnosis,
            symptoms: symptoms || null,
            history: historyText || null,
            exam_findings: examFindings || null,
            treatment_plan: treatmentPlan || null,
            visit_status: "billing_pending",
          })
          .eq("id", visitId)
      }
    }

    if (mode === "review") {
      const prescription = (formData.get("prescription") as string | null) ?? ""
      const diagnosis = (formData.get("diagnosis") as string | null) ?? ""
      const symptoms = (formData.get("symptoms") as string | null) ?? ""
      const historyText = (formData.get("history") as string | null) ?? ""
      const examFindings = (formData.get("exam_findings") as string | null) ?? ""
      const treatmentPlan = (formData.get("treatment_plan") as string | null) ?? ""

      const { data: beforeVisit } = await supabase
        .from("visits")
        .select("visit_status")
        .eq("id", visitId)
        .maybeSingle()

      const currentStatus = (beforeVisit?.visit_status as VisitStatus | null) ?? null

      if (!currentStatus) {
        console.error("[v0] Doctor updateVisit(review): missing current visit_status", { visitId })
        redirect("/dashboard/doctor?error=visit_transition_invalid")
      }

      try {
        assertVisitTransition(currentStatus as VisitStatus, "billing_pending")
      } catch (err) {
        console.error("[v0] Invalid visit status transition (doctor review -> billing_pending)", {
          visitId,
          from: currentStatus,
          to: "billing_pending",
          error: err instanceof Error ? err.message : String(err),
        })
        redirect("/dashboard/doctor?error=visit_transition_invalid")
      }

      await supabase
        .from("visits")
        .update({
          diagnosis,
          symptoms: symptoms || null,
          history: historyText || null,
          exam_findings: examFindings || null,
          treatment_plan: treatmentPlan || null,
          prescription_list: prescription ? { notes: prescription } : null,
          visit_status: "billing_pending",
        })
        .eq("id", visitId)
    }

    redirect("/dashboard/doctor")
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
      {errorMessage && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Doctor Workflow</h1>
          <p className="text-pretty text-muted-foreground">
            Review new patients, order investigations, and prepare prescriptions. Patients move from the doctor queue
            to lab or billing, then back to the doctor for review when investigations are completed.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/patients">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Patients
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Patients waiting for doctor</CardTitle>
            <CardDescription>
              Visits currently in the <span className="font-semibold">doctor_pending</span> stage. After you record a
              diagnosis, you can either order investigations (moves visit to <span className="font-semibold">lab_pending</span>)
              or send directly to billing (<span className="font-semibold">billing_pending</span>).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {orderedPending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No patients waiting for initial consultation.</p>
            ) : (
              orderedPending.map((visit) => (
                <div key={visit.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{visit.patients?.full_name || "Unknown patient"}</p>
                      <p className="text-xs text-muted-foreground">
                        {visit.patients?.patient_number || "–"} · Age {formatAge(visit.patients?.date_of_birth)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline">doctor_pending</Badge>
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
                      {renderTriageSnippet(visit.id)}
                      {(() => {
                        const info = opdQueueByVisitId.get(visit.id)
                        if (!info) return null
                        return (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            From OPD queue · {info.queue_number || "no #"} ({info.status.replace("_", " ")})
                            <Link
                              href="/dashboard/queue/opd"
                              className="underline-offset-2 hover:underline"
                            >
                              View
                            </Link>
                          </span>
                        )
                      })()}
                      {visit.patients?.id && (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={`/dashboard/inpatient/new?patient_id=${visit.patients.id}&visit_id=${visit.id}`}
                            >
                              Admit inpatient
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={`/dashboard/surgery/new?patient_id=${visit.patients.id}&visit_id=${visit.id}`}
                            >
                              Record surgery
                            </Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <form action={updateVisit} className="mt-3 space-y-3">
                    <input type="hidden" name="visit_id" value={visit.id} />
                    <input type="hidden" name="mode" value="initial" />

                    <div className="space-y-1">
                      <Label htmlFor={`symptoms-${visit.id}`}>Symptoms</Label>
                      <Textarea
                        id={`symptoms-${visit.id}`}
                        name="symptoms"
                        defaultValue={visit.symptoms ?? ""}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`history-${visit.id}`}>History</Label>
                      <Textarea
                        id={`history-${visit.id}`}
                        name="history"
                        defaultValue={visit.history ?? ""}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`exam_findings-${visit.id}`}>Examination findings</Label>
                      <Textarea
                        id={`exam_findings-${visit.id}`}
                        name="exam_findings"
                        defaultValue={visit.exam_findings ?? ""}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`diagnosis-${visit.id}`}>Diagnosis</Label>
                      <Textarea
                        id={`diagnosis-${visit.id}`}
                        name="diagnosis"
                        defaultValue={visit.diagnosis ?? ""}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`treatment_plan-${visit.id}`}>Treatment plan</Label>
                      <Textarea
                        id={`treatment_plan-${visit.id}`}
                        name="treatment_plan"
                        defaultValue={visit.treatment_plan ?? ""}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`investigation_type-${visit.id}`}>Investigation (optional)</Label>
                      <select
                        id={`investigation_type-${visit.id}`}
                        name="investigation_type"
                        aria-label="Investigation type"
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        defaultValue=""
                      >
                        <option value="">None</option>
                        <option value="lab">Lab</option>
                        <option value="xray">X-ray</option>
                        <option value="mri">MRI</option>
                        <option value="ultrasound">Ultrasound</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`investigation_notes-${visit.id}`}>Investigation notes (optional)</Label>
                      <Textarea
                        id={`investigation_notes-${visit.id}`}
                        name="investigation_notes"
                        rows={2}
                        placeholder="Clinical question, suspected diagnosis, etc."
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button type="submit" size="sm" variant="default">
                        Save & Continue
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Next step: if you select an investigation, this visit moves to lab. Otherwise it moves directly to
                      billing.
                    </p>
                  </form>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Patients for review</CardTitle>
            <CardDescription>
              Visits returning from investigations for doctor review (<span className="font-semibold">doctor_review</span>).
              After you confirm the diagnosis and prescription, the visit moves to
              <span className="font-semibold"> billing_pending</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {orderedReview.length === 0 ? (
              <p className="text-sm text-muted-foreground">No patients waiting for review.</p>
            ) : (
              orderedReview.map((visit) => (
                <div key={visit.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{visit.patients?.full_name || "Unknown patient"}</p>
                      <p className="text-xs text-muted-foreground">
                        {visit.patients?.patient_number || "–"} · Age {formatAge(visit.patients?.date_of_birth)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline">doctor_review</Badge>
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
                      {renderTriageSnippet(visit.id)}
                      {(() => {
                        const info = opdQueueByVisitId.get(visit.id)
                        if (!info) return null
                        return (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            From OPD queue · {info.queue_number || "no #"} ({info.status.replace("_", " ")})
                            <Link
                              href="/dashboard/queue/opd"
                              className="underline-offset-2 hover:underline"
                            >
                              View
                            </Link>
                          </span>
                        )
                      })()}
                      {(() => {
                        const admission = admissionByVisitId.get(visit.id)
                        if (!admission) return null
                        return (
                          <Link
                            href={`/dashboard/inpatient/${admission.id}`}
                            className="text-[10px] text-emerald-700 underline-offset-2 hover:underline"
                          >
                            Admitted – view admission
                          </Link>
                        )
                      })()}
                    </div>
                  </div>

                  <form action={updateVisit} className="mt-3 space-y-3">
                    <input type="hidden" name="visit_id" value={visit.id} />
                    <input type="hidden" name="mode" value="review" />

                    <div className="space-y-1">
                      <Label htmlFor={`review_symptoms-${visit.id}`}>Symptoms</Label>
                      <Textarea
                        id={`review_symptoms-${visit.id}`}
                        name="symptoms"
                        defaultValue={visit.symptoms ?? ""}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`review_history-${visit.id}`}>History</Label>
                      <Textarea
                        id={`review_history-${visit.id}`}
                        name="history"
                        defaultValue={visit.history ?? ""}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`review_exam_findings-${visit.id}`}>Examination findings</Label>
                      <Textarea
                        id={`review_exam_findings-${visit.id}`}
                        name="exam_findings"
                        defaultValue={visit.exam_findings ?? ""}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`review_diagnosis-${visit.id}`}>Diagnosis</Label>
                      <Textarea
                        id={`review_diagnosis-${visit.id}`}
                        name="diagnosis"
                        defaultValue={visit.diagnosis ?? ""}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`review_treatment_plan-${visit.id}`}>Treatment plan</Label>
                      <Textarea
                        id={`review_treatment_plan-${visit.id}`}
                        name="treatment_plan"
                        defaultValue={visit.treatment_plan ?? ""}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`prescription-${visit.id}`}>Prescription</Label>
                      <Textarea
                        id={`prescription-${visit.id}`}
                        name="prescription"
                        placeholder="Medication name, dose, frequency, duration..."
                        rows={3}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button type="submit" size="sm" variant="default">
                        Save & Send to Billing
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Next step: this visit will be handed over to billing to create and manage the invoice.
                    </p>
                  </form>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My inpatients</CardTitle>
          <CardDescription>Current admissions where you are the admitting doctor.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {myAdmissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have no active inpatients.</p>
          ) : (
            myAdmissions.map((adm) => (
              <div key={adm.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                <div>
                  <p className="font-medium">{adm.patients?.full_name || "Unknown patient"}</p>
                  <p className="text-xs text-muted-foreground">
                    {adm.patients?.patient_number || "–"} · Ward {adm.wards?.name || "?"} · Bed {adm.beds?.bed_number || "?"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="outline" className="text-[11px]">admitted</Badge>
                  {adm.visits?.is_free_health_care && (
                    <Badge variant="default" className="text-[10px] font-normal">
                      Free Health Care visit
                    </Badge>
                  )}
                  {adm.visits?.facilities?.name && (
                    <span className="text-[11px] text-muted-foreground">
                      {adm.visits.facilities.name}
                      {adm.visits.facilities.code ? ` (${adm.visits.facilities.code})` : ""}
                    </span>
                  )}
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/dashboard/inpatient/${adm.id}`}>View admission</Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My investigations</CardTitle>
            <CardDescription>Recent lab tests you have ordered.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {myLabTests.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have no recent lab tests.</p>
            ) : (
              myLabTests.map((test) => (
                <div key={test.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium">{test.patients?.full_name || "Unknown patient"}</p>
                    <p className="text-xs text-muted-foreground">
                      {test.patients?.patient_number || "–"} · {test.test_type} ({test.test_category})
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className="text-[11px]">{test.status}</Badge>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/dashboard/lab/${test.id}`}>View test</Link>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My prescriptions</CardTitle>
            <CardDescription>Recent prescriptions you have written.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {myPrescriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have no recent prescriptions.</p>
            ) : (
              myPrescriptions.map((rx) => (
                <div key={rx.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium">{rx.patients?.full_name || "Unknown patient"}</p>
                    <p className="text-xs text-muted-foreground">
                      {rx.patients?.patient_number || "–"} · Rx {rx.prescription_number}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className="text-[11px]">{rx.status}</Badge>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/dashboard/prescriptions/${rx.id}`}>View prescription</Link>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
