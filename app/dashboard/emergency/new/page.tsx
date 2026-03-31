import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"

export default async function NewEmergencyPage() {
  const supabase = await createServerClient()

  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "emergency.manage")) {
    redirect("/dashboard")
  }

  // Fetch active patients for triage assignment
  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name, patient_number")
    .eq("status", "active")
    .order("full_name")

  async function createEmergency(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const { user, profile } = await getSessionUserAndProfile()

    if (!user) {
      redirect("/auth/login")
    }

    const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
    if (!can(rbacUser, "emergency.manage")) {
      redirect("/dashboard")
    }

    const arrivalMode = (formData.get("arrival_mode") as string) || null
    const notes = ((formData.get("notes") as string) || "").trim()

    const ambulanceVehicle = ((formData.get("ambulance_vehicle") as string) || "").trim()
    const ambulanceCrew = ((formData.get("ambulance_crew") as string) || "").trim()
    const ambulanceTreatment = ((formData.get("ambulance_treatment") as string) || "").trim()
    const ambulanceCallToArrival = ((formData.get("ambulance_call_to_arrival") as string) || "").trim()

    let assessmentNotes = notes

    if (arrivalMode === "ambulance") {
      const ambulanceParts: string[] = []
      if (ambulanceVehicle) ambulanceParts.push(`vehicle=${ambulanceVehicle}`)
      if (ambulanceCrew) ambulanceParts.push(`crew=${ambulanceCrew}`)
      if (ambulanceTreatment) ambulanceParts.push(`prehospital=${ambulanceTreatment}`)
      if (ambulanceCallToArrival) ambulanceParts.push(`call_to_arrival_min=${ambulanceCallToArrival}`)

      const ambulanceLine = ambulanceParts.length > 0 ? `AMBULANCE: ${ambulanceParts.join("; ")}` : "AMBULANCE: arrival_by_ambulance"

      assessmentNotes = assessmentNotes ? `${ambulanceLine}\n${assessmentNotes}` : ambulanceLine
    }

    const triageData = {
      patient_id: formData.get("patient_id") as string,
      triage_level: formData.get("triage_level") as string,
      chief_complaint: (formData.get("chief_complaint") as string) || "",
      arrival_mode: arrivalMode,
      assessment_notes: assessmentNotes || null,
      status: "pending",
      arrival_time: new Date().toISOString(),
    }

    const { data: newTriage, error } = await supabase.from("triage_assessments").insert(triageData).select().single()

    if (error || !newTriage) {
      console.error("[v0] Error creating emergency triage:", error?.message || error)
      throw error || new Error("Failed to create triage assessment")
    }

    try {
      await supabase.from("triage_audit_logs").insert({
        triage_id: newTriage.id,
        actor_user_id: user.id,
        action: "created",
        old_status: null,
        new_status: "pending",
      })
    } catch (auditError) {
      console.error("[v0] Error logging triage creation:", auditError)
    }

    // Ensure the patient is also present in the emergency queue with highest priority
    try {
      const { data: queueNumberResult, error: queueNumberError } = await supabase.rpc("generate_queue_number", {
        dept: "emergency",
      })

      if (queueNumberError) {
        console.error("[v0] Error generating emergency queue number:", queueNumberError.message || queueNumberError)
      }

      const queueNumber = (queueNumberResult as string | null) ?? null

      await supabase.from("queues").insert({
        patient_id: triageData.patient_id,
        department: "emergency",
        // Fallback queue number if the generator function fails but we still want a usable entry
        queue_number: queueNumber || "EMG-000",
        priority: "emergency",
        status: "waiting",
        notes: triageData.chief_complaint,
      })
    } catch (queueError) {
      console.error("[v0] Error creating emergency queue entry:", queueError)
    }

    redirect("/dashboard/emergency")
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/emergency">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Emergency
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">New Emergency Triage</h1>
            <p className="text-pretty text-muted-foreground">
              Capture a new emergency case and assign an initial triage level.
            </p>
          </div>
        </div>
      </div>

      <form action={createEmergency}>
        <Card>
          <CardHeader>
            <CardTitle>Emergency Details</CardTitle>
            <CardDescription>Select patient, triage level, and capture key information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="patient_id">Patient *</Label>
              <Select name="patient_id" required>
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
                <Label htmlFor="triage_level">Triage Level *</Label>
                <Select name="triage_level" defaultValue="red" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select triage level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="red">Critical (Red)</SelectItem>
                    <SelectItem value="orange">Emergency (Orange)</SelectItem>
                    <SelectItem value="yellow">Urgent (Yellow)</SelectItem>
                    <SelectItem value="green">Minor (Green)</SelectItem>
                    <SelectItem value="blue">Non-Urgent (Blue)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="arrival_mode">Arrival Mode</Label>
                <Select name="arrival_mode">
                  <SelectTrigger>
                    <SelectValue placeholder="Select arrival mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walk_in">Walk-in</SelectItem>
                    <SelectItem value="ambulance">Ambulance</SelectItem>
                    <SelectItem value="referred">Referred</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 border rounded-md p-4">
              <p className="text-sm font-medium">Ambulance details (optional)</p>
              <p className="text-xs text-muted-foreground">
                If the patient arrived by ambulance, capture handover details for audit and future reporting.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ambulance_vehicle">Ambulance / Vehicle ID</Label>
                  <Input
                    id="ambulance_vehicle"
                    name="ambulance_vehicle"
                    placeholder="e.g. SL-AMB-01"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ambulance_crew">Crew Name(s)</Label>
                  <Input
                    id="ambulance_crew"
                    name="ambulance_crew"
                    placeholder="e.g. Nurse Kargbo, Driver Conteh"
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ambulance_treatment">Pre-hospital treatment</Label>
                  <Textarea
                    id="ambulance_treatment"
                    name="ambulance_treatment"
                    rows={2}
                    placeholder="e.g. Oxygen, IV fluids, splinting"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ambulance_call_to_arrival">Call to arrival time (min)</Label>
                  <Input
                    id="ambulance_call_to_arrival"
                    name="ambulance_call_to_arrival"
                    type="number"
                    min={0}
                    placeholder="e.g. 18"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="chief_complaint">Chief Complaint *</Label>
              <Textarea
                id="chief_complaint"
                name="chief_complaint"
                required
                rows={3}
                placeholder="Briefly describe the main issue or reason for emergency visit..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="Any additional observations, vital signs, or context..."
              />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/emergency">Cancel</Link>
          </Button>
          <Button type="submit" className="bg-red-600 hover:bg-red-700">
            Save Emergency
          </Button>
        </div>
      </form>
    </div>
  )
}
