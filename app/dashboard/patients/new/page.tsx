import Link from "next/link"
import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft } from "lucide-react"

export default async function NewPatientPage() {
  const supabaseForPage = await createServerClient()
  const { data: companies } = await supabaseForPage
    .from("companies")
    .select("id, name")
    .order("name")

  async function createPatient(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect("/auth/login")
    }

    const fullName = (formData.get("full_name") as string) || ""
    const phoneNumber = (formData.get("phone_number") as string) || ""
    const nationalId = (formData.get("national_id") as string) || null

    const nextOfKinName = (formData.get("next_of_kin_name") as string) || null
    const nextOfKinRelationship = (formData.get("next_of_kin_relationship") as string) || null
    const nextOfKinPhone = (formData.get("next_of_kin_phone") as string) || null
    const nextOfKinAddress = (formData.get("next_of_kin_address") as string) || null

    const insuranceTypeRaw = (formData.get("insurance_type") as string | null) || ""
    const insuranceType = insuranceTypeRaw ? insuranceTypeRaw.toLowerCase() : null
    const freeHealthCategoryRaw = (formData.get("free_health_category") as string | null) || ""
    const freeHealthCategory = freeHealthCategoryRaw || "none"
    const companyIdRaw = ((formData.get("company_id") as string | null) || "").trim()
    const companyId = companyIdRaw || null
    const insuranceCardNumber = ((formData.get("insurance_card_number") as string | null) || "").trim() || null
    const insuranceCardSerial = ((formData.get("insurance_card_serial") as string | null) || "").trim() || null
    const insuranceExpiryRaw = (formData.get("insurance_expiry_date") as string | null) || ""
    const insuranceExpiryDate = insuranceExpiryRaw || null
    const insuranceMobile = ((formData.get("insurance_mobile") as string | null) || "").trim() || null
    const employeeInsuranceId = ((formData.get("employee_insurance_id") as string | null) || "").trim() || null

    // Basic validation for insured patients
    if (insuranceType === "employee" || insuranceType === "dependent") {
      if (!companyId || !insuranceCardNumber || !insuranceExpiryRaw) {
        redirect("/dashboard/patients/new?error=insurance_missing")
      }
    }

    // Generate a simple patient number if the column exists and requires a value
    const generatedPatientNumber = `PT-${Date.now().toString().slice(-6)}`

    const patientData = {
      full_name: fullName,
      // Name components kept for potential future use, but table currently only stores full_name
      patient_number: generatedPatientNumber,
      national_id: nationalId,
      date_of_birth: formData.get("date_of_birth") as string,
      gender: formData.get("gender") as string,
      phone_number: phoneNumber,
      email: (formData.get("email") as string) || null,
      address: (formData.get("address") as string) || null,
      blood_group: (formData.get("blood_group") as string) || null,
      emergency_contact_name: (formData.get("emergency_contact_name") as string) || null,
      emergency_contact_phone: (formData.get("emergency_contact_phone") as string) || null,
      allergies: (formData.get("allergies") as string) || null,
      medical_history: (formData.get("medical_history") as string) || null,
      next_of_kin:
        nextOfKinName || nextOfKinRelationship || nextOfKinPhone || nextOfKinAddress
          ? {
              name: nextOfKinName,
              relationship: nextOfKinRelationship,
              phone: nextOfKinPhone,
              address: nextOfKinAddress,
            }
          : null,
      free_health_category: freeHealthCategory,
      insurance_type: insuranceType,
      company_id: companyId,
      insurance_card_number: insuranceCardNumber,
      insurance_expiry_date: insuranceExpiryDate,
      insurance_card_serial: insuranceCardSerial,
      insurance_mobile: insuranceMobile,
      status: "active",
      created_by: user.id,
    }

    const { data, error } = await supabase.from("patients").insert(patientData).select().single()

    if (error) {
      console.error("[v0] Error creating patient:", error.message || error)
      throw error
    }

    type InsertedPatient = {
      id: string
      company_id?: string | null
    }

    const insertedPatient = data as InsertedPatient & {
      full_name?: string | null
      phone_number?: string | null
      insurance_type?: string | null
      insurance_card_number?: string | null
      insurance_card_serial?: string | null
      insurance_expiry_date?: string | null
    }

    // Auto-sync company employee record when patient is an insured employee
    if (
      (insertedPatient.insurance_type || insuranceType) === "employee" &&
      insertedPatient.company_id &&
      (insertedPatient.insurance_card_number || insuranceCardNumber)
    ) {
      await supabase
        .from("company_employees")
        .upsert(
          {
            company_id: insertedPatient.company_id,
            patient_id: insertedPatient.id,
            full_name: insertedPatient.full_name || fullName,
            phone: insertedPatient.phone_number || phoneNumber,
            insurance_card_number: insertedPatient.insurance_card_number || insuranceCardNumber,
            insurance_card_serial: insertedPatient.insurance_card_serial || insuranceCardSerial,
            insurance_expiry_date: insertedPatient.insurance_expiry_date || insuranceExpiryDate,
          },
          { onConflict: "patient_id" },
        )
    }

    // Auto-sync dependent into employee_dependents when insurance_type=dependent and an employee insurance ID is provided
    if (
      (insertedPatient.insurance_type || insuranceType) === "dependent" &&
      insertedPatient.company_id &&
      employeeInsuranceId
    ) {
      const { data: matchingEmployee } = await supabase
        .from("company_employees")
        .select("id")
        .eq("company_id", insertedPatient.company_id)
        .eq("insurance_card_number", employeeInsuranceId)
        .maybeSingle()

      if (matchingEmployee?.id) {
        await supabase
          .from("employee_dependents")
          .upsert(
            {
              employee_id: matchingEmployee.id,
              patient_id: insertedPatient.id,
              full_name: insertedPatient.full_name || fullName,
              relationship: nextOfKinRelationship,
              insurance_card_number: insertedPatient.insurance_card_number || insuranceCardNumber,
              insurance_card_serial: insertedPatient.insurance_card_serial || insuranceCardSerial,
              insurance_expiry_date: insertedPatient.insurance_expiry_date || insuranceExpiryDate,
            },
            { onConflict: "patient_id" },
          )
      }
    }

    // Automatically start a visit for this patient so they appear in the doctor queue
    try {
      const { data: fullPatient } = await supabase
        .from("patients")
        .select("id, company_id, free_health_category")
        .eq("id", insertedPatient.id)
        .maybeSingle()

      const fhcAwarePatient = (fullPatient || null) as
        | { company_id?: string | null; free_health_category?: string | null; id?: string | null }
        | null

      const companyId = (fhcAwarePatient?.company_id as string | null) ?? null
      const fhcCategory = (fhcAwarePatient?.free_health_category as string | null) ?? "none"
      const isFreeHealthCare = fhcCategory !== "none"
      const payerCategory = isFreeHealthCare ? "fhc" : companyId ? "company" : "self_pay"

      const { data: opdFacility } = await supabase
        .from("facilities")
        .select("id, code")
        .eq("code", "opd")
        .maybeSingle()

      const facilityId = (opdFacility?.id as string | null) ?? null

      await supabase.from("visits").insert({
        patient_id: insertedPatient.id,
        visit_status: "doctor_pending",
        assigned_company_id: companyId,
        is_free_health_care: isFreeHealthCare,
        payer_category: payerCategory,
        facility_id: facilityId,
      })
    } catch (visitError) {
      console.error("[v0] Error creating initial visit for patient:", visitError)
      // Continue redirecting even if visit creation fails
    }

    redirect(`/dashboard/patients/${data.id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/patients">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Patients
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">Register New Patient</h1>
            <p className="text-pretty text-muted-foreground">Enter patient information to create a new record</p>
          </div>
        </div>
      </div>

      <form action={createPatient}>
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
            <CardDescription>Basic demographic and contact information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input id="full_name" name="full_name" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date_of_birth">Date of Birth *</Label>
                <Input id="date_of_birth" name="date_of_birth" type="date" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">Gender *</Label>
                <select
                  id="gender"
                  name="gender"
                  required
                  aria-label="Gender"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  defaultValue=""
               >
                  <option value="" disabled>
                    Select gender
                  </option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="blood_group">Blood Group</Label>
                <select
                  id="blood_group"
                  name="blood_group"
                  aria-label="Blood group"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  defaultValue=""
                >
                  <option value="">Select blood group</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone_number">Phone Number *</Label>
                <Input id="phone_number" name="phone_number" type="tel" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="national_id">National ID</Label>
                <Input id="national_id" name="national_id" placeholder="e.g. NIN or national ID number" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="free_health_category">Free Health Care category</Label>
                <select
                  id="free_health_category"
                  name="free_health_category"
                  aria-label="Free Health Care category"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  defaultValue="none"
                >
                  <option value="none">Not Free Health Care</option>
                  <option value="u5">Under 5 years</option>
                  <option value="pregnant">Pregnant woman</option>
                  <option value="lactating">Lactating mother</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" name="address" rows={2} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="emergency_contact_name">Emergency Contact Name</Label>
                <Input id="emergency_contact_name" name="emergency_contact_name" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="emergency_contact_phone">Emergency Contact Phone</Label>
                <Input id="emergency_contact_phone" name="emergency_contact_phone" type="tel" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="next_of_kin_name">Next of Kin Name</Label>
                  <Input id="next_of_kin_name" name="next_of_kin_name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="next_of_kin_relationship">Relationship</Label>
                  <Input id="next_of_kin_relationship" name="next_of_kin_relationship" placeholder="e.g. Spouse, Parent" />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="next_of_kin_phone">Next of Kin Phone</Label>
                  <Input id="next_of_kin_phone" name="next_of_kin_phone" type="tel" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="next_of_kin_address">Next of Kin Address</Label>
                  <Textarea id="next_of_kin_address" name="next_of_kin_address" rows={2} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="allergies">Allergies</Label>
              <Textarea id="allergies" name="allergies" placeholder="List any known allergies..." rows={2} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="medical_history">Medical History</Label>
              <Textarea
                id="medical_history"
                name="medical_history"
                placeholder="Previous medical conditions, surgeries, etc..."
                rows={3}
              />
            </div>

            <div className="space-y-4 border-t pt-4">
              <div>
                <h2 className="text-base font-semibold">Insurance & Company</h2>
                <p className="text-xs text-muted-foreground">
                  Capture company insurance details for employees and dependents.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="insurance_type">Insurance type</Label>
                  <select
                    id="insurance_type"
                    name="insurance_type"
                    aria-label="Insurance type"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    defaultValue=""
                  >
                    <option value="">None</option>
                    <option value="employee">Employee</option>
                    <option value="dependent">Dependent</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company_id">Company</Label>
                  <select
                    id="company_id"
                    name="company_id"
                    aria-label="Company"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    defaultValue=""
                  >
                    <option value="">Select company</option>
                    {companies?.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="insurance_card_number">Insurance card number</Label>
                  <Input
                    id="insurance_card_number"
                    name="insurance_card_number"
                    placeholder="Card number on insurance card"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insurance_card_serial">Card serial</Label>
                  <Input
                    id="insurance_card_serial"
                    name="insurance_card_serial"
                    placeholder="Serial printed on card (optional)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insurance_expiry_date">Insurance expiry date</Label>
                  <Input id="insurance_expiry_date" name="insurance_expiry_date" type="date" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="insurance_mobile">Insurance contact mobile</Label>
                  <Input
                    id="insurance_mobile"
                    name="insurance_mobile"
                    type="tel"
                    placeholder="Mobile number used for insurance verification"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee_insurance_id">Employee insurance ID (for dependents)</Label>
                  <Input
                    id="employee_insurance_id"
                    name="employee_insurance_id"
                    placeholder="Employee's insurance ID for this dependent"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    For dependents, enter the employee&apos;s insurance ID so this dependent can be linked to the correct
                    employee.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/patients">Cancel</Link>
          </Button>
          <Button type="submit">Register Patient</Button>
        </div>
      </form>
    </div>
  )
}
