"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FormDraftStatus } from "@/components/form-draft-status"
import { FormHelpTip } from "@/components/form-help-tip"
import { useLocalDraft } from "@/lib/use-local-draft"

interface CompanyOption {
  id: string
  name: string | null
}

interface PatientRegistrationDraft {
  full_name: string
  date_of_birth: string
  gender: string
  blood_group: string
  phone_number: string
  email: string
  national_id: string
  free_health_category: string
  address: string
  emergency_contact_name: string
  emergency_contact_phone: string
  next_of_kin_name: string
  next_of_kin_relationship: string
  next_of_kin_phone: string
  next_of_kin_address: string
  allergies: string
  medical_history: string
  insurance_type: string
  company_id: string
  insurance_card_number: string
  insurance_card_serial: string
  insurance_expiry_date: string
  insurance_mobile: string
  employee_insurance_id: string
}

export function PatientRegistrationForm({
  companies,
  action,
}: {
  companies: CompanyOption[]
  action: (formData: FormData) => void | Promise<void>
}) {
  const initialValue: PatientRegistrationDraft = {
    full_name: "",
    date_of_birth: "",
    gender: "",
    blood_group: "",
    phone_number: "",
    email: "",
    national_id: "",
    free_health_category: "none",
    address: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    next_of_kin_name: "",
    next_of_kin_relationship: "",
    next_of_kin_phone: "",
    next_of_kin_address: "",
    allergies: "",
    medical_history: "",
    insurance_type: "",
    company_id: "",
    insurance_card_number: "",
    insurance_card_serial: "",
    insurance_expiry_date: "",
    insurance_mobile: "",
    employee_insurance_id: "",
  }

  const { value, setValue, lastSavedAt, resetDraft } = useLocalDraft("draft:patients:new", initialValue)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const update = <K extends keyof PatientRegistrationDraft>(field: K, fieldValue: PatientRegistrationDraft[K]) => {
    setValue({ ...value, [field]: fieldValue })
  }

  return (
    <>
      <FormDraftStatus
        title="Patient registration draft"
        description="Registration details are saved locally on this device while you complete the form."
        lastSavedAt={lastSavedAt}
        onClear={resetDraft}
      />

      <form
        id="patient-registration-form"
        action={async (formData) => {
          setIsSubmitting(true)
          await action(formData)
        }}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
            <CardDescription>Basic demographic and contact information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div id="patient-demographics" className="grid gap-4 md:grid-cols-2 scroll-mt-24">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="full_name">Full Name *</Label>
                  <FormHelpTip text="Enter the patient name exactly as it should appear in records and printed documents." />
                </div>
                <Input id="full_name" name="full_name" value={value.full_name} onChange={(e) => update("full_name", e.target.value)} required />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="date_of_birth">Date of Birth *</Label>
                  <FormHelpTip text="Date of birth improves age-based triage, eligibility checks, and reporting." />
                </div>
                <Input
                  id="date_of_birth"
                  name="date_of_birth"
                  type="date"
                  value={value.date_of_birth}
                  onChange={(e) => update("date_of_birth", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="gender">Gender *</Label>
                  <FormHelpTip text="Used in routine reporting and some clinical workflows." />
                </div>
                <select
                  id="gender"
                  name="gender"
                  required
                  aria-label="Gender"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={value.gender}
                  onChange={(e) => update("gender", e.target.value)}
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
                  value={value.blood_group}
                  onChange={(e) => update("blood_group", e.target.value)}
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
                <div className="flex items-center gap-1">
                  <Label htmlFor="phone_number">Phone Number *</Label>
                  <FormHelpTip text="Use the most reliable contact number for reminders and urgent follow-up." />
                </div>
                <Input
                  id="phone_number"
                  name="phone_number"
                  type="tel"
                  value={value.phone_number}
                  onChange={(e) => update("phone_number", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" value={value.email} onChange={(e) => update("email", e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="national_id">National ID</Label>
                <Input
                  id="national_id"
                  name="national_id"
                  placeholder="e.g. NIN or national ID number"
                  value={value.national_id}
                  onChange={(e) => update("national_id", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="free_health_category">Free Health Care category</Label>
                <select
                  id="free_health_category"
                  name="free_health_category"
                  aria-label="Free Health Care category"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={value.free_health_category}
                  onChange={(e) => update("free_health_category", e.target.value)}
                >
                  <option value="none">Not Free Health Care</option>
                  <option value="u5">Under 5 years</option>
                  <option value="pregnant">Pregnant woman</option>
                  <option value="lactating">Lactating mother</option>
                </select>
              </div>
            </div>

            <div id="patient-contact" className="space-y-2 scroll-mt-24">
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" name="address" rows={2} value={value.address} onChange={(e) => update("address", e.target.value)} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="emergency_contact_name">Emergency Contact Name</Label>
                <Input
                  id="emergency_contact_name"
                  name="emergency_contact_name"
                  value={value.emergency_contact_name}
                  onChange={(e) => update("emergency_contact_name", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="emergency_contact_phone">Emergency Contact Phone</Label>
                <Input
                  id="emergency_contact_phone"
                  name="emergency_contact_phone"
                  type="tel"
                  value={value.emergency_contact_phone}
                  onChange={(e) => update("emergency_contact_phone", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="next_of_kin_name">Next of Kin Name</Label>
                  <Input
                    id="next_of_kin_name"
                    name="next_of_kin_name"
                    value={value.next_of_kin_name}
                    onChange={(e) => update("next_of_kin_name", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="next_of_kin_relationship">Relationship</Label>
                  <Input
                    id="next_of_kin_relationship"
                    name="next_of_kin_relationship"
                    placeholder="e.g. Spouse, Parent"
                    value={value.next_of_kin_relationship}
                    onChange={(e) => update("next_of_kin_relationship", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="next_of_kin_phone">Next of Kin Phone</Label>
                  <Input
                    id="next_of_kin_phone"
                    name="next_of_kin_phone"
                    type="tel"
                    value={value.next_of_kin_phone}
                    onChange={(e) => update("next_of_kin_phone", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="next_of_kin_address">Next of Kin Address</Label>
                  <Textarea
                    id="next_of_kin_address"
                    name="next_of_kin_address"
                    rows={2}
                    value={value.next_of_kin_address}
                    onChange={(e) => update("next_of_kin_address", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="allergies">Allergies</Label>
              <Textarea
                id="allergies"
                name="allergies"
                placeholder="List any known allergies..."
                rows={2}
                value={value.allergies}
                onChange={(e) => update("allergies", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="medical_history">Medical History</Label>
              <Textarea
                id="medical_history"
                name="medical_history"
                placeholder="Previous medical conditions, surgeries, etc..."
                rows={3}
                value={value.medical_history}
                onChange={(e) => update("medical_history", e.target.value)}
              />
            </div>

            <div id="patient-insurance" className="space-y-4 border-t pt-4 scroll-mt-24">
              <div>
                <h2 className="text-base font-semibold">Insurance & Company</h2>
                <p className="text-xs text-muted-foreground">
                  Capture company insurance details for employees and dependents.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="insurance_type">Insurance type</Label>
                    <FormHelpTip text="Choose Employee or Dependent only when the patient is covered by a registered company scheme." />
                  </div>
                  <select
                    id="insurance_type"
                    name="insurance_type"
                    aria-label="Insurance type"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={value.insurance_type}
                    onChange={(e) => update("insurance_type", e.target.value)}
                  >
                    <option value="">None</option>
                    <option value="employee">Employee</option>
                    <option value="dependent">Dependent</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="company_id">Company</Label>
                    <FormHelpTip text="Required for insured employee and dependent registrations so billing can route correctly." />
                  </div>
                  <select
                    id="company_id"
                    name="company_id"
                    aria-label="Company"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={value.company_id}
                    onChange={(e) => update("company_id", e.target.value)}
                  >
                    <option value="">Select company</option>
                    {companies.map((company) => (
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
                    value={value.insurance_card_number}
                    onChange={(e) => update("insurance_card_number", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insurance_card_serial">Card serial</Label>
                  <Input
                    id="insurance_card_serial"
                    name="insurance_card_serial"
                    placeholder="Serial printed on card (optional)"
                    value={value.insurance_card_serial}
                    onChange={(e) => update("insurance_card_serial", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insurance_expiry_date">Insurance expiry date</Label>
                  <Input
                    id="insurance_expiry_date"
                    name="insurance_expiry_date"
                    type="date"
                    value={value.insurance_expiry_date}
                    onChange={(e) => update("insurance_expiry_date", e.target.value)}
                  />
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
                    value={value.insurance_mobile}
                    onChange={(e) => update("insurance_mobile", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee_insurance_id">Employee insurance ID (for dependents)</Label>
                  <Input
                    id="employee_insurance_id"
                    name="employee_insurance_id"
                    placeholder="Employee's insurance ID for this dependent"
                    value={value.employee_insurance_id}
                    onChange={(e) => update("employee_insurance_id", e.target.value)}
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
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Registering..." : "Register Patient"}
          </Button>
        </div>
      </form>
    </>
  )
}
