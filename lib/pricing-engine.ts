import { calculateInvoiceTotals } from "@/lib/billing"

type SupabaseClientLike = {
  from: (table: string) => unknown
}

type TariffQueryLike = {
  eq: (field: string, value: string) => TariffQueryLike
  is: (field: string, value: null) => TariffQueryLike
  maybeSingle: () => Promise<{ data: TariffRow | null; error: { message?: string } | null }>
}

type TariffsTableLike = {
  select: (query: string) => TariffQueryLike
}

type InvoiceItemsSelectManyLike = {
  eq: (field: string, value: string) => Promise<{ data: InvoiceItemRow[] | null }>
}

type InvoiceItemsSelectSingleLike = {
  eq: (field: string, value: string) => InvoiceItemsSelectSingleLike
  maybeSingle: () => Promise<{ data: InvoiceItemRow | null }>
}

type InvoiceItemsTableLike = {
  select: (query: string) => InvoiceItemsSelectManyLike | InvoiceItemsSelectSingleLike
  insert: (payload: Record<string, unknown>) => Promise<unknown>
  update: (payload: Record<string, unknown>) => { eq: (field: string, value: string) => Promise<unknown> }
}

type InvoicesSelectSingleLike = {
  eq: (field: string, value: string) => InvoicesSelectSingleLike
  maybeSingle: () => Promise<{ data: InvoiceRow | null }>
}

type InvoicesInsertLike = {
  select: (query: string) => { maybeSingle: () => Promise<{ data: InvoiceRow | null }> }
}

type InvoicesTableLike = {
  select: (query: string) => InvoicesSelectSingleLike
  insert: (payload: Record<string, unknown>) => InvoicesInsertLike
  update: (payload: Record<string, unknown>) => { eq: (field: string, value: string) => Promise<unknown> }
}

type VisitRow = {
  id?: string | null
  patient_id?: string | null
  facility_id?: string | null
  assigned_company_id?: string | null
  is_free_health_care?: boolean | null
  payer_category?: string | null
  patients?:
    | { company_id?: string | null; insurance_type?: string | null }
    | Array<{ company_id?: string | null; insurance_type?: string | null }>
    | null
}

type VisitsSelectSingleLike = {
  eq: (field: string, value: string) => VisitsSelectSingleLike
  maybeSingle: () => Promise<{ data: VisitRow | null }>
}

type VisitsTableLike = {
  select: (query: string) => VisitsSelectSingleLike
  update: (payload: Record<string, unknown>) => { eq: (field: string, value: string) => Promise<unknown> }
}

type InvoiceItemRow = {
  id?: string | null
  description?: string | null
  quantity?: number | string | null
  unit_price?: number | string | null
  item_type?: string | null
}

type InvoiceRow = {
  id?: string | null
  status?: string | null
}

export type TariffServiceType = "inpatient" | "surgery" | "nursing" | "lab" | "radiology"
export type TariffUnitType = "per_day" | "per_hour" | "per_service"

export interface TariffRow {
  id: string
  service_type: TariffServiceType
  facility_id: string
  insurer_id: string | null
  base_price: number
  unit_type: TariffUnitType
  currency: string
  created_at?: string
}

export interface PricingContext {
  facilityId: string | null
  insurerId?: string | null
  startAt?: string | Date | null
  endAt?: string | Date | null
  quantity?: number | null
}

export interface CalculatedCharge {
  tariff: TariffRow | null
  quantity: number
  unitPrice: number
  amount: number
  currency: string | null
}

function safeDate(value?: string | Date | null) {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function hoursBetween(startAt?: string | Date | null, endAt?: string | Date | null) {
  const start = safeDate(startAt)
  const end = safeDate(endAt)
  if (!start || !end) return 0
  return Math.max(0, (end.getTime() - start.getTime()) / 36e5)
}

function daysBetween(startAt?: string | Date | null, endAt?: string | Date | null) {
  const start = safeDate(startAt)
  const end = safeDate(endAt)
  if (!start || !end) return 0
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000))
}

export async function getTariff(
  supabase: SupabaseClientLike,
  serviceType: TariffServiceType,
  facilityId: string | null | undefined,
  insurerId?: string | null,
): Promise<TariffRow | null> {
  if (!facilityId) return null

  const tariffsTable = supabase.from("tariffs") as TariffsTableLike

  if (insurerId) {
    const { data, error } = (await tariffsTable
      .select("id, service_type, facility_id, insurer_id, base_price, unit_type, currency, created_at")
      .eq("service_type", serviceType)
      .eq("facility_id", facilityId)
      .eq("insurer_id", insurerId)
      .maybeSingle()) as { data: TariffRow | null; error: { message?: string } | null }

    if (!error && data) {
      return {
        ...data,
        base_price: Number(data.base_price || 0),
      }
    }
  }

  const { data, error } = (await tariffsTable
    .select("id, service_type, facility_id, insurer_id, base_price, unit_type, currency, created_at")
    .eq("service_type", serviceType)
    .eq("facility_id", facilityId)
    .is("insurer_id", null)
    .maybeSingle()) as { data: TariffRow | null; error: { message?: string } | null }

  if (error || !data) return null

  return {
    ...data,
    base_price: Number(data.base_price || 0),
  }
}

export async function calculateCharge(
  supabase: SupabaseClientLike,
  serviceType: TariffServiceType,
  quantity: number,
  context: PricingContext,
): Promise<CalculatedCharge> {
  const tariff = await getTariff(supabase, serviceType, context.facilityId, context.insurerId || null)
  if (!tariff) {
    return {
      tariff: null,
      quantity: Math.max(1, quantity || context.quantity || 1),
      unitPrice: 0,
      amount: 0,
      currency: null,
    }
  }

  let computedQuantity = Math.max(1, quantity || context.quantity || 1)

  if (tariff.unit_type === "per_day") {
    computedQuantity = Math.max(computedQuantity, daysBetween(context.startAt, context.endAt))
  } else if (tariff.unit_type === "per_hour") {
    computedQuantity = Math.max(computedQuantity, Math.ceil(hoursBetween(context.startAt, context.endAt)) || 1)
  }

  return {
    tariff,
    quantity: computedQuantity,
    unitPrice: Number(tariff.base_price || 0),
    amount: computedQuantity * Number(tariff.base_price || 0),
    currency: tariff.currency,
  }
}

type AutoChargeMode = "replace" | "increment"

interface EnsureVisitChargeOptions {
  visitId: string
  actorUserId?: string | null
  serviceType: TariffServiceType
  description: string
  quantity?: number
  mode?: AutoChargeMode
  startAt?: string | Date | null
  endAt?: string | Date | null
  itemType?: string
}

function generateInvoiceNumber() {
  return `INV-${Date.now().toString().slice(-6)}`
}

async function recalculateInvoiceTotals(
  supabase: SupabaseClientLike,
  invoiceId: string,
  isFreeHealthCareVisit: boolean,
) {
  const invoicesTable = supabase.from("invoices") as InvoicesTableLike
  const invoiceItemsTable = supabase.from("invoice_items") as InvoiceItemsTableLike
  const { data: invoiceItems } = (await (
    invoiceItemsTable.select("description, quantity, unit_price, item_type") as InvoiceItemsSelectManyLike
  ).eq("invoice_id", invoiceId)) as { data: InvoiceItemRow[] | null }

  const normalizedItems = (invoiceItems || []).map((item) => {
    const quantity = Number(item.quantity || 0)
    const unit_price = Number(item.unit_price || 0)
    const item_type = item.item_type || "billable"
    return {
      description: item.description || "",
      quantity,
      unit_price,
      amount: isFreeHealthCareVisit && item_type === "fhc_covered" ? 0 : quantity * unit_price,
    }
  })

  const { total } = calculateInvoiceTotals(
    normalizedItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: item.amount === 0 ? 0 : item.unit_price,
    })),
  )

  await invoicesTable.update({ total_amount: total }).eq("id", invoiceId)
}

export async function ensureVisitAutoChargeLine(
  supabase: SupabaseClientLike,
  options: EnsureVisitChargeOptions,
) {
  const { visitId, actorUserId, serviceType, description, quantity = 1, mode = "replace", startAt, endAt, itemType = "billable" } = options
  const invoicesTable = supabase.from("invoices") as InvoicesTableLike
  const invoiceItemsTable = supabase.from("invoice_items") as InvoiceItemsTableLike
  const visitsTable = supabase.from("visits") as VisitsTableLike

  const { data: visit } = (await visitsTable
    .select("id, patient_id, facility_id, assigned_company_id, is_free_health_care, payer_category, patients(company_id, insurance_type)")
    .eq("id", visitId)
    .maybeSingle()) as { data: VisitRow | null }

  if (!visit?.id || !visit.patient_id) {
    return { ok: false as const, reason: "visit_missing" }
  }

  const patientRelation = visit.patients
  const patient = Array.isArray(patientRelation) ? (patientRelation[0] ?? null) : patientRelation ?? null
  const insurerId = visit.assigned_company_id || patient?.company_id || null

  const charge = await calculateCharge(supabase, serviceType, quantity, {
    facilityId: (visit.facility_id as string | null) ?? null,
    insurerId,
    startAt,
    endAt,
    quantity,
  })

  if (!charge.tariff) {
    return { ok: false as const, reason: "tariff_missing" }
  }

  let invoiceId: string | null = null
  const { data: existingInvoice } = (await invoicesTable
    .select("id, status")
    .eq("visit_id", visitId)
    .maybeSingle()) as { data: InvoiceRow | null }

  if (existingInvoice?.id) {
    if ((existingInvoice.status as string | null) === "paid") {
      return { ok: false as const, reason: "invoice_already_paid" }
    }
    invoiceId = existingInvoice.id as string
  } else {
    const payerType = insurerId ? "company" : "patient"
    const { data: createdInvoice } = (await invoicesTable
      .insert({
        invoice_number: generateInvoiceNumber(),
        visit_id: visitId,
        patient_id: visit.patient_id,
        total_amount: 0,
        paid_amount: 0,
        status: "pending",
        created_by: actorUserId || null,
        payer_type: payerType,
        company_id: payerType === "company" ? insurerId : null,
      })
      .select("id")
      .maybeSingle()) as { data: InvoiceRow | null }

    invoiceId = (createdInvoice?.id as string | null) ?? null
  }

  if (!invoiceId) {
    return { ok: false as const, reason: "invoice_missing" }
  }

  const { data: existingItem } = (await (invoiceItemsTable
    .select("id, quantity") as InvoiceItemsSelectSingleLike)
    .eq("invoice_id", invoiceId)
    .eq("description", description)
    .maybeSingle()) as { data: InvoiceItemRow | null }

  if (existingItem?.id) {
    const nextQuantity =
      mode === "increment"
        ? Number(existingItem.quantity || 0) + charge.quantity
        : charge.quantity

    await invoiceItemsTable
      .update({
        quantity: nextQuantity,
        unit_price: charge.unitPrice,
        amount: nextQuantity * charge.unitPrice,
        item_type: itemType,
      })
      .eq("id", existingItem.id as string)
  } else {
    await invoiceItemsTable.insert({
      invoice_id: invoiceId,
      description,
      quantity: charge.quantity,
      unit_price: charge.unitPrice,
      amount: charge.amount,
      item_type: itemType,
    })
  }

  await recalculateInvoiceTotals(supabase, invoiceId, Boolean(visit.is_free_health_care))

  if (insurerId) {
    await visitsTable.update({ assigned_company_id: insurerId }).eq("id", visitId)
  }

  return {
    ok: true as const,
    invoiceId,
    unitPrice: charge.unitPrice,
    quantity: charge.quantity,
    amount: charge.amount,
    currency: charge.currency,
  }
}
