import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { LabTestCreateForm } from "@/components/lab-test-create-form"
import { ensureVisitAutoChargeLine } from "@/lib/pricing-engine"
import { requireServerActionPermission, parseUuidOptional } from "@/lib/server-action-security"

export default async function NewLabTestPage(props: {
  searchParams: Promise<{ patient_id?: string; visit_id?: string; error?: string }>
}) {
  const supabase = await createServerClient()

  const { patient_id: searchPatientId, visit_id: searchVisitId, error: errorCode } = await props.searchParams
  const errorMessage =
    errorCode === "create_failed"
      ? "Lab test creation failed and no partial records were saved."
      : errorCode === "audit_log_failed"
        ? "Lab test creation was rolled back because audit logging failed."
        : null

  // Fetch patients
  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name, patient_number")
    .eq("status", "active")
    .order("full_name")

  async function createLabTest(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("lab.manage")

    const testData = {
      patient_id: formData.get("patient_id") as string,
      visit_id: parseUuidOptional(formData.get("visit_id")),
      doctor_id: user.id as string,
      test_type: formData.get("test_type") as string,
      test_category: formData.get("test_category") as string,
      priority: formData.get("priority") as string,
      notes: formData.get("notes") as string,
      status: "pending",
      created_by: user.id as string,
    }
    const allowDuplicate = ((formData.get("allow_duplicate") as string | null) || "").trim() === "true"

    const duplicateWindowStart = new Date()
    duplicateWindowStart.setDate(duplicateWindowStart.getDate() - 7)

    const { data: recentDuplicate } = await supabase
      .from("lab_tests")
      .select("id, test_number, created_at, status")
      .eq("patient_id", testData.patient_id)
      .ilike("test_type", testData.test_type.trim())
      .neq("status", "cancelled")
      .gte("created_at", duplicateWindowStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentDuplicate && !allowDuplicate) {
      throw new Error("A similar lab test already exists for this patient within the last 7 days. Review it before ordering another.")
    }

    const { data, error } = await supabase.from("lab_tests").insert(testData).select().single()

    if (error || !data) {
      console.error("[v0] Error creating lab test:", error)
      redirect("/dashboard/lab/new?error=create_failed")
    }

    const { error: auditError } = await supabase.from("lab_audit_logs").insert({
      lab_test_id: data.id,
      actor_user_id: user.id,
      action: "created",
      old_status: null,
      new_status: "pending",
      notes: testData.notes || null,
    })
    if (auditError) {
      await supabase.from("lab_tests").delete().eq("id", data.id)
      redirect("/dashboard/lab/new?error=audit_log_failed")
    }

    if (testData.visit_id) {
      try {
        await ensureVisitAutoChargeLine(supabase, {
          visitId: testData.visit_id,
          actorUserId: user.id,
          serviceType: "lab",
          description: `Lab test: ${testData.test_type}`,
          quantity: 1,
          mode: "replace",
        })
      } catch (chargeError) {
        console.error("[v0] Error creating lab auto-charge line:", chargeError)
        await supabase.from("lab_audit_logs").delete().eq("lab_test_id", data.id)
        await supabase.from("lab_tests").delete().eq("id", data.id)
        redirect("/dashboard/lab/new?error=create_failed")
      }
    }

    redirect(`/dashboard/lab/${data.id}`)
  }

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}
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

      <LabTestCreateForm
        patients={patients || []}
        defaultPatientId={searchPatientId || ""}
        defaultVisitId={searchVisitId || ""}
        action={createLabTest}
      />
    </div>
  )
}
