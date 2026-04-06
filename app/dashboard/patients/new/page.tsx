import Link from "next/link"
import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { PatientRegistrationProgress } from "@/components/patient-registration-progress"
import { PatientRegistrationForm } from "@/components/patient-registration-form"

export default async function NewPatientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const supabaseForPage = await createServerClient()
  const { error: errorParam } = await searchParams
  const { data: companies } = await supabaseForPage
    .from("companies")
    .select("id, name")
    .order("name")

  const errorMessage =
    errorParam === "insurance_missing"
      ? "Insurance type requires company, insurance card number, and expiry date."
      : errorParam === "missing_required"
        ? "Please complete all required patient fields before submitting."
        : null

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
    const dateOfBirth = (formData.get("date_of_birth") as string) || ""
    const gender = (formData.get("gender") as string) || ""
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

    if (!fullName.trim() || !phoneNumber.trim() || !dateOfBirth || !gender) {
      redirect("/dashboard/patients/new?error=missing_required")
    }

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
      date_of_birth: dateOfBirth,
      gender,
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

      {errorMessage ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <PatientRegistrationProgress
        formId="patient-registration-form"
        labelsByFieldId={{
          full_name: "Full Name",
          date_of_birth: "Date of Birth",
          gender: "Gender",
          phone_number: "Phone Number",
        }}
        sections={[
          { id: "patient-demographics", label: "Demographics", requiredFields: ["full_name", "date_of_birth", "gender"] },
          { id: "patient-contact", label: "Contact", requiredFields: ["phone_number"] },
          { id: "patient-insurance", label: "Insurance", requiredFields: [] },
        ]}
      />

      <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Complete the form from top to bottom. Required fields create the patient record first, while insurance and next
        of kin details improve reporting and follow-up later.
      </div>

      <PatientRegistrationForm companies={companies || []} action={createPatient} />
    </div>
  )
}
