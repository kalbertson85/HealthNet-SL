import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { assertVisitTransition, type VisitStatus } from "@/lib/visits"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function NewAdmissionPage(props: { searchParams: Promise<{ patient_id?: string; visit_id?: string }> }) {
  const supabase = await createServerClient()

  const searchParams = await props.searchParams
  const defaultPatientId = (searchParams.patient_id as string | undefined) || ""
  const defaultVisitId = (searchParams.visit_id as string | undefined) || ""

  // Fetch patients, doctors, wards, and available beds
  const [{ data: patients }, { data: doctors }, { data: wards }] = await Promise.all([
    supabase.from("patients").select("id, full_name, patient_number").eq("status", "active").order("full_name"),
    supabase.from("profiles").select("id, full_name").eq("role", "doctor").order("full_name"),
    supabase.from("wards").select("id, name, ward_number").eq("status", "active").order("ward_number"),
  ])

  // Fetch available beds
  const { data: beds } = await supabase
    .from("beds")
    .select("id, ward_id, bed_number, bed_type")
    .eq("status", "available")
    .order("ward_id, bed_number")

  async function createAdmission(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect("/auth/login")
    }

    const bedId = formData.get("bed_id") as string
    const visitId = ((formData.get("visit_id") as string | null) || "").trim() || null

    // Get selected bed and linked ward.
    const { data: bed } = await supabase.from("beds").select("id, ward_id").eq("id", bedId).single()

    const admissionData = {
      patient_id: formData.get("patient_id") as string,
      ward_id: bed?.ward_id,
      bed_id: bedId,
      admitting_doctor_id: formData.get("doctor_id") as string,
      admission_date: formData.get("admission_date") as string,
      admission_reason: formData.get("admission_reason") as string,
      diagnosis: formData.get("diagnosis") as string,
      treatment_plan: formData.get("treatment_plan") as string,
      emergency_admission: formData.get("emergency_admission") === "on",
      status: "admitted",
      created_by: user.id,
      visit_id: visitId,
    }

    const { data, error } = await supabase.from("admissions").insert(admissionData).select().single()

    if (error) {
      console.error("[v0] Error creating admission:", error)
      throw error
    }

    // Update bed status
    await supabase.from("beds").update({ status: "occupied" }).eq("id", bedId)

    // Update ward available beds count
    if (bed?.ward_id) {
      const { data: ward } = await supabase.from("wards").select("id, available_beds").eq("id", bed.ward_id).single()
      if (ward) {
        await supabase
          .from("wards")
          .update({ available_beds: Math.max(0, (ward.available_beds || 0) - 1) })
          .eq("id", bed.ward_id)
      }
    }

    // If this admission is linked to a visit, reflect the admitted status on that visit
    if (visitId) {
      const { data: beforeVisit } = await supabase
        .from("visits")
        .select("visit_status")
        .eq("id", visitId)
        .maybeSingle()

      const currentStatus = (beforeVisit?.visit_status as VisitStatus | null) ?? null

      if (currentStatus) {
        try {
          assertVisitTransition(currentStatus, "admitted")
          await supabase.from("visits").update({ visit_status: "admitted" }).eq("id", visitId)
        } catch (err) {
          console.error("[inpatient] Invalid visit status transition on admission create", {
            visitId,
            from: currentStatus,
            to: "admitted",
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    redirect(`/dashboard/inpatient/${data.id}`)
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/inpatient">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Inpatient
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">New Patient Admission</h1>
            <p className="text-pretty text-muted-foreground">Admit a patient and assign ward/bed</p>
          </div>
        </div>
      </div>

      <form action={createAdmission}>
        <input type="hidden" name="visit_id" value={defaultVisitId} />
        <Card>
          <CardHeader>
            <CardTitle>Admission Details</CardTitle>
            <CardDescription>Patient and clinical information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Patient *</Label>
                <Select name="patient_id" required defaultValue={defaultPatientId || undefined}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients?.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.full_name} ({patient.patient_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Admitting Doctor *</Label>
                <Select name="doctor_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors?.map((doctor) => (
                      <SelectItem key={doctor.id} value={doctor.id}>
                        Dr. {doctor.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Bed Assignment *</Label>
                <Select name="bed_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select bed" />
                  </SelectTrigger>
                  <SelectContent>
                    {beds?.map((bed) => {
                      const ward = wards?.find((w) => w.id === bed.ward_id)
                      return (
                        <SelectItem key={bed.id} value={bed.id}>
                          {ward?.name} - Bed {bed.bed_number} ({bed.bed_type})
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admission_date">Admission Date *</Label>
                <Input
                  id="admission_date"
                  name="admission_date"
                  type="datetime-local"
                  defaultValue={new Date().toISOString().slice(0, 16)}
                  required
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="emergency_admission" name="emergency_admission" />
              <Label htmlFor="emergency_admission" className="text-sm font-normal">
                Emergency Admission
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="admission_reason">Reason for Admission *</Label>
              <Textarea
                id="admission_reason"
                name="admission_reason"
                placeholder="Brief reason for admission..."
                rows={2}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="diagnosis">Provisional Diagnosis</Label>
              <Textarea id="diagnosis" name="diagnosis" placeholder="Provisional or confirmed diagnosis..." rows={2} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="treatment_plan">Treatment Plan</Label>
              <Textarea id="treatment_plan" name="treatment_plan" placeholder="Initial treatment plan..." rows={3} />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/inpatient">Cancel</Link>
          </Button>
          <Button type="submit">Admit Patient</Button>
        </div>
      </form>
    </div>
  )
}
