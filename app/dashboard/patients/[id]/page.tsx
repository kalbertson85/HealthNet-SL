import { createServerClient } from "@/lib/supabase/server"
import { notFound, redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Edit, FileText, Calendar, Pill, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { PatientPhotoCapture } from "@/components/PatientPhotoCapture"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { ensureActiveVisitForPatient, ensureQueueEntryForVisit } from "@/lib/visit-flow"
import { PatientWorkflowPanel } from "@/components/patient-workflow-panel"
import { buildFollowUpAppointmentHref } from "@/lib/patient-flow"

interface PatientDetailRecord {
  id: string
  full_name: string | null
  patient_number: string | null
  photo_url?: string | null
  company_id?: string | null
  free_health_category?: string | null
  national_id?: string | null
  gender?: string | null
  date_of_birth?: string | null
  blood_group?: string | null
  phone_number?: string | null
  email?: string | null
  address?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  next_of_kin?: unknown
  allergies?: string | null
  medical_history?: string | null
}

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createServerClient()
  const { id } = await params
  const patientBaseSelect =
    "id, full_name, patient_number, company_id, free_health_category, national_id, gender, date_of_birth, blood_group, phone_number, email, address, emergency_contact_name, emergency_contact_phone, next_of_kin, allergies, medical_history"

  let patient: PatientDetailRecord | null = null
  let photoFeatureAvailable = true

  const { data: patientWithPhoto, error } = await supabase
    .from("patients")
    .select(`${patientBaseSelect}, photo_url`)
    .eq("id", id)
    .maybeSingle()

  if (error?.message?.includes("patients.photo_url")) {
    photoFeatureAvailable = false
    const { data: patientWithoutPhoto, error: fallbackError } = await supabase
      .from("patients")
      .select(patientBaseSelect)
      .eq("id", id)
      .maybeSingle()

    if (fallbackError) {
      console.error("[v0] Error loading patient detail:", fallbackError.message || fallbackError)
    } else {
      patient = patientWithoutPhoto ? ({ ...patientWithoutPhoto, photo_url: null } as PatientDetailRecord) : null
    }
  } else {
    if (error) {
      console.error("[v0] Error loading patient detail:", error.message || error)
    }
    patient = patientWithPhoto as PatientDetailRecord | null
  }

  if (!patient) {
    console.warn("[v0] Patient not found for id:", id)
    notFound()
  }
  const patientRecord = patient

  // Fetch related data
  const [{ count: appointmentsCount }, { count: prescriptionsCount }, { count: labTestsCount }] = await Promise.all([
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("patient_id", id),
    supabase.from("prescriptions").select("id", { count: "exact", head: true }).eq("patient_id", id),
    supabase.from("lab_tests").select("id", { count: "exact", head: true }).eq("patient_id", id),
  ])

  const { data: activeVisit } = await supabase
    .from("visits")
    .select("id, visit_status")
    .eq("patient_id", id)
    .in("visit_status", ["triage_pending", "doctor_pending", "doctor_review", "lab_pending", "billing_pending", "pharmacy_pending", "admitted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const age = patientRecord.date_of_birth
    ? Math.floor((new Date().getTime() - new Date(patientRecord.date_of_birth).getTime()) / 31557600000)
    : null

  const nextOfKin = (patientRecord.next_of_kin || null) as
    | { name?: string | null; relationship?: string | null; phone?: string | null; address?: string | null }
    | null

  async function startVisit() {
    "use server"

    const supabase = await createServerClient()
    const { user } = await getSessionUserAndProfile()

    if (!user) {
      redirect("/auth/login")
    }

    const patientId = patientRecord.id as string

    try {
      const visitId = await ensureActiveVisitForPatient(supabase, patientId, { facilityCode: "opd" })
      if (visitId) {
        await ensureQueueEntryForVisit(supabase, {
          patientId,
          visitId,
          department: "opd",
          priority: "normal",
          notes: "Started from patient profile",
        })
      }
    } catch (error) {
      console.error("[v0] Error starting visit for patient:", error)
    }

    redirect("/dashboard/triage")
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/patients">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Patients
            </Link>
          </Button>
          <div className="flex items-center gap-4">
            <PatientPhotoCapture
              patientId={patientRecord.id}
              initialPhotoUrl={patientRecord.photo_url}
              disabled={!photoFeatureAvailable}
              disabledMessage={
                !photoFeatureAvailable ? "Patient photo uploads are disabled until the photo_url column is added." : undefined
              }
            />
            <div>
              <h1 className="text-balance text-3xl font-bold tracking-tight">{patientRecord.full_name}</h1>
              <p className="text-pretty text-muted-foreground">Patient Number: {patientRecord.patient_number}</p>
            </div>
          </div>
        </div>
        <Button asChild>
          <Link href={`/dashboard/patients/${patientRecord.id}/edit`}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Appointments</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{appointmentsCount || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prescriptions</CardTitle>
            <Pill className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{prescriptionsCount || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lab Tests</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{labTestsCount || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Core demographic and contact details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">National ID</p>
                <p>{patientRecord.national_id || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Gender</p>
                <p className="capitalize">{patientRecord.gender}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Age</p>
                <p>{age ? `${age} years` : "N/A"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Blood Group</p>
                <p>{patientRecord.blood_group || "N/A"}</p>
              </div>
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Phone Number</p>
              <p>{patientRecord.phone_number || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Email</p>
              <p>{patientRecord.email || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Address</p>
              <p>{patientRecord.address || "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Emergency Contact</CardTitle>
            <CardDescription>Who to reach in urgent situations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Name</p>
              <p>{patientRecord.emergency_contact_name || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Phone</p>
              <p>{patientRecord.emergency_contact_phone || "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next of Kin</CardTitle>
            <CardDescription>Primary family contact for clinical decisions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Name</p>
                <p>{nextOfKin?.name || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Relationship</p>
                <p>{nextOfKin?.relationship || "N/A"}</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Phone</p>
              <p>{nextOfKin?.phone || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Address</p>
              <p>{nextOfKin?.address || "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Medical Information</CardTitle>
            <CardDescription>Clinical history and important notes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Allergies</p>
              <p className="text-sm">{patientRecord.allergies || "None recorded"}</p>
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Medical History</p>
              <p className="text-sm">{patientRecord.medical_history || "No history recorded"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <PatientWorkflowPanel
        currentStage="registration"
        patientId={patientRecord.id}
        title="Registration workflow"
        description="Registration is complete when the chart, insurance, and contact details are accurate. The next operational step is triage and queue placement."
      />

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common actions for this patient</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <form action={startVisit}>
            <Button type="submit" variant="default">
              Start visit and send to triage
            </Button>
          </form>
          <Button asChild variant="outline">
            <Link
              href={buildFollowUpAppointmentHref({
                patientId: patientRecord.id,
                source: "follow_up",
                reason: "Planned review",
              })}
            >
              Schedule follow-up
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link
              href={`/dashboard/prescriptions/new?patient_id=${patientRecord.id}${activeVisit?.id ? `&visit_id=${activeVisit.id}` : ""}`}
            >
              Create Prescription
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/dashboard/lab/new?patient_id=${patientRecord.id}${activeVisit?.id ? `&visit_id=${activeVisit.id}` : ""}`}>
              Order Lab Test
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={activeVisit?.id ? `/dashboard/billing/visit/${activeVisit.id}` : `/dashboard/billing/new?patient_id=${patientRecord.id}`}>
              {activeVisit?.id ? "Open active visit billing" : "Create invoice"}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
