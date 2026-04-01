import { createServerClient } from "@/lib/supabase/server"
import { notFound, redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Edit, FileText, Calendar, Pill, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { PatientPhotoCapture } from "@/components/PatientPhotoCapture"
import { getSessionUserAndProfile } from "@/app/actions/auth"

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createServerClient()
  const { id } = await params

  const { data: patient, error } = await supabase
    .from("patients")
    .select(
      "id, full_name, patient_number, photo_url, company_id, free_health_category, national_id, gender, date_of_birth, blood_group, phone_number, email, address, emergency_contact_name, emergency_contact_phone, next_of_kin, allergies, medical_history",
    )
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[v0] Error loading patient detail:", error.message || error)
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
      // Avoid creating multiple visits for the same patient on the same day
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)

      const { data: existingVisit } = await supabase
        .from("visits")
        .select("id")
        .eq("patient_id", patientId)
        .gte("created_at", startOfDay.toISOString())
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!existingVisit) {
        const companyAwarePatient = patientRecord as { company_id?: string | null; free_health_category?: string | null }

        const freeHealthCategory = (companyAwarePatient.free_health_category as string | null) ?? "none"
        const isFreeHealthCare = freeHealthCategory !== "none"

        const hasCompany = (companyAwarePatient.company_id as string | null) ?? null
        const payerCategory = isFreeHealthCare ? "fhc" : hasCompany ? "company" : "self_pay"

        const { data: opdFacility } = await supabase
          .from("facilities")
          .select("id, code")
          .eq("code", "opd")
          .maybeSingle()

        const facilityId = (opdFacility?.id as string | null) ?? null

        await supabase.from("visits").insert({
          patient_id: patientId,
          visit_status: "doctor_pending",
          assigned_company_id: hasCompany,
          is_free_health_care: isFreeHealthCare,
          payer_category: payerCategory,
          facility_id: facilityId,
        })
      }
    } catch (error) {
      console.error("[v0] Error starting visit for patient:", error)
    }

    // After starting/ensuring a visit, send the user to the doctor queue
    redirect("/dashboard/doctor")
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
            <PatientPhotoCapture patientId={patientRecord.id} initialPhotoUrl={patientRecord.photo_url} />
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

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common actions for this patient</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <form action={startVisit}>
            <Button type="submit" variant="default">
              Start Visit (Doctor Queue)
            </Button>
          </form>
          <Button asChild variant="outline">
            <Link href={`/dashboard/appointments/new?patient_id=${patientRecord.id}`}>Book Appointment</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/dashboard/prescriptions/new?patient_id=${patientRecord.id}`}>
              Create Prescription
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/dashboard/lab/new?patient_id=${patientRecord.id}`}>Order Lab Test</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/dashboard/billing/new?patient_id=${patientRecord.id}`}>Create Invoice</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
