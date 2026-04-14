export interface DataConsistencyCounts {
  visits_without_billing: number
  open_prescriptions_without_dispense: number
  prescriptions_without_items: number
  invoices_without_items: number
  queue_in_progress_without_visit: number
  insurance_batches_without_totals: number
  insurance_batches_with_mismatch: number
  discharged_admissions_missing_summary: number
  source: "rpc" | "fallback"
  truncated: boolean
}

type ConsistencySupabase = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  from: (table: string) => {
    select: (columns: string, options?: { count?: "exact"; head?: boolean }) => unknown
  }
}

function toCount(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function normalizeRpcRow(row: unknown): Omit<DataConsistencyCounts, "source" | "truncated"> {
  const value = (row || {}) as Record<string, unknown>
  return {
    visits_without_billing: toCount(value.visits_without_billing),
    open_prescriptions_without_dispense: toCount(value.open_prescriptions_without_dispense),
    prescriptions_without_items: toCount(value.prescriptions_without_items),
    invoices_without_items: toCount(value.invoices_without_items),
    queue_in_progress_without_visit: toCount(value.queue_in_progress_without_visit),
    insurance_batches_without_totals: toCount(value.insurance_batches_without_totals),
    insurance_batches_with_mismatch: toCount(value.insurance_batches_with_mismatch),
    discharged_admissions_missing_summary: toCount(value.discharged_admissions_missing_summary),
  }
}

async function countRows(
  supabase: ConsistencySupabase,
  table: string,
  apply?: (query: unknown) => unknown,
): Promise<{ count: number; error: unknown }> {
  try {
    const base = supabase.from(table).select("id", { count: "exact", head: true })
    const query = apply ? apply(base) : base
    const result = (await query) as { count?: unknown; error?: unknown } | null
    return {
      count: toCount(result?.count),
      error: result?.error ?? null,
    }
  } catch (error) {
    return { count: 0, error }
  }
}

export async function fetchDataConsistencyCounts(supabase: ConsistencySupabase): Promise<DataConsistencyCounts> {
  const rpcResult = await supabase.rpc("admin_data_consistency_alerts")
  if (!rpcResult.error && Array.isArray(rpcResult.data) && rpcResult.data.length > 0) {
    return {
      ...normalizeRpcRow(rpcResult.data[0]),
      source: "rpc",
      truncated: false,
    }
  }

  const [
    visitsWithoutBillingResult,
    openPrescriptionsResult,
    prescriptionsWithoutItemsResult,
    invoicesWithoutItemsResult,
    queueInProgressWithoutVisitResult,
    dischargedAdmissionsMissingSummaryResult,
    insuranceBatchTotalsRpcResult,
  ] =
    await Promise.all([
      countRows(supabase, "visits", (query) =>
        (query as { eq: (column: string, value: unknown) => unknown }).eq("visit_status", "billing_pending"),
      ),
      countRows(supabase, "prescriptions", (query) =>
        (query as { in: (column: string, values: string[]) => unknown }).in("status", ["pending", "ready", "in_progress"]),
      ),
      countRows(supabase, "prescriptions", (query) =>
        (
          query as {
            not: (column: string, operator: string, value: unknown) => unknown
          }
        ).not("id", "in", "(select prescription_id from public.prescription_items)"),
      ),
      countRows(supabase, "invoices", (query) =>
        (
          query as {
            not: (column: string, operator: string, value: unknown) => unknown
          }
        ).not("id", "in", "(select invoice_id from public.invoice_items)"),
      ),
      countRows(supabase, "queues", (query) =>
        (
          (query as { eq: (column: string, value: unknown) => unknown }).eq("status", "in_progress") as {
            is: (column: string, value: null) => unknown
          }
        ).is("visit_id", null),
      ),
      countRows(supabase, "admissions", (query) =>
        (
          (query as { eq: (column: string, value: unknown) => unknown }).eq("status", "discharged") as {
            is: (column: string, value: null) => unknown
          }
        ).is("discharge_summary", null),
      ),
      supabase.rpc("insurance_batch_total_mismatches_fallback"),
    ])

  const insuranceBatchTotalsFromRpc =
    !insuranceBatchTotalsRpcResult.error &&
    Array.isArray(insuranceBatchTotalsRpcResult.data) &&
    insuranceBatchTotalsRpcResult.data.length > 0
      ? normalizeRpcRow(insuranceBatchTotalsRpcResult.data[0])
      : null

  const insuranceBatchesWithoutTotals = insuranceBatchTotalsFromRpc
    ? insuranceBatchTotalsFromRpc.insurance_batches_without_totals
    : (await countRows(supabase, "insurance_billing_batches", (query) =>
        (query as { lte: (column: string, value: number) => unknown }).lte("total_amount", 0),
      )).count

  const insuranceBatchesWithMismatch = insuranceBatchTotalsFromRpc ? insuranceBatchTotalsFromRpc.insurance_batches_with_mismatch : 0

  return {
    visits_without_billing: visitsWithoutBillingResult.count,
    open_prescriptions_without_dispense: openPrescriptionsResult.count,
    prescriptions_without_items: prescriptionsWithoutItemsResult.count,
    invoices_without_items: invoicesWithoutItemsResult.count,
    queue_in_progress_without_visit: queueInProgressWithoutVisitResult.error ? 0 : queueInProgressWithoutVisitResult.count,
    insurance_batches_without_totals: insuranceBatchesWithoutTotals,
    insurance_batches_with_mismatch: insuranceBatchesWithMismatch,
    discharged_admissions_missing_summary: dischargedAdmissionsMissingSummaryResult.count,
    source: "fallback",
    truncated: false,
  }
}
