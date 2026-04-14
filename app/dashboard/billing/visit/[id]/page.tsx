import { createServerClient } from "@/lib/supabase/server"
import { notFound, redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { assertVisitTransition, parseVisitStatus } from "@/lib/visits"
import { InvoiceLineItems } from "../InvoiceLineItems"
import { FormHelpTip } from "@/components/form-help-tip"
import { PatientWorkflowPanel } from "@/components/patient-workflow-panel"
import { getGlobalSettings } from "@/lib/global-settings"
import { formatCurrency, formatDate } from "@/lib/locale-format"
import { calculateCharge } from "@/lib/pricing-engine"
import { logAuditEvent } from "@/lib/audit"
import { requireServerActionPermission } from "@/lib/server-action-security"
import { z } from "zod"

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  item_type?: string
}

interface RecommendedServiceItem extends LineItem {
  source: "admission" | "surgery" | "nursing"
}

interface TariffPreview {
  description: string
  amount: number
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
  const settings = await getGlobalSettings()
  const { id: visitId } = await props.params

  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const errorCode = resolvedSearchParams?.error

  const [{ data: visit, error: visitError }, { data: companies }, { data: admissionForVisit }, { data: surgeriesForVisit }, { data: nursingNotesForVisit }] = await Promise.all([
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
      .select("id, status, admission_date, discharge_date, wards(name), beds(bed_number)")
      .eq("visit_id", visitId)
      .in("status", ["admitted", "discharged"])
      .maybeSingle(),
    supabase
      .from("surgeries")
      .select("id, procedure_name, procedure_type, status, scheduled_at")
      .eq("visit_id", visitId)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("visit_nursing_notes")
      .select("id, note_type, procedure_type, performed_at")
      .eq("visit_id", visitId)
      .order("performed_at", { ascending: false })
      .limit(200),
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
  const pricingInsurerId = defaultPayerType === "company" ? defaultCompanyId : null

  const { data: existingInvoice } = await supabase
    .from("invoices")
    .select("id, patient_id, total_amount, paid_amount, status, payer_type, company_id")
    .eq("visit_id", visitId)
    .maybeSingle()

  const { data: linkedPrescription } = await supabase
    .from("prescriptions")
    .select("id, prescription_number, status")
    .eq("visit_id", visitId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let existingInvoiceItems: LineItem[] = []

  if (existingInvoice?.id) {
    const { data: invoiceItems, error: invoiceItemsError } = await supabase
      .from("invoice_items")
      .select("description, quantity, unit_price, item_type")
      .eq("invoice_id", existingInvoice.id as string)

    if (invoiceItemsError) {
      console.error("[v0] Error loading invoice items for visit billing:", invoiceItemsError.message || invoiceItemsError)
    }

    existingInvoiceItems = (invoiceItems || []).map((item) => ({
      description: (item.description as string) || "",
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      item_type: ((item as { item_type?: string | null }).item_type as string | null) || "billable",
    })) as LineItem[]
  }

  const recommendedExtendedCareItems: RecommendedServiceItem[] = []

  if (admissionForVisit) {
    const charge = await calculateCharge(supabase, "inpatient", 1, {
      facilityId: (visit.facility_id as string | null) ?? null,
      insurerId: pricingInsurerId,
      startAt: (admissionForVisit as { admission_date?: string | null }).admission_date ?? null,
      endAt: (admissionForVisit as { discharge_date?: string | null }).discharge_date ?? null,
    })
    recommendedExtendedCareItems.push({
      description: `Admission and bed allocation`,
      quantity: charge.quantity,
      unit_price: charge.unitPrice,
      item_type: "billable",
      source: "admission",
    })
  }

  for (const surgery of (surgeriesForVisit || []) as Array<{
    procedure_name?: string | null
    procedure_type?: string | null
    scheduled_at?: string | null
  }>) {
    const procedureName = (surgery.procedure_name || "Surgical procedure").trim()
    const procedureType = (surgery.procedure_type || "").trim()
    const charge = await calculateCharge(supabase, "surgery", 1, {
      facilityId: (visit.facility_id as string | null) ?? null,
      insurerId: pricingInsurerId,
      startAt: (surgery as { scheduled_at?: string | null }).scheduled_at ?? null,
    })
    recommendedExtendedCareItems.push({
      description: `${procedureName}${procedureType ? ` (${procedureType})` : ""}`,
      quantity: charge.quantity,
      unit_price: charge.unitPrice,
      item_type: "billable",
      source: "surgery",
    })
  }

  const nursingNotes = (nursingNotesForVisit || []) as Array<{
    note_type?: string | null
    procedure_type?: string | null
  }>
  const nursingProcedureCounts = new Map<string, number>()
  for (const note of nursingNotes) {
    const procedure = (note.procedure_type || "").trim()
    if (!procedure) continue
    nursingProcedureCounts.set(procedure, (nursingProcedureCounts.get(procedure) || 0) + 1)
  }
  for (const [procedure, count] of nursingProcedureCounts.entries()) {
    const charge = await calculateCharge(supabase, "nursing", count, {
      facilityId: (visit.facility_id as string | null) ?? null,
      insurerId: pricingInsurerId,
      quantity: count,
    })
    recommendedExtendedCareItems.push({
      description: `Nursing procedure: ${procedure.replace(/_/g, " ")}`,
      quantity: charge.quantity,
      unit_price: charge.unitPrice,
      item_type: "billable",
      source: "nursing",
    })
  }

  if (nursingNotes.length > 0) {
    const charge = await calculateCharge(supabase, "nursing", 1, {
      facilityId: (visit.facility_id as string | null) ?? null,
      insurerId: pricingInsurerId,
      quantity: 1,
    })
    recommendedExtendedCareItems.push({
      description: `Nursing observation / ward monitoring`,
      quantity: charge.quantity,
      unit_price: charge.unitPrice,
      item_type: "billable",
      source: "nursing",
    })
  }

  const normalizedExistingDescriptions = new Set(
    existingInvoiceItems.map((item) => item.description.trim().toLowerCase()).filter(Boolean),
  )
  const suggestedExtendedCareItems: RecommendedServiceItem[] = recommendedExtendedCareItems.filter(
    (item) => !normalizedExistingDescriptions.has(item.description.trim().toLowerCase()),
  )
  const capturedExtendedCareItems: RecommendedServiceItem[] = recommendedExtendedCareItems.filter((item) =>
    normalizedExistingDescriptions.has(item.description.trim().toLowerCase()),
  )

  const suggestedBySource = {
    admission: suggestedExtendedCareItems.filter((item) => item.source === "admission").length,
    surgery: suggestedExtendedCareItems.filter((item) => item.source === "surgery").length,
    nursing: suggestedExtendedCareItems.filter((item) => item.source === "nursing").length,
  }

  const capturedBySource = {
    admission: capturedExtendedCareItems.filter((item) => item.source === "admission").length,
    surgery: capturedExtendedCareItems.filter((item) => item.source === "surgery").length,
    nursing: capturedExtendedCareItems.filter((item) => item.source === "nursing").length,
  }

  const errorMessage = (() => {
    switch (errorCode) {
      case "visit_transition_invalid":
        return "This visit could not be advanced to Pharmacy because its current status does not allow that transition. Please refresh and confirm the visit is in the billing_pending stage before trying again."
      case "invoice_items_save_failed":
        return "Invoice items could not be saved. The previous line items were restored automatically."
      case "invoice_update_failed":
        return "The invoice update could not be completed."
      case "visit_update_failed":
        return "The visit status update failed after payment processing. Previous invoice values were restored."
      case "audit_log_failed":
        return "Payment could not be finalized because audit logging failed. Previous invoice values were restored."
      case "transactional_dependency_unavailable":
        return "This billing action requires transactional database RPCs that are not available yet. Please apply the latest SQL scripts."
      default:
        return null
    }
  })()

  async function saveInvoice(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("billing.manage")
    const parsed = z
      .object({
        visit_id: z.string().uuid(),
        payer_type: z.enum(["patient", "company"]).default("patient"),
        company_id: z.string().uuid().optional(),
      })
      .safeParse({
        visit_id: formData.get("visit_id"),
        payer_type: formData.get("payer_type") ?? "patient",
        company_id: formData.get("company_id") || undefined,
      })
    if (!parsed.success) {
      redirect("/dashboard/billing")
    }

    const visitId = parsed.data.visit_id
    const payerType = parsed.data.payer_type
    const companyId = parsed.data.company_id ?? null
    if (payerType === "company" && !companyId) {
      redirect(`/dashboard/billing/visit/${visitId}`)
    }

    const descriptions = formData.getAll("item_description") as string[]
    const quantities = formData.getAll("item_quantity") as string[]
    const unitPrices = formData.getAll("item_unit_price") as string[]
    const itemTypes = formData.getAll("item_type") as string[]

    const allowedItemTypes = new Set(["billable", "fhc_covered", "non_billable"])
    const items: LineItem[] = descriptions
      .map((description, index): LineItem => {
        const quantity = Number(quantities[index] || 0)
        const unit_price = Number(unitPrices[index] || 0)
        const rawItemType = (itemTypes[index] as string | undefined) || "billable"
        const item_type = allowedItemTypes.has(rawItemType) ? rawItemType : "billable"
        return { description, quantity, unit_price, item_type }
      })
      .filter(
        (item) =>
          item.description &&
          item.description.length <= 500 &&
          item.quantity > 0 &&
          item.quantity <= 1000000 &&
          item.unit_price >= 0 &&
          item.unit_price <= 1000000000,
      )

    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)

    // Ensure we have a patient for this visit, and check if this is a public-coverage visit
    const { data: visitRow } = await supabase
      .from("visits")
      .select("patient_id, is_free_health_care, visit_status")
      .eq("id", visitId)
      .maybeSingle()

    const patientId = (visitRow?.patient_id as string | null) ?? null
    const isFreeHealthCareVisit = Boolean(visitRow?.is_free_health_care)
    const visitStatus = ((visitRow?.visit_status as string | null) ?? "").toLowerCase()
    if (!visitRow || visitStatus === "completed" || visitStatus === "discharged") {
      redirect(`/dashboard/billing/visit/${visitId}`)
    }

    // For public-coverage visits, we record economic prices in line items
    // but only bill for items that are not explicitly marked as FHC-covered.
    const billableSubtotal = items.reduce((sum, item) => {
      const item_type = (item.item_type as string | undefined) || "billable"
      if (isFreeHealthCareVisit && item_type === "fhc_covered") return sum
      return sum + item.quantity * item.unit_price
    }, 0)

    const total = isFreeHealthCareVisit ? billableSubtotal : subtotal

    let invoiceId: string | null = (existingInvoice?.id as string | null) ?? null
    const invoiceBefore = existingInvoice
      ? {
          status: existingInvoice.status ?? null,
          total_amount: Number(existingInvoice.total_amount ?? 0),
          payer_type: existingInvoice.payer_type ?? null,
          company_id: existingInvoice.company_id ?? null,
        }
      : null
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

      const { error: billingAuditError } = await supabase.from("billing_audit_logs").insert({
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
      if (billingAuditError) {
        await supabase.from("invoices").delete().eq("id", invoiceId)
        redirect(`/dashboard/billing/visit/${visitId}?error=audit_log_failed`)
      }

      await logAuditEvent({
        action: "billing.invoice_saved",
        entityType: "invoice",
        entityId: invoiceId,
        user,
        metadata: {
          invoice_id: invoiceId,
          patient_id: patientId,
          visit_id: visitId,
          source: "visit_billing",
          line_item_count: items.length,
        },
        after: {
          status: inserted.status as string,
          total_amount: total,
          payer_type: payerValue,
          company_id: payerValue === "company" ? companyId : null,
        },
      })
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
        redirect(`/dashboard/billing/visit/${visitId}?error=invoice_update_failed`)
      } else {
        const { error: billingAuditError } = await supabase.from("billing_audit_logs").insert({
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
        if (billingAuditError) {
          await supabase
            .from("invoices")
            .update({
              total_amount: invoiceBefore?.total_amount ?? null,
              payer_type: (invoiceBefore?.payer_type as string | null) ?? "patient",
              company_id: (invoiceBefore?.company_id as string | null) ?? null,
            })
            .eq("id", invoiceId)
          redirect(`/dashboard/billing/visit/${visitId}?error=audit_log_failed`)
        }

        await logAuditEvent({
          action: "billing.invoice_saved",
          entityType: "invoice",
          entityId: invoiceId,
          user,
          metadata: {
            invoice_id: invoiceId,
            patient_id: patientId,
            visit_id: visitId,
            source: "visit_billing",
            line_item_count: items.length,
          },
          before: invoiceBefore,
          after: {
            status: existingInvoice?.status ?? null,
            total_amount: total,
            payer_type: payerValue,
            company_id: payerValue === "company" ? companyId : null,
          },
        })
      }
    }

    if (invoiceId) {
      const { data: previousInvoiceItems } = await supabase
        .from("invoice_items")
        .select("description, quantity, unit_price, amount, item_type")
        .eq("invoice_id", invoiceId)

      // Replace invoice_items with the current set of line items
      const { error: deleteError } = await supabase
        .from("invoice_items")
        .delete()
        .eq("invoice_id", invoiceId)

      if (deleteError) {
        console.error("[v0] Error clearing existing invoice items:", deleteError.message || deleteError)
        redirect(`/dashboard/billing/visit/${visitId}?error=invoice_items_save_failed`)
      }

      if (items.length > 0) {
        const invoiceItemsPayload = items.map((baseItem: LineItem) => {
          const item_type = (baseItem.item_type as string | undefined) || "billable"
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

          const fallbackRows = ((previousInvoiceItems || []) as Array<{
            description: string | null
            quantity: number | null
            unit_price: number | null
            amount: number | null
            item_type: string | null
          }>)
            .filter((row) => row.description && Number(row.quantity) > 0)
            .map((row) => ({
              invoice_id: invoiceId as string,
              description: String(row.description),
              quantity: Number(row.quantity),
              unit_price: Number(row.unit_price ?? 0),
              amount: Number(row.amount ?? 0),
              item_type: row.item_type || "billable",
            }))

          if (fallbackRows.length > 0) {
            const { error: restoreError } = await supabase.from("invoice_items").insert(fallbackRows)
            if (restoreError) {
              console.error("[v0] Error restoring previous invoice items after failure:", restoreError.message || restoreError)
            }
          }

          redirect(`/dashboard/billing/visit/${visitId}?error=invoice_items_save_failed`)
        }
      }
    }

    if (payerType === "company") {
      const { error: visitCompanyError } = await supabase
        .from("visits")
        .update({ assigned_company_id: companyId })
        .eq("id", visitId)
      if (visitCompanyError) {
        redirect(`/dashboard/billing/visit/${visitId}?error=invoice_update_failed`)
      }
    } else {
      const { error: visitCompanyError } = await supabase
        .from("visits")
        .update({ assigned_company_id: null })
        .eq("id", visitId)
      if (visitCompanyError) {
        redirect(`/dashboard/billing/visit/${visitId}?error=invoice_update_failed`)
      }
    }

    redirect(`/dashboard/billing/visit/${visitId}`)
  }

  async function markPaidAndSendToPharmacy(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("billing.manage")
    const parsed = z
      .object({ visit_id: z.string().uuid() })
      .safeParse({ visit_id: formData.get("visit_id") })
    if (!parsed.success) {
      redirect("/dashboard/billing")
    }
    const visitId = parsed.data.visit_id

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

    const currentStatus = parseVisitStatus(beforeVisit?.visit_status)

    if (!currentStatus) {
      console.error("[v0] Billing markPaidAndSendToPharmacy: missing current visit_status", { visitId })
      redirect(`/dashboard/billing/visit/${visitId}?error=visit_transition_invalid`)
    }

    try {
      assertVisitTransition(currentStatus, "pharmacy_pending")
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

    const rpcMarkPaidResult = await supabase.rpc("mark_visit_invoice_paid_transactional", {
      p_visit_id: visitId,
      p_next_visit_status: "pharmacy_pending",
      p_actor_user_id: user.id,
      p_audit_source: "visit_billing_mark_paid",
    })

    if (!rpcMarkPaidResult.error) {
      const rpcData = (rpcMarkPaidResult.data || null) as { ok?: boolean; code?: string } | null
      if (rpcData?.ok) {
        await logAuditEvent({
          action: "billing.invoice_paid",
          entityType: "invoice",
          entityId: invoiceBefore.id as string,
          user,
          metadata: {
            invoice_id: invoiceBefore.id as string,
            visit_id: visitId,
            next_visit_status: "pharmacy_pending",
          },
          before: {
            status: invoiceBefore.status ?? null,
            paid_amount: Number(invoiceBefore.paid_amount ?? 0),
          },
          after: {
            status: "paid",
            paid_amount: Number(invoiceBefore.total_amount ?? 0),
          },
        })
        redirect("/dashboard/billing")
      }

      const code = String(rpcData?.code || "")
      if (code === "invoice_not_found" || code === "visit_not_found" || code === "invalid_transition") {
        redirect(`/dashboard/billing/visit/${visitId}?error=visit_transition_invalid`)
      }
      redirect(`/dashboard/billing/visit/${visitId}?error=invoice_update_failed`)
    } else {
      const rpcErrorCode = String((rpcMarkPaidResult.error as { code?: string } | null)?.code || "")
      if (rpcErrorCode === "42883") {
        redirect(`/dashboard/billing/visit/${visitId}?error=transactional_dependency_unavailable`)
      }
      redirect(`/dashboard/billing/visit/${visitId}?error=invoice_update_failed`)
    }
  }

  async function markPaidAndCompleteVisit(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("billing.manage")
    const parsed = z
      .object({ visit_id: z.string().uuid() })
      .safeParse({ visit_id: formData.get("visit_id") })
    if (!parsed.success) {
      redirect("/dashboard/billing")
    }
    const visitId = parsed.data.visit_id

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

    const currentStatus = parseVisitStatus(beforeVisit?.visit_status)
    if (!currentStatus) {
      redirect(`/dashboard/billing/visit/${visitId}?error=visit_transition_invalid`)
    }

    try {
      assertVisitTransition(currentStatus, "completed")
    } catch (err) {
      console.error("[v0] Invalid visit status transition (billing -> completed)", {
        visitId,
        from: currentStatus,
        to: "completed",
        error: err instanceof Error ? err.message : String(err),
      })
      redirect(`/dashboard/billing/visit/${visitId}?error=visit_transition_invalid`)
    }

    if (!invoiceBefore) {
      redirect(`/dashboard/billing/visit/${visitId}?error=visit_transition_invalid`)
    }

    const rpcMarkPaidResult = await supabase.rpc("mark_visit_invoice_paid_transactional", {
      p_visit_id: visitId,
      p_next_visit_status: "completed",
      p_actor_user_id: user.id,
      p_audit_source: "visit_billing_mark_complete",
    })

    if (!rpcMarkPaidResult.error) {
      const rpcData = (rpcMarkPaidResult.data || null) as { ok?: boolean; code?: string } | null
      if (rpcData?.ok) {
        await logAuditEvent({
          action: "billing.invoice_paid",
          entityType: "invoice",
          entityId: invoiceBefore.id as string,
          user,
          metadata: {
            invoice_id: invoiceBefore.id as string,
            visit_id: visitId,
            next_visit_status: "completed",
          },
          before: {
            status: invoiceBefore.status ?? null,
            paid_amount: Number(invoiceBefore.paid_amount ?? 0),
          },
          after: {
            status: "paid",
            paid_amount: Number(invoiceBefore.total_amount ?? 0),
          },
        })
        redirect("/dashboard/billing")
      }

      const code = String(rpcData?.code || "")
      if (code === "invoice_not_found" || code === "visit_not_found" || code === "invalid_transition") {
        redirect(`/dashboard/billing/visit/${visitId}?error=visit_transition_invalid`)
      }
      redirect(`/dashboard/billing/visit/${visitId}?error=invoice_update_failed`)
    } else {
      const rpcErrorCode = String((rpcMarkPaidResult.error as { code?: string } | null)?.code || "")
      if (rpcErrorCode === "42883") {
        redirect(`/dashboard/billing/visit/${visitId}?error=transactional_dependency_unavailable`)
      }
      redirect(`/dashboard/billing/visit/${visitId}?error=invoice_update_failed`)
    }
  }

  const initialItems: LineItem[] =
    existingInvoiceItems.length > 0 ? existingInvoiceItems : suggestedExtendedCareItems.length > 0 ? suggestedExtendedCareItems : []

  const tariffPreviews: TariffPreview[] = suggestedExtendedCareItems
    .filter((item) => item.unit_price > 0)
    .map((item) => ({
      description: item.description,
      amount: item.quantity * item.unit_price,
    }))

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
            Create or update an invoice for this visit before sending it to pharmacy or closing the visit.
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
                  {settings.publicCoverageLabel} visit
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
                  Admitted - view admission
                </Link>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            Billing should follow this order: confirm payer, save invoice items, then mark the visit paid only when
            payment is fully settled and the visit is ready either for pharmacy or direct closure.
          </div>
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
                  Expiry: {formatDate(insuranceExpiryStr, settings, { style: "numeric" })} -
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
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <p>
              Visit payer category: <span className="font-medium text-foreground">{visit.payer_category || "unknown"}</span>
            </p>
            <p>
              Facility assignment: <span className="font-medium text-foreground">{facility?.name || "Unassigned"}</span>
            </p>
          </div>
          {visit.is_free_health_care && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              This visit is registered under a public coverage program. Follow local coverage pricing rules and do not
              charge the patient directly unless policy requires exceptions.
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
          {linkedPrescription ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              Structured prescription linked:{" "}
              <Link href={`/dashboard/prescriptions/${linkedPrescription.id}`} className="font-medium underline-offset-2 hover:underline">
                {linkedPrescription.prescription_number || linkedPrescription.id}
              </Link>
            </div>
          ) : visit.prescription_list?.notes ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              This visit has prescription notes but no structured prescription record yet.{" "}
              <Link href={`/dashboard/prescriptions/new?patient_id=${visit.patient_id}&visit_id=${visitId}`} className="font-medium underline-offset-2 hover:underline">
                Create the prescription before sending this visit to Pharmacy
              </Link>
              .
            </div>
          ) : null}
          {suggestedExtendedCareItems.length > 0 ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              Suggested extended-care charges found for this visit: {suggestedExtendedCareItems.length}. Tariff-based prices are preloaded when a matching tariff exists, and billing staff can override them before saving.
            </div>
          ) : null}
          {tariffPreviews.length > 0 ? (
            <div className="rounded-md border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">Auto-calculated tariff preview</p>
              <div className="space-y-1">
                {tariffPreviews.map((item) => (
                  <p key={item.description}>
                    {item.description}: <span className="font-medium text-foreground">{formatCurrency(item.amount, settings)}</span>
                  </p>
                ))}
              </div>
            </div>
          ) : null}
          {recommendedExtendedCareItems.length > 0 ? (
            <div className="rounded-md border px-3 py-3 text-xs">
              <p className="mb-2 font-medium text-foreground">Extended-care billing coverage</p>
              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <p className="font-medium">Admission</p>
                  <p className="text-muted-foreground">
                    Captured: {capturedBySource.admission} · Missing: {suggestedBySource.admission}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <p className="font-medium">Surgery</p>
                  <p className="text-muted-foreground">
                    Captured: {capturedBySource.surgery} · Missing: {suggestedBySource.surgery}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <p className="font-medium">Nursing</p>
                  <p className="text-muted-foreground">
                    Captured: {capturedBySource.nursing} · Missing: {suggestedBySource.nursing}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <PatientWorkflowPanel
        currentStage="billing"
        patientId={(visit.patient_id as string | null) ?? null}
        visitId={visitId}
        title="Billing continuity"
        description="Billing should sit after consultation and diagnostics, then route the visit into pharmacy, admission, discharge, or follow-up."
      />

      <form action={saveInvoice}>
        <input type="hidden" name="visit_id" value={visitId} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Invoice Line Items
              <FormHelpTip text={`Use one line per billable service, medicine, or exception. ${settings.publicCoverageLabel} items are still recorded here for audit visibility, but covered items are zero-rated during save.`} />
            </CardTitle>
            <CardDescription>Services and medicines to charge for this visit.</CardDescription>
          </CardHeader>
          <InvoiceLineItems initialItems={initialItems} />

          <CardContent className="space-y-4 pt-0">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Payer
                  <FormHelpTip text="Choose company only when valid cover applies and the claim should be raised against that company. Otherwise keep billing against the patient." />
                </Label>
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
                      Total: {formatCurrency(Number(existingInvoice.total_amount || 0), settings)}
                    </p>
                    <p>Paid: {formatCurrency(Number(existingInvoice.paid_amount || 0), settings)}</p>
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

      <div className="flex flex-wrap justify-end gap-2">
        <form action={markPaidAndCompleteVisit}>
          <input type="hidden" name="visit_id" value={visitId} />
          <Button type="submit" variant="outline" disabled={!existingInvoice}>
            Mark paid & complete visit
          </Button>
        </form>
        <form action={markPaidAndSendToPharmacy}>
          <input type="hidden" name="visit_id" value={visitId} />
          <Button type="submit" variant="default" disabled={!existingInvoice || !linkedPrescription}>
            Mark paid & send to Pharmacy
          </Button>
        </form>
      </div>
    </div>
  )
}
