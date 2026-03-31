import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function NewLabTestPage(props: { searchParams: Promise<{ patient_id?: string }> }) {
  const supabase = await createServerClient()

  const { patient_id: searchPatientId } = await props.searchParams

  // Fetch patients
  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name, patient_number")
    .eq("status", "active")
    .order("full_name")

  async function createLabTest(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect("/auth/login")
    }

    const testData = {
      patient_id: formData.get("patient_id") as string,
      doctor_id: user.id,
      test_type: formData.get("test_type") as string,
      test_category: formData.get("test_category") as string,
      priority: formData.get("priority") as string,
      notes: formData.get("notes") as string,
      status: "pending",
      created_by: user.id,
    }

    const { data, error } = await supabase.from("lab_tests").insert(testData).select().single()

    if (error || !data) {
      console.error("[v0] Error creating lab test:", error)
      throw error || new Error("Failed to create lab test")
    }

    try {
      await supabase.from("lab_audit_logs").insert({
        lab_test_id: data.id,
        actor_user_id: user.id,
        action: "created",
        old_status: null,
        new_status: "pending",
        notes: testData.notes || null,
      })
    } catch (auditError) {
      console.error("[v0] Error logging lab test creation:", auditError)
    }

    redirect(`/dashboard/lab/${data.id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/lab">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Lab Tests
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">Order New Lab Test</h1>
            <p className="text-pretty text-muted-foreground">Create a new laboratory test order</p>
          </div>
        </div>
      </div>

      <form action={createLabTest}>
        <Card>
          <CardHeader>
            <CardTitle>Test Details</CardTitle>
            <CardDescription>Select patient and test information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Patient *</Label>
              <Select name="patient_id" defaultValue={searchPatientId} required>
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

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Test Category *</Label>
                <Select name="test_category" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Hematology">Hematology</SelectItem>
                    <SelectItem value="Clinical Chemistry">Clinical Chemistry</SelectItem>
                    <SelectItem value="Microbiology">Microbiology</SelectItem>
                    <SelectItem value="Immunology">Immunology</SelectItem>
                    <SelectItem value="Urinalysis">Urinalysis</SelectItem>
                    <SelectItem value="Parasitology">Parasitology</SelectItem>
                    <SelectItem value="Blood Bank">Blood Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="test_type">Test Type *</Label>
                <Input id="test_type" name="test_type" placeholder="e.g., Complete Blood Count" required />
              </div>

              <div className="space-y-2">
                <Label>Priority *</Label>
                <Select name="priority" defaultValue="routine" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="routine">Routine</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="stat">STAT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Clinical Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Clinical indication or additional information..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/lab">Cancel</Link>
          </Button>
          <Button type="submit">Order Test</Button>
        </div>
      </form>
    </div>
  )
}
