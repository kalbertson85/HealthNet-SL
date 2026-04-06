import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { LabTestCreateForm } from "@/components/lab-test-create-form"

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

      <LabTestCreateForm patients={patients || []} defaultPatientId={searchPatientId || ""} action={createLabTest} />
    </div>
  )
}
