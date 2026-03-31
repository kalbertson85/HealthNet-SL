import { createServerClient } from "@/lib/supabase/server"
import { notFound, redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { assertVisitTransition, type VisitStatus } from "@/lib/visits"
import { InvoiceLineItems } from "../InvoiceLineItems"

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  type?: string
}

interface VisitPatient {
  full_name?: string | null
  patient_number?: string | null
  insurance_type?: string | null
  company_id?: string | null
  insurance_card_number?: string | null
  insurance_expiry_date?: string | null
}

export default async function VisitBillingPage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string }>
}) {
  const supabase = await createServerClient()
  const { id: visitId } = await props.params

  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const errorCode = resolvedSearchParams?.error

  const [{ data: visit, error: visitError }, { data: companies }, { data: admissionForVisit }] = await Promise.all([
    supabase
      .from("visits")
      .select(
        `id, patient_id, visit_status, diagnosis, prescription_list, assigned_company_id, is_free_health_care, payer_category, facility_id,
         patients(full_name, patient_number, insurance_type, company_id, insurance_card_number, insurance_expiry_date),
         facilities(name, code)`
      )
      .eq("id", visitId)
      .maybeSingle(),
    supabase.from("companies").select("id, name").order("name"),
    supabase
      .from("admissions")
      .select("id, status")
      .eq("visit_id", visitId)
      .in("status", ["admitted"])
      .maybeSingle(),
  ])

  if (visitError) {
    console.error("[v0] Error loading visit for billing:", visitError.message || visitError)
  }

  if (!visit) {
    notFound()
  }

  // Supabase can sometimes represent related records as arrays; normalize to a single patient object
  const rawPatients = (visit as { patients?: VisitPatient | VisitPatient[] | null }).patients
  const patient: VisitPatient | null = Array.isArray(rawPatients)
    ? rawPatients[0] ?? null
    : rawPatients ?? null

  const rawFacilities = (visit as { facilities?: { name?: string | null; code?: string | null } | { name?: string | null; code?: string | null }[] | null }).facilities
  const facility = Array.isArray(rawFacilities) ? rawFacilities[0] ?? null : rawFacilities ?? null

  const insuranceType = (patient?.insurance_type || "").toLowerCase()
  const insuranceExpiryStr = patient?.insurance_expiry_date || null
  const insuranceExpiryDate = insuranceExpiryStr ? new Date(insuranceExpiryStr) : null
  const now = new Date()
  const isInsuranceValid =
    Boolean(insuranceExpiryDate) &&
    insuranceExpiryDate!.getTime() >= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  const defaultCompanyId = visit.assigned_company_id || patient?.company_id || null
  const defaultPayerType: "patient" | "company" =
    insuranceType && defaultCompanyId && isInsuranceValid ? "company" : "patient"

  const { data: existingInvoice } = await supabase
    .from("invoices")
    .select("id, patient_id, total_amount, paid_amount, status, payer_type, company_id")
    .eq("visit_id", visitId)
    .maybeSingle()

  let existingInvoiceItems: LineItem[] = []

  if (existingInvoice?.id) {
    const { data: invoiceItems, error: invoiceItemsError } = await supabase
      .from("invoice_items")
      .select("description, quantity, unit_price")
      .eq("invoice_id", existingInvoice.id as string)

    if (invoiceItemsError) {
      console.error("[v0] Error loading invoice items for visit billing:", invoiceItemsError.message || invoiceItemsError)
    }

    existingInvoiceItems = (invoiceItems || []).map((item) => ({
      description: (item.description as string) || "",
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
    })) as LineItem[]
  }

  const errorMessage = (() => {
    switch (errorCode) {
      case "visit_transition_invalid":
        return "This visit could not be advanced to Pharmacy because its current status does not allow that transition. Please refresh and confirm the visit is in the billing_pending stage before trying again."
      default:
        return null
    }
  })()

  async function saveInvoice(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const { user } = await getSessionUserAndProfile()

    if (!user) {
      redirect("/auth/login")
    }

    const visitId = formData.get("visit_id") as string
    const payerType = ((formData.get("payer_type") as string | null) || "patient").trim() || "patient"
    const companyId = ((formData.get("company_id") as string | null) || "").trim() || null

    const descriptions = formData.getAll("item_description") as string[]
    const quantities = formData.getAll("item_quantity") as string[]
    const unitPrices = formData.getAll("item_unit_price") as string[]
    const itemTypes = formData.getAll("item_type") as string[]

    const items: LineItem[] = descriptions
      .map((description, index): LineItem => {
        const quantity = Number(quantities[index] || 0)
        const unit_price = Number(unitPrices[index] || 0)
        const item_type = (itemTypes[index] as string | undefined) || "billable"
        return { description, quantity, unit_price, type: item_type }
      })
      .filter((item) => item.description && item.quantity > 0 && item.unit_price >= 0)

    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)

    // Ensure we have a patient for this visit, and check if this is a Free Health Care visit
    const { data: visitRow } = await supabase
      .from("visits")
      .select("patient_id, is_free_health_care")
      .eq("id", visitId)
      .maybeSingle()

    const patientId = (visitRow?.patient_id as string | null) ?? null
    const isFreeHealthCareVisit = Boolean(visitRow?.is_free_health_care)

    // For Sierra Leone Free Health Care visits, we record economic prices in line items
    // but only bill for items that are not explicitly marked as FHC-covered.
    const billableSubtotal = items.reduce((sum, item) => {
      const item_type = (item.type as string | undefined) || "billable"
      if (isFreeHealthCareVisit && item_type === "fhc_covered") return sum
      return sum + item.quantity * item.unit_price
    }, 0)

    const total = isFreeHealthCareVisit ? billableSubtotal : subtotal

    let invoiceId: string | null = (existingInvoice?.id as string | null) ?? null
    const payerValue = payerType === "company" ? "company" : "patient"

    if (!invoiceId) {
      // Generate a simple invoice number similar to the standalone New Invoice page
      const generatedInvoiceNumber = `INV-${Date.now().toString().slice(-6)}`

      const { data: inserted, error: insertError } = await supabase
        .from("invoices")
        .insert({
          invoice_number: generatedInvoiceNumber,
          visit_id: visitId,
          patient_id: patientId,
          total_amount: total,
          paid_amount: 0,
          status: "pending",
          created_by: user.id,
          payer_type: payerValue,
          company_id: payerValue === "company" ? companyId : null,
        })
        .select("id, status, total_amount")
        .maybeSingle()

      if (insertError || !inserted) {
        console.error("[v0] Error creating invoice for visit:", insertError?.message || insertError)
        redirect(`/dashboard/billing/visit/${visitId}`)
      }

      invoiceId = inserted.id as string

      try {
        await supabase.from("billing_audit_logs").insert({
          invoice_id: invoiceId,
          actor_user_id: user.id,
          action: "created",
          old_status: null,
          new_status: inserted.status as string,
          amount: inserted.total_amount as number,
          metadata: {
            source: "visit_billing",
            visit_id: visitId,
            payer_type: payerValue,
          },
        })
      } catch (auditError) {
        console.error("[v0] Error logging visit invoice creation:", auditError)
      }
    } else {
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          total_amount: total,
          payer_type: payerValue,
          company_id: payerValue === "company" ? companyId : null,
        })
        .eq("id", invoiceId)

      if (updateError) {
        console.error("[v0] Error updating invoice for visit:", updateError.message || updateError)
      } else {
        try {
          await supabase.from("billing_audit_logs").insert({
            invoice_id: invoiceId,
            actor_user_id: user.id,
            action: "updated",
            old_status: existingInvoice?.status ?? null,
            new_status: existingInvoice?.status ?? null,
            amount: total,
            metadata: {
              source: "visit_billing",
              visit_id: visitId,
              payer_type: payerValue,
            },
          })
        } catch (auditError) {
          console.error("[v0] Error logging visit invoice update:", auditError)
        }
      }
    }

    if (invoiceId) {
      // Replace invoice_items with the current set of line items
      const { error: deleteError } = await supabase
        .from("invoice_items")
        .delete()
        .eq("invoice_id", invoiceId)

      if (deleteError) {
        console.error("[v0] Error clearing existing invoice items:", deleteError.message || deleteError)
      }

      if (items.length > 0) {
        const invoiceItemsPayload = items.map((baseItem: LineItem) => {
          const item_type = (baseItem.type as string | undefined) || "billable"
          const rawAmount = baseItem.quantity * baseItem.unit_price

          // For FHC visits, zero out only items explicitly marked as fhc_covered
          const amount = isFreeHealthCareVisit && item_type === "fhc_covered" ? 0 : rawAmount

          return {
            invoice_id: invoiceId as string,
            description: baseItem.description,
            quantity: baseItem.quantity,
            unit_price: baseItem.unit_price,
            amount,
            item_type,
          }
        })

        const { error: itemsError } = await supabase.from("invoice_items").insert(invoiceItemsPayload)
        if (itemsError) {
          console.error("[v0] Error inserting invoice items for visit:", itemsError.message || itemsError)
        }
      }
    }

    if (payerType === "company") {
      await supabase.from("visits").update({ assigned_company_id: companyId }).eq("id", visitId)
    } else {
      await supabase.from("visits").update({ assigned_company_id: null }).eq("id", visitId)
    }

    redirect(`/dashboard/billing/visit/${visitId}`)
  }

  async function markPaidAndSendToPharmacy(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const { user } = await getSessionUserAndProfile()

    if (!user) {
      redirect("/auth/login")
    }
    const visitId = formData.get("visit_id") as string

    const { data: invoiceBefore } = await supabase
      .from("invoices")
      .select("id, total_amount, paid_amount, status")
      .eq("visit_id", visitId)
      .maybeSingle()

    const { data: beforeVisit } = await supabase
      .from("visits")
      .select("visit_status")
      .eq("id", visitId)
      .maybeSingle()

    const currentStatus = (beforeVisit?.visit_status as VisitStatus | null) ?? null

    if (!currentStatus) {
      console.error("[v0] Billing markPaidAndSendToPharmacy: missing current visit_status", { visitId })
      redirect(`/dashboard/billing/visit/${visitId}?error=visit_transition_invalid`)
    }

    try {
      assertVisitTransition(currentStatus as VisitStatus, "pharmacy_pending")
    } catch (err) {
      console.error("[v0] Invalid visit status transition (billing -> pharmacy_pending)", {
        visitId,
        from: currentStatus,
        to: "pharmacy_pending",
        error: err instanceof Error ? err.message : String(err),
      })
      redirect(`/dashboard/billing/visit/${visitId}?error=visit_transition_invalid`)
    }

    if (!invoiceBefore) {
      console.error("[v0] Billing markPaidAndSendToPharmacy: no invoice found for visit", { visitId })
      redirect(`/dashboard/billing/visit/${visitId}?error=visit_transition_invalid`)
    }

    await supabase
      .from("invoices")
      .update({
        paid_amount: invoiceBefore?.total_amount ?? 0,
        status: "paid",
        payment_date: new Date().toISOString(),
      })
      .eq("id", invoiceBefore?.id as string)

    if (invoiceBefore) {
      try {
        await supabase.from("billing_audit_logs").insert({
          invoice_id: invoiceBefore.id as string,
          actor_user_id: user.id,
          action: "status_changed",
          old_status: (invoiceBefore.status as string | null) ?? null,
          new_status: "paid",
          amount: (invoiceBefore.total_amount as number | null) ?? null,
          metadata: {
            source: "visit_billing_mark_paid",
            visit_id: visitId,
          },
        })
      } catch (auditError) {
        console.error("[v0] Error logging visit invoice status change:", auditError)
      }
    }

    await supabase
      .from("visits")
      .update({ visit_status: "pharmacy_pending" })
      .eq("id", visitId)

    redirect("/dashboard/billing")
  }

  const initialItems: LineItem[] = existingInvoiceItems

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-balance text-3xl font-bold tracking-tight">Bill Visit</h1>
          <p className="text-pretty text-muted-foreground">
            Create or update an invoice for this visit before sending it to pharmacy.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/billing">Back to Billing</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Visit Summary</CardTitle>
              <CardDescription>Key details for billing decisions.</CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              {visit.visit_status && (
                <Badge variant="outline" className="text-[11px] font-normal">
                  Visit status: {visit.visit_status}
                </Badge>
              )}
              {visit.is_free_health_care && (
                <Badge variant="default" className="text-[11px] font-normal">
                  Free Health Care visit
                </Badge>
              )}
              {facility?.name && (
                <span className="text-[11px] text-muted-foreground">
                  {facility.name}
                  {facility.code ? ` (${facility.code})` : ""}
                </span>
              )}
              {admissionForVisit && (
                <Link
                  href={`/dashboard/inpatient/${admissionForVisit.id}`}
                  className="text-[11px] text-emerald-700 underline-offset-2 hover:underline"
                >
                  Admitted  view admission
                </Link>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {patient?.insurance_type && defaultCompanyId && (
            <div
              className={`rounded-md border px-3 py-2 text-xs ${
                isInsuranceValid ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"
              }`}
            >
              <p className="font-semibold text-xs mb-1">Insurance verification</p>
              <p>
                Type: <span className="font-medium capitalize">{patient.insurance_type}</span>
              </p>
              {patient.insurance_card_number && (
                <p>
                  Insurance ID: <span className="font-mono text-xs">{patient.insurance_card_number}</span>
                </p>
              )}
              {insuranceExpiryStr && (
                <p>
                  Expiry: {new Date(insuranceExpiryStr).toLocaleDateString()} 31
                  <span className={isInsuranceValid ? "text-emerald-700" : "text-amber-700 font-semibold"}>
                    {isInsuranceValid ? " Valid" : " Expired"}
                  </span>
                </p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {isInsuranceValid
                  ? "Insurance is valid. Billing defaults to company payer; you can switch to patient if needed."
                  : "Insurance appears expired. Choose whether to bill the company or the patient."}
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-muted-foreground">Patient</p>
            <p className="font-medium">{patient?.full_name || "Unknown patient"}</p>
            <p className="text-xs text-muted-foreground">{patient?.patient_number || "–"}</p>
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-[10px] font-mono text-muted-foreground">
            <p>visit_id: {visit.id}</p>
            <p>facility_id: {(visit as { facility_id?: string | null }).facility_id ?? "none"}</p>
            <p>payer_category: {visit.payer_category || "unknown"}</p>
            <p>is_free_health_care: {String(visit.is_free_health_care ?? false)}</p>
          </div>
          {visit.is_free_health_care && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              This visit is registered under Sierra Leone Free Health Care. Follow FHC pricing rules and do not charge
              the patient directly unless local policy requires exceptions.
            </div>
          )}
          {visit.diagnosis && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Diagnosis</p>
              <p className="text-sm">{visit.diagnosis}</p>
            </div>
          )}
          {visit.prescription_list?.notes && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Prescription</p>
              <p className="text-sm whitespace-pre-wrap">{visit.prescription_list.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <form action={saveInvoice}>
        <input type="hidden" name="visit_id" value={visitId} />
        <Card>
          <CardHeader>
            <CardTitle>Invoice Line Items</CardTitle>
            <CardDescription>Services and medicines to charge for this visit.</CardDescription>
          </CardHeader>
          <InvoiceLineItems initialItems={initialItems} />

          <CardContent className="space-y-4 pt-0">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Payer</Label>
                <div className="flex flex-col gap-2 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="payer_type"
                      value="patient"
                      defaultChecked={defaultPayerType === "patient"}
                    />
                    <span>Patient</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="payer_type"
                      value="company"
                      defaultChecked={defaultPayerType === "company"}
                    />
                    <span>Company</span>
                  </label>
                  {companies && companies.length > 0 && (
                    <div className="space-y-1">
                      <Label htmlFor="company_id">Company payer</Label>
                      <select
                        id="company_id"
                        name="company_id"
                        title="Select company payer"
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        defaultValue={defaultCompanyId || ""}
                      >
                        <option value="">Select company</option>
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <Label>Totals</Label>
                <p className="text-xs text-muted-foreground">
                  Exact totals will be calculated on save based on the line items above.
                </p>
                {existingInvoice && (
                  <div className="mt-1 space-y-1 text-xs">
                    <p className="font-medium">
                      Total: Le {Number(existingInvoice.total_amount || 0).toLocaleString()}
                    </p>
                    <p>Paid: Le {Number(existingInvoice.paid_amount || 0).toLocaleString()}</p>
                    <p>Status: {existingInvoice.status || "pending"}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="submit" variant="outline">
                Save invoice
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <form action={markPaidAndSendToPharmacy} className="flex justify-end">
        <input type="hidden" name="visit_id" value={visitId} />
        <Button type="submit" variant="default" disabled={!existingInvoice}>
          Mark paid & send to Pharmacy
        </Button>
      </form>
    </div>
  )
}
