import { createServerClient } from "@/lib/supabase/server"

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>

export interface InvoiceRow {
  paid_amount?: number | null
}

export interface CompanyOutstandingInvoiceRow {
  total_amount?: number | null
  paid_amount?: number | null
  company_id?: string | null
  companies?: {
    name?: string | null
  } | null
}

interface ReportsSummaryRpcRow {
  monthly_revenue?: number | string | null
  new_patients?: number | string | null
  completed_visits?: number | string | null
  pending_lab_tests?: number | string | null
}

interface TopCompanyOutstandingRpcRow {
  company_id?: string | null
  company_name?: string | null
  outstanding?: number | string | null
}

interface FhcAnalyticsRpcRow {
  economic_cost_total?: number | string | null
  cost_by_facility?: unknown
  care_path_by_facility?: unknown
  radiology_by_facility?: unknown
  lab_by_facility?: unknown
  admissions_by_facility?: unknown
  monthly_data_truncated?: boolean | null
}

export type FhcVisitsRef = {
  is_free_health_care?: boolean | null
  facility_id?: string | null
  facilities?: { name?: string | null; code?: string | null } | null
} | null

export interface FhcCostFacilityEntry {
  facilityId: string
  name: string
  code: string | null
  amount: number
}

export interface FhcCarePathFacilityEntry {
  facilityId: string
  name: string
  code: string | null
  admissions: number
  surgeries: number
  nursingNotes: number
}

export interface FhcCountFacilityEntry {
  facilityId: string
  name: string
  count: number
}

export interface FhcAdmissionFacilityEntry {
  facilityId: string
  name: string
  code: string | null
  count: number
  admittedCount: number
  dischargedCount: number
}

interface FhcRawItemRow {
  quantity?: number | null
  unit_price?: number | null
  item_type?: string | null
  invoices?: { visits?: FhcVisitsRef } | null
}

interface FhcRawFacilityRow {
  visits?: {
    is_free_health_care?: boolean | null
    facility_id?: string | null
    facilities?: { name?: string | null; code?: string | null } | null
  } | null
}

interface FhcRawAdmissionRow {
  status?: string | null
  visits?: FhcVisitsRef
}

interface FhcRawJsonFacilityEntry {
  facility_id?: string | null
  name?: string | null
  code?: string | null
  amount?: number | string | null
  count?: number | string | null
  admissions?: number | string | null
  surgeries?: number | string | null
  nursing_notes?: number | string | null
  admitted_count?: number | string | null
  discharged_count?: number | string | null
}

interface FhcAnalyticsResult {
  economicCostTotal: number
  costByFacility: FhcCostFacilityEntry[]
  carePathByFacility: FhcCarePathFacilityEntry[]
  radiologyByFacility: FhcCountFacilityEntry[]
  labByFacility: FhcCountFacilityEntry[]
  admissionsByFacility: FhcAdmissionFacilityEntry[]
  monthlyDataTruncated: boolean
  source: "rpc" | "fallback"
  rowCount: number
}

export const MAX_MONTHLY_INVOICE_ROWS = 3000
export const MAX_FHC_ANALYTICS_ROWS = 3000

export function parseReportDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

export function upsertCarePath(
  map: Map<string, { name: string; code: string | null; admissions: number; surgeries: number; nursingNotes: number }>,
  visits: FhcVisitsRef,
  field: "admissions" | "surgeries" | "nursingNotes",
) {
  if (!visits?.is_free_health_care) return
  const facilityId = visits.facility_id ?? "(none)"
  const facilityName = visits.facilities?.name ?? "Unknown facility"
  const facilityCode = visits.facilities?.code ?? null
  const existing = map.get(facilityId) || { name: facilityName, code: facilityCode, admissions: 0, surgeries: 0, nursingNotes: 0 }
  existing[field] += 1
  map.set(facilityId, existing)
}

function parseFhcCountList(value: unknown): FhcCountFacilityEntry[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    const row = (entry || {}) as FhcRawJsonFacilityEntry
    return {
      facilityId: row.facility_id ?? "(none)",
      name: row.name || "Unknown facility",
      count: Number(row.count ?? 0),
    }
  })
}

function parseFhcCostList(value: unknown): FhcCostFacilityEntry[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    const row = (entry || {}) as FhcRawJsonFacilityEntry
    return {
      facilityId: row.facility_id ?? "(none)",
      name: row.name || "Unknown facility",
      code: row.code ?? null,
      amount: Number(row.amount ?? 0),
    }
  })
}

function parseFhcCarePathList(value: unknown): FhcCarePathFacilityEntry[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    const row = (entry || {}) as FhcRawJsonFacilityEntry
    return {
      facilityId: row.facility_id ?? "(none)",
      name: row.name || "Unknown facility",
      code: row.code ?? null,
      admissions: Number(row.admissions ?? 0),
      surgeries: Number(row.surgeries ?? 0),
      nursingNotes: Number(row.nursing_notes ?? 0),
    }
  })
}

function parseFhcAdmissionList(value: unknown): FhcAdmissionFacilityEntry[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    const row = (entry || {}) as FhcRawJsonFacilityEntry
    return {
      facilityId: row.facility_id ?? "(none)",
      name: row.name || "Unknown facility",
      code: row.code ?? null,
      count: Number(row.count ?? 0),
      admittedCount: Number(row.admitted_count ?? 0),
      dischargedCount: Number(row.discharged_count ?? 0),
    }
  })
}

function sortByName<T extends { name: string }>(items: T[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}

function sortByCountDesc<T extends { count: number; name: string }>(items: T[]) {
  return [...items].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function aggregateFhcFallback(raw: {
  fhcItems: FhcRawItemRow[]
  fhcRadiology: FhcRawFacilityRow[]
  fhcLab: FhcRawFacilityRow[]
  fhcAdmissions: FhcRawAdmissionRow[]
  fhcSurgeries: FhcRawFacilityRow[]
  fhcNursingNotes: FhcRawFacilityRow[]
}): FhcAnalyticsResult {
  let economicCostTotal = 0
  const costByFacility = new Map<string, { name: string; code: string | null; amount: number }>()
  for (const row of raw.fhcItems) {
    const visits = row.invoices?.visits || null
    if (!visits?.is_free_health_care) continue
    if ((row.item_type || "billable") !== "fhc_covered") continue
    const amount = Number(row.quantity ?? 0) * Number(row.unit_price ?? 0)
    if (!Number.isFinite(amount)) continue
    economicCostTotal += amount
    const facilityId = visits.facility_id ?? "(none)"
    const facilityName = visits.facilities?.name ?? "Unknown facility"
    const facilityCode = visits.facilities?.code ?? null
    const existing = costByFacility.get(facilityId) || { name: facilityName, code: facilityCode, amount: 0 }
    existing.amount += amount
    costByFacility.set(facilityId, existing)
  }

  const carePathByFacility = new Map<string, { name: string; code: string | null; admissions: number; surgeries: number; nursingNotes: number }>()
  for (const row of raw.fhcAdmissions) upsertCarePath(carePathByFacility, row.visits || null, "admissions")
  for (const row of raw.fhcSurgeries) upsertCarePath(carePathByFacility, row.visits || null, "surgeries")
  for (const row of raw.fhcNursingNotes) upsertCarePath(carePathByFacility, row.visits || null, "nursingNotes")

  const radiologyByFacility = new Map<string, { name: string; count: number }>()
  for (const row of raw.fhcRadiology) {
    const visits = row.visits || null
    if (!visits?.is_free_health_care) continue
    const facilityId = visits.facility_id ?? "(none)"
    const facilityName = visits.facilities?.name ?? "Unknown facility"
    const existing = radiologyByFacility.get(facilityId) || { name: facilityName, count: 0 }
    existing.count += 1
    radiologyByFacility.set(facilityId, existing)
  }

  const labByFacility = new Map<string, { name: string; count: number }>()
  for (const row of raw.fhcLab) {
    const visits = row.visits || null
    if (!visits?.is_free_health_care) continue
    const facilityId = visits.facility_id ?? "(none)"
    const facilityName = visits.facilities?.name ?? "Unknown facility"
    const existing = labByFacility.get(facilityId) || { name: facilityName, count: 0 }
    existing.count += 1
    labByFacility.set(facilityId, existing)
  }

  const admissionsByFacility = new Map<string, { name: string; code: string | null; count: number; admittedCount: number; dischargedCount: number }>()
  for (const row of raw.fhcAdmissions) {
    const visits = row.visits || null
    if (!visits?.is_free_health_care) continue
    const facilityId = visits.facility_id ?? "(none)"
    const facilityName = visits.facilities?.name ?? "Unknown facility"
    const facilityCode = visits.facilities?.code ?? null
    const existing = admissionsByFacility.get(facilityId) || { name: facilityName, code: facilityCode, count: 0, admittedCount: 0, dischargedCount: 0 }
    existing.count += 1
    const status = (row.status || "").toLowerCase()
    if (status === "admitted") existing.admittedCount += 1
    if (status === "discharged") existing.dischargedCount += 1
    admissionsByFacility.set(facilityId, existing)
  }

  const monthlyDataTruncated =
    raw.fhcItems.length >= MAX_FHC_ANALYTICS_ROWS ||
    raw.fhcRadiology.length >= MAX_FHC_ANALYTICS_ROWS ||
    raw.fhcLab.length >= MAX_FHC_ANALYTICS_ROWS ||
    raw.fhcAdmissions.length >= MAX_FHC_ANALYTICS_ROWS ||
    raw.fhcSurgeries.length >= MAX_FHC_ANALYTICS_ROWS ||
    raw.fhcNursingNotes.length >= MAX_FHC_ANALYTICS_ROWS

  return {
    economicCostTotal,
    costByFacility: [...costByFacility.entries()]
      .map(([facilityId, entry]) => ({ facilityId, ...entry }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)),
    carePathByFacility: sortByName(Array.from(carePathByFacility.entries()).map(([facilityId, entry]) => ({ facilityId, ...entry }))),
    radiologyByFacility: sortByCountDesc(Array.from(radiologyByFacility.entries()).map(([facilityId, entry]) => ({ facilityId, ...entry }))),
    labByFacility: sortByCountDesc(Array.from(labByFacility.entries()).map(([facilityId, entry]) => ({ facilityId, ...entry }))),
    admissionsByFacility: sortByCountDesc(Array.from(admissionsByFacility.entries()).map(([facilityId, entry]) => ({ facilityId, ...entry }))),
    monthlyDataTruncated,
    source: "fallback",
    rowCount:
      raw.fhcItems.length +
      raw.fhcRadiology.length +
      raw.fhcLab.length +
      raw.fhcAdmissions.length +
      raw.fhcSurgeries.length +
      raw.fhcNursingNotes.length,
  }
}

export async function fetchReportsSummary(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string,
) {
  const rpcResult = await supabase.rpc("dashboard_reports_summary", {
    p_from: fromIso,
    p_to: toIso,
  })
  const rpcError = (rpcResult as { error?: { message?: string } | null }).error
  const rpcRows = ((rpcResult as { data?: ReportsSummaryRpcRow[] | null }).data || []) as ReportsSummaryRpcRow[]
  const rpcRow = rpcRows[0]

  if (!rpcError && rpcRow) {
    return {
      monthlyRevenue: Number(rpcRow.monthly_revenue ?? 0),
      paidInvoiceRows: [] as InvoiceRow[],
      newPatientsCount: { count: Number(rpcRow.new_patients ?? 0) },
      completedVisitsCount: { count: Number(rpcRow.completed_visits ?? 0) },
      pendingLabTestsCount: { count: Number(rpcRow.pending_lab_tests ?? 0) },
      source: "rpc" as const,
    }
  }

  if (rpcError) {
    console.warn("[reports.summary] RPC unavailable, using fallback queries", rpcError.message || rpcError)
  }

  const [{ data: paidInvoices }, newPatientsCount, completedVisitsCount, pendingLabTestsCount] = await Promise.all([
    supabase
      .from("invoices")
      .select("paid_amount")
      .not("payment_date", "is", null)
      .gte("payment_date", fromIso)
      .lte("payment_date", toIso)
      .gt("paid_amount", 0)
      .limit(MAX_MONTHLY_INVOICE_ROWS),
    supabase.from("patients").select("id", { count: "exact", head: true }).gte("created_at", fromIso).lte("created_at", toIso),
    supabase
      .from("visits")
      .select("id", { count: "exact", head: true })
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .eq("visit_status", "completed"),
    supabase.from("lab_tests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ])

  let monthlyRevenue = 0
  for (const row of (paidInvoices || []) as InvoiceRow[]) {
    monthlyRevenue += Number(row.paid_amount ?? 0)
  }

  return {
    monthlyRevenue,
    paidInvoiceRows: paidInvoices || [],
    newPatientsCount,
    completedVisitsCount,
    pendingLabTestsCount,
    source: "fallback" as const,
  }
}

export async function fetchTopCompanies(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string,
) {
  const rpcResult = await supabase.rpc("dashboard_report_top_company_outstanding", {
    p_from: fromIso,
    p_to: toIso,
    p_limit: 5,
  })
  const rpcError = (rpcResult as { error?: { message?: string } | null }).error
  const rpcRows = ((rpcResult as { data?: TopCompanyOutstandingRpcRow[] | null }).data || []) as TopCompanyOutstandingRpcRow[]

  if (!rpcError) {
    const topCompanies = rpcRows.map((row) => [
      row.company_id ?? "",
      {
        name: row.company_name || "Unknown company",
        outstanding: Number(row.outstanding ?? 0),
      },
    ]) as Array<[string, { name: string; outstanding: number }]>

    return {
      companyInvoiceRows: [] as CompanyOutstandingInvoiceRow[],
      topCompanies,
      source: "rpc" as const,
    }
  }

  if (rpcError) {
    console.warn("[reports.top_companies] RPC unavailable, using fallback queries", rpcError.message || rpcError)
  }

  const { data: companyInvoices } = await supabase
    .from("invoices")
    .select("total_amount, paid_amount, company_id, companies(name)")
    .eq("payer_type", "company")
    .not("company_id", "is", null)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .limit(MAX_MONTHLY_INVOICE_ROWS)

  const companyOutstandingMap = new Map<string, { name: string; outstanding: number }>()
  for (const row of (companyInvoices || []) as CompanyOutstandingInvoiceRow[]) {
    const total = Number(row.total_amount ?? 0)
    const paid = Number(row.paid_amount ?? 0)
    const companyId = row.company_id ?? null
    if (!companyId) continue
    const outstanding = Math.max(total - paid, 0)
    if (outstanding <= 0) continue
    const existing = companyOutstandingMap.get(companyId) || { name: row.companies?.name || "Unknown company", outstanding: 0 }
    existing.outstanding += outstanding
    companyOutstandingMap.set(companyId, existing)
  }

  const topCompanies = Array.from(companyOutstandingMap.entries())
    .sort((a, b) => b[1].outstanding - a[1].outstanding)
    .slice(0, 5)

  return {
    companyInvoiceRows: companyInvoices || [],
    topCompanies,
    source: "fallback" as const,
  }
}

export async function fetchFhcAnalytics(
  supabase: SupabaseClient,
  startOfRangeIso: string,
  endOfRangeIso: string,
): Promise<FhcAnalyticsResult> {
  const rpcResult = await supabase.rpc("dashboard_reports_fhc_analytics", {
    p_from: startOfRangeIso,
    p_to: endOfRangeIso,
  })
  const rpcError = (rpcResult as { error?: { message?: string } | null }).error
  const rpcRows = ((rpcResult as { data?: FhcAnalyticsRpcRow[] | null }).data || []) as FhcAnalyticsRpcRow[]
  const rpcRow = rpcRows[0]

  if (!rpcError && rpcRow) {
    const costByFacility = parseFhcCostList(rpcRow.cost_by_facility)
    const carePathByFacility = parseFhcCarePathList(rpcRow.care_path_by_facility)
    const radiologyByFacility = parseFhcCountList(rpcRow.radiology_by_facility)
    const labByFacility = parseFhcCountList(rpcRow.lab_by_facility)
    const admissionsByFacility = parseFhcAdmissionList(rpcRow.admissions_by_facility)

    return {
      economicCostTotal: Number(rpcRow.economic_cost_total ?? 0),
      costByFacility,
      carePathByFacility,
      radiologyByFacility,
      labByFacility,
      admissionsByFacility,
      monthlyDataTruncated: Boolean(rpcRow.monthly_data_truncated),
      source: "rpc",
      rowCount:
        costByFacility.length +
        carePathByFacility.length +
        radiologyByFacility.length +
        labByFacility.length +
        admissionsByFacility.length,
    }
  }

  if (rpcError) {
    console.warn("[reports.fhc] RPC unavailable, using fallback queries", rpcError.message || rpcError)
  }

  const [{ data: fhcItems }, { data: fhcRadiology }, { data: fhcLab }, { data: fhcAdmissions }, { data: fhcSurgeries }, { data: fhcNursingNotes }] =
    await Promise.all([
      supabase
        .from("invoice_items")
        .select(
          `quantity, unit_price, item_type,
           invoices(created_at, visit_id,
             visits(is_free_health_care, facility_id,
               facilities(name, code)
             )
           )`,
        )
        .eq("item_type", "fhc_covered")
        .gte("invoices.created_at", startOfRangeIso)
        .lte("invoices.created_at", endOfRangeIso)
        .limit(MAX_FHC_ANALYTICS_ROWS),
      supabase
        .from("radiology_requests")
        .select(
          `id,
           visits(is_free_health_care, facility_id,
             facilities(name, code)
           )`,
        )
        .gte("created_at", startOfRangeIso)
        .lte("created_at", endOfRangeIso)
        .limit(MAX_FHC_ANALYTICS_ROWS),
      supabase
        .from("lab_tests")
        .select(
          `id,
           visits(is_free_health_care, facility_id,
             facilities(name, code)
           )`,
        )
        .gte("created_at", startOfRangeIso)
        .lte("created_at", endOfRangeIso)
        .limit(MAX_FHC_ANALYTICS_ROWS),
      supabase
        .from("admissions")
        .select(
          `id, admission_date, status,
           visits(is_free_health_care, facility_id,
             facilities(name, code)
           )`,
        )
        .in("status", ["admitted", "discharged"])
        .gte("admission_date", startOfRangeIso)
        .lte("admission_date", endOfRangeIso)
        .limit(MAX_FHC_ANALYTICS_ROWS),
      supabase
        .from("surgeries")
        .select(
          `id, status,
           visits(is_free_health_care, facility_id,
             facilities(name, code)
           )`,
        )
        .gte("scheduled_at", startOfRangeIso)
        .lte("scheduled_at", endOfRangeIso)
        .limit(MAX_FHC_ANALYTICS_ROWS),
      supabase
        .from("visit_nursing_notes")
        .select(
          `id, visit_id,
           visits(is_free_health_care, facility_id,
             facilities(name, code)
           )`,
        )
        .gte("performed_at", startOfRangeIso)
        .lte("performed_at", endOfRangeIso)
        .limit(MAX_FHC_ANALYTICS_ROWS),
    ])

  return aggregateFhcFallback({
    fhcItems: (fhcItems || []) as FhcRawItemRow[],
    fhcRadiology: (fhcRadiology || []) as FhcRawFacilityRow[],
    fhcLab: (fhcLab || []) as FhcRawFacilityRow[],
    fhcAdmissions: (fhcAdmissions || []) as FhcRawAdmissionRow[],
    fhcSurgeries: (fhcSurgeries || []) as FhcRawFacilityRow[],
    fhcNursingNotes: (fhcNursingNotes || []) as FhcRawFacilityRow[],
  })
}
