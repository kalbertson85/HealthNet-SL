import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { requireServerActionPermission } from "@/lib/server-action-security"
import { z } from "zod"

interface VisitOption {
  id: string
  created_at: string
  patients?: {
    id: string
    full_name?: string | null
    patient_number?: string | null
  } | Array<{
    id: string
    full_name?: string | null
    patient_number?: string | null
  }> | null
  facilities?: {
    name?: string | null
    code?: string | null
  } | Array<{
    name?: string | null
    code?: string | null
  }> | null
}

interface MedicationOption {
  id: string
  name: string | null
  strength: string | null
  form: string | null
}
interface WardRequestInsertItem {
  request_id: string
  medication_id: string
  dose: string | null
  frequency: string | null
  route: string | null
  duration: string | null
  quantity_requested: number
}

export const revalidate = 0

export default async function NursingWardRequestPage(props: { searchParams?: Promise<{ error?: string }> }) {
  const supabase = await createServerClient()
  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const errorCode = resolvedSearchParams?.error

  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: visitsData } = await supabase
    .from("visits")
    .select(
      `id, created_at,
       patients(id, full_name, patient_number),
       facilities(name, code)`,
    )
    .order("created_at", { ascending: false })
    .limit(50)

  const visits = (visitsData || []) as VisitOption[]

  const { data: medsData } = await supabase
    .from("medications")
    .select("id, name, strength, form")
    .order("name")
    .limit(200)

  const medications = (medsData || []) as MedicationOption[]

  async function createWardRequest(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("inpatient.manage")
    const parsedHeader = z
      .object({
        ward_name: z.string().trim().min(1).max(120),
        visit_id: z.string().uuid(),
        notes: z.string().trim().max(2000).optional(),
      })
      .safeParse({
        ward_name: formData.get("ward_name"),
        visit_id: formData.get("visit_id"),
        notes: formData.get("notes"),
      })
    if (!parsedHeader.success) {
      redirect("/dashboard/nursing/ward-request")
    }
    const wardName = parsedHeader.data.ward_name
    const visitId = parsedHeader.data.visit_id
    const notes = parsedHeader.data.notes || null

    // Look up patient_id from visit
    const { data: visitRow } = await supabase
      .from("visits")
      .select("patient_id")
      .eq("id", visitId)
      .maybeSingle()

    const patientId = (visitRow?.patient_id as string | null) ?? null

    const { data: newRequest, error: requestError } = await supabase
      .from("ward_medication_requests")
      .insert({
        ward_name: wardName,
        visit_id: visitId,
        patient_id: patientId,
        requested_by: user.id,
        status: "pending",
        notes,
      })
      .select()
      .single()

    if (requestError || !newRequest) {
      console.error("[nursing] Error creating ward medication request:", requestError?.message || requestError)
      redirect("/dashboard/nursing/ward-request")
    }

    // Up to three medication line items in one request
    const itemsToInsert: WardRequestInsertItem[] = []
    for (let i = 1; i <= 3; i++) {
      const medId = (formData.get(`medication_id_${i}`) as string | null) ?? null
      const qtyRaw = (formData.get(`quantity_requested_${i}`) as string | null) ?? null
      const dose = ((formData.get(`dose_${i}`) as string | null) ?? "").trim() || null
      const frequency = ((formData.get(`frequency_${i}`) as string | null) ?? "").trim() || null
      const route = ((formData.get(`route_${i}`) as string | null) ?? "").trim() || null
      const duration = ((formData.get(`duration_${i}`) as string | null) ?? "").trim() || null

      const lineParsed = z
        .object({
          medication_id: z.string().uuid(),
          quantity_requested: z.coerce.number().int().min(1).max(1000000),
        })
        .safeParse({
          medication_id: medId,
          quantity_requested: qtyRaw,
        })

      if (!lineParsed.success) continue

      itemsToInsert.push({
        request_id: newRequest.id as string,
        medication_id: lineParsed.data.medication_id,
        dose,
        frequency,
        route,
        duration,
        quantity_requested: lineParsed.data.quantity_requested,
      })
    }

    if (itemsToInsert.length === 0) {
      // No valid items captured; clean up header and redirect
      await supabase.from("ward_medication_requests").delete().eq("id", newRequest.id as string)
      redirect("/dashboard/nursing/ward-request")
    }

    const { error: itemsInsertError } = await supabase.from("ward_medication_request_items").insert(itemsToInsert)
    if (itemsInsertError) {
      await supabase.from("ward_medication_requests").delete().eq("id", newRequest.id as string)
      redirect("/dashboard/nursing/ward-request?error=items_save_failed")
    }

    redirect("/dashboard/nursing")
  }

  const errorMessage = (() => {
    switch (errorCode) {
      case "items_save_failed":
        return "Ward request was rolled back because medication items could not be saved."
      default:
        return null
    }
  })()

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">New ward medication request</h1>
          <p className="text-pretty text-muted-foreground text-sm">
            Create a medication request for a ward patient; pharmacy will review and dispense.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/nursing">Back to Nursing</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request details</CardTitle>
          <CardDescription>Select the visit, ward, and one medication to request.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createWardRequest} className="grid gap-4 md:grid-cols-2 text-sm">
            <div className="space-y-1">
              <Label htmlFor="ward_name">Ward name</Label>
              <Input
                id="ward_name"
                name="ward_name"
                required
                placeholder="e.g. Surgical Ward, Paediatrics"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="visit_id">Visit / patient</Label>
              <Select name="visit_id" required>
                <SelectTrigger id="visit_id">
                  <SelectValue placeholder="Select visit" />
                </SelectTrigger>
                <SelectContent>
                  {visits.map((visit) => {
                    const patient = Array.isArray(visit.patients) ? visit.patients[0] : visit.patients
                    const facility = Array.isArray(visit.facilities) ? visit.facilities[0] : visit.facilities
                    const labelParts = [
                      patient?.full_name,
                      patient?.patient_number,
                      visit.created_at ? new Date(visit.created_at).toLocaleDateString() : null,
                      facility?.name
                        ? `${facility.name}${
                            facility.code ? ` (${facility.code})` : ""
                          }`
                        : null,
                    ].filter(Boolean)
                    return (
                      <SelectItem key={visit.id} value={visit.id}>
                        {labelParts.join(" • ")}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="notes">Nursing notes (optional)</Label>
              <Input
                id="notes"
                name="notes"
                placeholder="Reason for request, timing, special instructions, etc."
              />
            </div>

            {[1, 2, 3].map((index) => (
              <div key={index} className="md:col-span-2 border rounded-md p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Medication line {index}</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor={`medication_id_${index}`}>Medication</Label>
                    <Select name={`medication_id_${index}`}>
                      <SelectTrigger id={`medication_id_${index}`}>
                        <SelectValue placeholder="Select medication" />
                      </SelectTrigger>
                      <SelectContent>
                        {medications.map((med) => {
                          const labelParts = [med.name, med.strength, med.form].filter(Boolean)
                          return (
                            <SelectItem key={med.id} value={med.id}>
                              {labelParts.join(" ") || "Unnamed"}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`quantity_requested_${index}`}>Qty</Label>
                    <Input
                      id={`quantity_requested_${index}`}
                      name={`quantity_requested_${index}`}
                      type="number"
                      min={1}
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1">
                    <Label htmlFor={`dose_${index}`}>Dose</Label>
                    <Input id={`dose_${index}`} name={`dose_${index}`} placeholder="e.g. 1g IV" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`frequency_${index}`}>Frequency</Label>
                    <Input id={`frequency_${index}`} name={`frequency_${index}`} placeholder="e.g. 8-hourly" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`route_${index}`}>Route</Label>
                    <Input id={`route_${index}`} name={`route_${index}`} placeholder="e.g. IV" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`duration_${index}`}>Duration</Label>
                    <Input id={`duration_${index}`} name={`duration_${index}`} placeholder="e.g. 3 days" />
                  </div>
                </div>
              </div>
            ))}

            <div className="md:col-span-2 flex justify-end">
              <Button type="submit">Submit request</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
