export type InsuranceBatchStatus = "draft" | "submitted" | "paid"

export interface EligibleInsuranceInvoice {
  id: string
  invoice_number: string | null
  patient_id: string | null
  visit_id: string | null
  company_id: string | null
  created_at: string | null
  total_amount: number
  paid_amount: number
  balance: number
  patients?: {
    full_name?: string | null
    patient_number?: string | null
  } | null
}

export interface InsuranceBatchPatientInvoiceLineItem {
  description: string
  quantity: number
  unit_price: number
  amount: number
}

export interface InsuranceBatchPatientInvoice {
  invoiceId: string
  invoiceNumber: string
  createdAt: string | null
  visitId: string | null
  visitReference: string
  amount: number
  lineItems: InsuranceBatchPatientInvoiceLineItem[]
}

export interface InsuranceBatchPatientGroup {
  patientId: string | null
  patientName: string
  patientNumber: string
  relationship: string | null
  principalEmployeeName: string | null
  total: number
  invoices: InsuranceBatchPatientInvoice[]
}

export interface InsuranceBatchDetails {
  batch: {
    id: string
    batch_number: string | null
    company_id: string | null
    from_date: string | null
    to_date: string | null
    status: InsuranceBatchStatus
    total_amount: number
    paid_amount: number
    submitted_at: string | null
    paid_at: string | null
    created_at: string | null
    notes: string | null
    companyName: string | null
    companyAddress: string | null
    companyContactPerson: string | null
    companyPhone: string | null
    companyEmail: string | null
  }
  groupedPatients: InsuranceBatchPatientGroup[]
}

export function buildInsuranceBatchNumber() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12)
  return `INS-${stamp}`
}

export async function createInsuranceBillingBatchTransactional(
  supabase: unknown,
  args: {
    batchNumber: string
    companyId: string
    fromDate: string
    toDate: string
    createdBy: string
    invoiceIds: string[]
  },
): Promise<string> {
  const db = supabase as {
    rpc?: (fn: string, payload: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>
    from: (table: string) => unknown
  }

  if (typeof db.rpc === "function") {
    const { data, error } = await db.rpc("create_insurance_billing_batch", {
      p_batch_number: args.batchNumber,
      p_company_id: args.companyId,
      p_from_date: args.fromDate,
      p_to_date: args.toDate,
      p_created_by: args.createdBy,
      p_invoice_ids: args.invoiceIds,
    })

    if (!error) {
      const batchId = typeof data === "string" ? data : null
      if (!batchId) {
        throw new Error("Failed to create insurance billing batch")
      }
      return batchId
    }

    const errorCode = String(error.code || "")
    if (errorCode !== "42883") {
      throw new Error(error.message || "Failed to create insurance billing batch")
    }
  }

  const invoicesTable = db.from("invoices") as {
    select: (query: string) => {
      in: (column: string, values: string[]) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>
    }
    update: (payload: Record<string, unknown>) => {
      in: (column: string, values: string[]) => Promise<{ error: { message?: string } | null }>
      eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>
    }
  }
  const batchesTable = db.from("insurance_billing_batches") as {
    insert: (payload: Record<string, unknown>) => {
      select: (query: string) => {
        single: () => Promise<{ data: { id?: string | null } | null; error: { message?: string } | null }>
      }
    }
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>
    }
  }
  const batchItemsTable = db.from("insurance_billing_batch_items") as {
    insert: (payload: Record<string, unknown>[]) => Promise<{ error: { message?: string } | null }>
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>
    }
  }

  const { data: invoicesRaw, error: invoicesError } = await invoicesTable
    .select("id, patient_id, visit_id, total_amount, paid_amount")
    .in("id", args.invoiceIds)

  if (invoicesError) {
    throw new Error(invoicesError.message || "Failed to load eligible invoices")
  }

  const invoices = ((invoicesRaw || []) as Array<{
    id: string
    patient_id?: string | null
    visit_id?: string | null
    total_amount?: number | string | null
    paid_amount?: number | string | null
  }>)
    .map((invoice) => {
      const totalAmount = Number(invoice.total_amount ?? 0)
      const paidAmount = Number(invoice.paid_amount ?? 0)
      return {
        ...invoice,
        balance: Math.max(totalAmount - paidAmount, 0),
      }
    })
    .filter((invoice) => invoice.balance > 0)

  if (invoices.length === 0) {
    throw new Error("No eligible invoices found for insurance batch creation")
  }

  const totalAmount = invoices.reduce((sum, invoice) => sum + invoice.balance, 0)

  const { data: batchRow, error: batchInsertError } = await batchesTable
    .insert({
      batch_number: args.batchNumber,
      company_id: args.companyId,
      from_date: args.fromDate,
      to_date: args.toDate,
      status: "draft",
      subtotal: totalAmount,
      total_amount: totalAmount,
      paid_amount: 0,
      created_by: args.createdBy,
    })
    .select("id")
    .single()

  if (batchInsertError || !batchRow?.id) {
    throw new Error(batchInsertError?.message || "Failed to create insurance billing batch")
  }

  const batchId = batchRow.id as string

  const { error: itemsError } = await batchItemsTable.insert(
    invoices.map((invoice) => ({
      batch_id: batchId,
      invoice_id: invoice.id,
      patient_id: invoice.patient_id ?? null,
      visit_id: invoice.visit_id ?? null,
      amount: invoice.balance,
    })),
  )

  if (itemsError) {
    await batchesTable.delete().eq("id", batchId)
    throw new Error(itemsError.message || "Failed to create insurance billing batch items")
  }

  const { error: invoiceUpdateError } = await invoicesTable
    .update({ insurance_batch_id: batchId })
    .in("id", invoices.map((invoice) => invoice.id))

  if (invoiceUpdateError) {
    await batchItemsTable.delete().eq("batch_id", batchId)
    await batchesTable.delete().eq("id", batchId)
    throw new Error(invoiceUpdateError.message || "Failed to link invoices to insurance batch")
  }

  return batchId
}

export async function fetchEligibleInsuranceInvoices(
  supabase: unknown,
  companyId: string,
  fromIso: string,
  toIso: string,
) {
  const db = supabase as { from: (table: string) => unknown }

  const invoiceQuery = db.from("invoices") as {
    select: (query: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          gte: (column: string, value: string) => {
            lte: (column: string, value: string) => {
              order: (column: string, options: { ascending: boolean }) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>
            }
          }
        }
      }
    }
  }

  const batchItemQuery = db.from("insurance_billing_batch_items") as {
    select: (query: string) => Promise<{ data: Array<{ invoice_id?: string | null }> | null; error: { message?: string } | null }>
  }

  const [{ data: invoices, error: invoicesError }, { data: existingBatchItems, error: batchItemsError }] =
    await Promise.all([
      invoiceQuery
        .select(`
          id, invoice_number, patient_id, visit_id, company_id, created_at, total_amount, paid_amount, payer_type,
          patients(full_name, patient_number)
        `)
        .eq("payer_type", "company")
        .eq("company_id", companyId)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: true }),
      batchItemQuery.select("invoice_id"),
    ])

  if (invoicesError) {
    throw invoicesError
  }
  if (batchItemsError) {
    throw batchItemsError
  }

  const batchedInvoiceIds = new Set((existingBatchItems || []).map((item: { invoice_id?: string | null }) => item.invoice_id).filter(Boolean))

  return ((invoices || []) as Array<{
    id: string
    invoice_number?: string | null
    patient_id?: string | null
    visit_id?: string | null
    company_id?: string | null
    created_at?: string | null
    total_amount?: number | string | null
    paid_amount?: number | string | null
    patients?: { full_name?: string | null; patient_number?: string | null } | Array<{ full_name?: string | null; patient_number?: string | null }> | null
  }>)
    .map((invoice) => {
      const patient = Array.isArray(invoice.patients) ? (invoice.patients[0] ?? null) : invoice.patients ?? null
      const totalAmount = Number(invoice.total_amount ?? 0)
      const paidAmount = Number(invoice.paid_amount ?? 0)
      const balance = Math.max(totalAmount - paidAmount, 0)
      return {
        id: invoice.id,
        invoice_number: invoice.invoice_number ?? null,
        patient_id: invoice.patient_id ?? null,
        visit_id: invoice.visit_id ?? null,
        company_id: invoice.company_id ?? null,
        created_at: invoice.created_at ?? null,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        balance,
        patients: patient,
      } satisfies EligibleInsuranceInvoice
    })
    .filter((invoice) => invoice.balance > 0 && !batchedInvoiceIds.has(invoice.id))
}

export function groupInvoicesByPatient(rows: EligibleInsuranceInvoice[]) {
  const grouped = new Map<
    string,
    {
      patientId: string | null
      patientName: string
      patientNumber: string
      invoices: EligibleInsuranceInvoice[]
      total: number
    }
  >()

  for (const invoice of rows) {
    const key = invoice.patient_id || invoice.id
    const existing = grouped.get(key) || {
      patientId: invoice.patient_id,
      patientName: invoice.patients?.full_name || "Unknown patient",
      patientNumber: invoice.patients?.patient_number || "-",
      invoices: [],
      total: 0,
    }
    existing.invoices.push(invoice)
    existing.total += invoice.balance
    grouped.set(key, existing)
  }

  return Array.from(grouped.values())
}

function normalizeSingle<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null
  return Array.isArray(relation) ? (relation[0] ?? null) : relation
}

function buildVisitReference(visitId: string | null | undefined) {
  if (!visitId) return "-"
  return `VIS-${visitId.replace(/-/g, "").slice(-6).toUpperCase()}`
}

export async function fetchInsuranceBatchDetails(supabase: unknown, batchId: string): Promise<InsuranceBatchDetails | null> {
  const db = supabase as {
    from: (table: string) => unknown
  }

  const batchesTable = db.from("insurance_billing_batches") as {
    select: (query: string) => {
      eq: (column: string, value: string) => Promise<{ data: unknown[] | null }>
    }
  }

  const { data: batchRaw } = await batchesTable
    .select(`
      id, batch_number, company_id, from_date, to_date, status, total_amount, paid_amount, submitted_at, paid_at, created_at, notes,
      companies(name, address, contact_person, phone, email)
    `)
    .eq("id", batchId)

  const batchRow = Array.isArray(batchRaw) ? (batchRaw[0] ?? null) : null
  if (!batchRow) return null

  const batch = batchRow as {
    id: string
    batch_number?: string | null
    company_id?: string | null
    from_date?: string | null
    to_date?: string | null
    status?: InsuranceBatchStatus | null
    total_amount?: number | string | null
    paid_amount?: number | string | null
    submitted_at?: string | null
    paid_at?: string | null
    created_at?: string | null
    notes?: string | null
    companies?:
      | { name?: string | null; address?: string | null; contact_person?: string | null; phone?: string | null; email?: string | null }
      | Array<{ name?: string | null; address?: string | null; contact_person?: string | null; phone?: string | null; email?: string | null }>
      | null
  }

  const company = normalizeSingle(
    batch.companies as
      | { name?: string | null; address?: string | null; contact_person?: string | null; phone?: string | null; email?: string | null }
      | Array<{ name?: string | null; address?: string | null; contact_person?: string | null; phone?: string | null; email?: string | null }>
      | null,
  )

  const batchItemsTable = db.from("insurance_billing_batch_items") as {
    select: (query: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options: { ascending: boolean }) => Promise<{ data: unknown[] | null }>
      }
    }
  }

  const { data: batchItemsRaw } = await batchItemsTable
    .select(`
      id, amount, invoice_id, patient_id, visit_id,
      invoices(id, invoice_number, created_at, total_amount, paid_amount),
      patients(full_name, patient_number)
    `)
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true })

  const batchItems = (batchItemsRaw || []) as Array<{
    id: string
    amount?: number | string | null
    invoice_id?: string | null
    patient_id?: string | null
    visit_id?: string | null
    invoices?:
      | { id?: string | null; invoice_number?: string | null; created_at?: string | null }
      | Array<{ id?: string | null; invoice_number?: string | null; created_at?: string | null }>
      | null
    patients?:
      | { full_name?: string | null; patient_number?: string | null }
      | Array<{ full_name?: string | null; patient_number?: string | null }>
      | null
  }>

  const invoiceIds = batchItems.map((item) => item.invoice_id).filter((id): id is string => Boolean(id))
  const patientIds = batchItems.map((item) => item.patient_id).filter((id): id is string => Boolean(id))

    const { data: invoiceLineItemsRaw } = await (
      invoiceIds.length
      ? ((db.from("invoice_items") as {
          select: (query: string) => {
            in: (column: string, values: string[]) => Promise<{ data: unknown[] | null }>
          }
        })
          .select("invoice_id, description, quantity, unit_price, amount")
          .in("invoice_id", invoiceIds))
      : Promise.resolve({ data: [] as unknown[] })
  )

  const { fetchCompanyCoverageMap } = await import("@/lib/billing/company-coverage")
  const coverageMap = await fetchCompanyCoverageMap(supabase, batch.company_id ?? null, patientIds)

  const lineItemsByInvoiceId = new Map<string, InsuranceBatchPatientInvoiceLineItem[]>()
  for (const item of (invoiceLineItemsRaw || []) as Array<{
    invoice_id?: string | null
    description?: string | null
    quantity?: number | string | null
    unit_price?: number | string | null
    amount?: number | string | null
  }>) {
    if (!item.invoice_id) continue
    const existing = lineItemsByInvoiceId.get(item.invoice_id) || []
    existing.push({
      description: item.description || "",
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      amount: Number(item.amount || 0),
    })
    lineItemsByInvoiceId.set(item.invoice_id, existing)
  }

  const groupedPatients = new Map<string, InsuranceBatchPatientGroup>()
  for (const row of batchItems) {
    const patient = normalizeSingle(
      row.patients as
        | { full_name?: string | null; patient_number?: string | null }
        | Array<{ full_name?: string | null; patient_number?: string | null }>
        | null,
    )
    const invoice = normalizeSingle(
      row.invoices as
        | { id?: string | null; invoice_number?: string | null; created_at?: string | null }
        | Array<{ id?: string | null; invoice_number?: string | null; created_at?: string | null }>
        | null,
    )
    const coverage = row.patient_id ? coverageMap.get(row.patient_id) : null
    const key = row.patient_id || row.id
    const existing = groupedPatients.get(key) || {
      patientId: row.patient_id ?? null,
      patientName: patient?.full_name || coverage?.beneficiaryName || "Unknown patient",
      patientNumber: patient?.patient_number || "-",
      relationship: coverage?.relationshipLabel || null,
      principalEmployeeName: coverage?.principalEmployeeName || null,
      total: 0,
      invoices: [],
    }
    const amount = Number(row.amount || 0)
    existing.total += amount
    existing.invoices.push({
      invoiceId: invoice?.id || row.invoice_id || "",
      invoiceNumber: invoice?.invoice_number || "Unnumbered invoice",
      createdAt: invoice?.created_at || null,
      visitId: row.visit_id ?? null,
      visitReference: buildVisitReference(row.visit_id),
      amount,
      lineItems: lineItemsByInvoiceId.get(invoice?.id || row.invoice_id || "") || [],
    })
    groupedPatients.set(key, existing)
  }

  return {
    batch: {
      id: batch.id,
      batch_number: batch.batch_number ?? null,
      company_id: batch.company_id ?? null,
      from_date: batch.from_date ?? null,
      to_date: batch.to_date ?? null,
      status: batch.status || "draft",
      total_amount: Number(batch.total_amount || 0),
      paid_amount: Number(batch.paid_amount || 0),
      submitted_at: batch.submitted_at ?? null,
      paid_at: batch.paid_at ?? null,
      created_at: batch.created_at ?? null,
      notes: batch.notes ?? null,
      companyName: company?.name ?? null,
      companyAddress: company?.address ?? null,
      companyContactPerson: company?.contact_person ?? null,
      companyPhone: company?.phone ?? null,
      companyEmail: company?.email ?? null,
    },
    groupedPatients: Array.from(groupedPatients.values()),
  }
}
