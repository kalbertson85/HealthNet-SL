import { cache } from "react"
import { unstable_cache } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServerClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { can } from "@/lib/utils"

export interface DashboardQueryTimingRow {
  label: string
  durationMs: number
  rows?: number
}

export interface DashboardRevenueResult {
  revenue: number
  revenueTruncated: boolean
  source: "rpc" | "fallback"
}

interface DashboardMetricsRpcRow {
  total_patients?: number | string | null
  today_appointments?: number | string | null
  pending_prescriptions?: number | string | null
  active_admissions?: number | string | null
  pending_lab_tests?: number | string | null
  total_revenue?: number | string | null
}

interface DashboardTrendsRpcRow {
  day?: string | null
  patient_count?: number | string | null
  appointment_count?: number | string | null
  revenue_total?: number | string | null
}

interface DashboardAlertsRpcRow {
  pending_lab_tests?: number | string | null
  pending_radiology_requests?: number | string | null
  outstanding_invoices?: number | string | null
  expiring_drugs?: number | string | null
  unbilled_visits?: number | string | null
  pending_discharges?: number | string | null
  low_stock_items?: unknown
}

interface DashboardMetricsRaw {
  totalPatients: number
  todayAppointments: number
  pendingPrescriptions: number
  activeAdmissions: number
  pendingLabTests: number
  revenue: DashboardRevenueResult
  source: "rpc" | "fallback"
}

interface DashboardAlertsRaw {
  pendingLabCount: number
  pendingRadiologyCount: number
  overdueInvoiceCount: number
  expiringDrugsCount: number
  unbilledVisitsCount: number
  pendingDischargesCount: number
  lowStockItems: DashboardAlertStockRow[]
  consistencyVisitsWithoutBilling: number
  consistencyPrescriptionsWithoutDispense: number
  consistencyInsuranceBatchesWithoutTotals: number
  source: "rpc" | "fallback"
}

interface DashboardTrendRaw {
  patientTrendRows: { data: Array<{ created_at?: string | null; value?: number | null }> }
  appointmentTrendRows: { data: Array<{ appointment_date?: string | null; value?: number | null }> }
  revenueTrendRows: { data: Array<{ payment_date?: string | null; paid_amount?: number | null }> }
  source: "rpc" | "fallback"
  trendDataTruncated: boolean
}

export interface DashboardTrendPoint {
  label: string
  value: number
}

export interface DashboardRbacUser {
  id: string
  role: string | null
}

export interface DashboardAlertStockRow {
  quantity_on_hand?: number | null
  reorder_level?: number | null
  medications?: { name?: string | null } | null
}

export interface RecentPatientRow {
  id: string
  full_name: string | null
  patient_number: string | null
}

export interface TodayAppointmentRow {
  id: string
  appointment_time: string
  patients?: { full_name?: string | null } | { full_name?: string | null }[] | null
  profiles?: { full_name?: string | null } | { full_name?: string | null }[] | null
}

export const MAX_REVENUE_INVOICE_SCAN = 1500
export const MAX_TREND_ROW_SCAN = 1000
const DASHBOARD_ALERT_STOCK_LIMIT = 12
const DASHBOARD_CACHE_REVALIDATE_SECONDS = 300

type QuerySupabaseClient = SupabaseClient

function getDashboardAggregateClient() {
  return createAdminClient() as QuerySupabaseClient
}

function parseDashboardAlertStockRows(value: unknown): DashboardAlertStockRow[] {
  if (!Array.isArray(value)) return []
  return value.map((row) => {
    const record = (row || {}) as {
      quantity_on_hand?: number | string | null
      reorder_level?: number | string | null
      medication_name?: string | null
    }
    return {
      quantity_on_hand: Number(record.quantity_on_hand ?? 0),
      reorder_level: Number(record.reorder_level ?? 0),
      medications: { name: record.medication_name ?? null },
    }
  })
}

export async function runTimedDashboardQuery<T>(
  queryTimings: DashboardQueryTimingRow[],
  label: string,
  run: () => PromiseLike<T>,
  getRows?: (value: T) => number | undefined,
): Promise<T> {
  const startedAt = Date.now()
  const result = await run()
  const durationMs = Math.max(0, Date.now() - startedAt)
  queryTimings.push({
    label,
    durationMs,
    rows: getRows ? getRows(result) : undefined,
  })
  return result
}

export function getSlowestDashboardQuery(queryTimings: DashboardQueryTimingRow[]) {
  return queryTimings.reduce<DashboardQueryTimingRow | null>(
    (max, current) => (max === null || current.durationMs > max.durationMs ? current : max),
    null,
  )
}

async function fetchDashboardRevenueTotalWithClient(supabase: QuerySupabaseClient): Promise<DashboardRevenueResult> {
  const rpcResult = await supabase.rpc("dashboard_total_paid_revenue")
  const rpcData = (rpcResult as { data?: unknown; error?: { message?: string } | null }).data
  const rpcError = (rpcResult as { error?: { message?: string } | null }).error
  const rpcValue = Number(rpcData ?? 0)
  if (!rpcError && Number.isFinite(rpcValue)) {
    return { revenue: rpcValue, revenueTruncated: false, source: "rpc" }
  }

  const fallbackResult = await supabase
    .from("invoices")
    .select("paid_amount")
    .not("payment_date", "is", null)
    .gt("paid_amount", 0)
    .limit(MAX_REVENUE_INVOICE_SCAN)

  const rows = ((fallbackResult as { data?: { paid_amount?: number | null }[] | null }).data || [])
  return {
    revenue: rows.reduce((sum, invoice) => sum + Number(invoice.paid_amount || 0), 0),
    revenueTruncated: rows.length >= MAX_REVENUE_INVOICE_SCAN,
    source: "fallback",
  }
}

async function fetchDashboardMetricsRaw(supabase: QuerySupabaseClient, todayIsoDate: string): Promise<DashboardMetricsRaw> {
  const metricsRpcResult = await supabase.rpc("dashboard_home_metrics", { p_today: todayIsoDate })
  const metricsRpcError = (metricsRpcResult as { error?: { message?: string } | null }).error
  const metricsRpcRows = ((metricsRpcResult as { data?: DashboardMetricsRpcRow[] | null }).data || []) as DashboardMetricsRpcRow[]
  const metricsRpcRow = metricsRpcRows[0]

  if (!metricsRpcError && metricsRpcRow) {
    return {
      totalPatients: Number(metricsRpcRow.total_patients ?? 0),
      todayAppointments: Number(metricsRpcRow.today_appointments ?? 0),
      pendingPrescriptions: Number(metricsRpcRow.pending_prescriptions ?? 0),
      activeAdmissions: Number(metricsRpcRow.active_admissions ?? 0),
      pendingLabTests: Number(metricsRpcRow.pending_lab_tests ?? 0),
      revenue: {
        revenue: Number(metricsRpcRow.total_revenue ?? 0),
        revenueTruncated: false,
        source: "rpc",
      },
      source: "rpc",
    }
  }

  const [patientsCount, appointmentsToday, pendingPrescriptions, activeAdmissions, pendingLabTests, revenue] = await Promise.all([
    supabase.from("patients").select("id", { count: "exact", head: true }),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("appointment_date", todayIsoDate)
      .neq("status", "cancelled"),
    supabase.from("prescriptions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("admissions").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("lab_tests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    fetchDashboardRevenueTotalWithClient(supabase),
  ])

  return {
    totalPatients: Number(patientsCount.count ?? 0),
    todayAppointments: Number(appointmentsToday.count ?? 0),
    pendingPrescriptions: Number(pendingPrescriptions.count ?? 0),
    activeAdmissions: Number(activeAdmissions.count ?? 0),
    pendingLabTests: Number(pendingLabTests.count ?? 0),
    revenue,
    source: "fallback",
  }
}

async function fetchDashboardAlertInputsRaw(supabase: QuerySupabaseClient): Promise<DashboardAlertsRaw> {
  const alertsRpcResult = await supabase.rpc("dashboard_home_alerts", {
    p_low_stock_limit: DASHBOARD_ALERT_STOCK_LIMIT,
  })
  const alertsRpcError = (alertsRpcResult as { error?: { message?: string } | null }).error
  const alertsRpcRows = ((alertsRpcResult as { data?: DashboardAlertsRpcRow[] | null }).data || []) as DashboardAlertsRpcRow[]
  const alertsRpcRow = alertsRpcRows[0]

  if (!alertsRpcError && alertsRpcRow) {
    const consistencyRpcResult = await supabase.rpc("admin_data_consistency_alerts")
    const consistencyRows = ((consistencyRpcResult as { data?: Array<Record<string, number | string | null>> | null }).data || [])
    const consistency = consistencyRows[0] || {}

    return {
      pendingLabCount: Number(alertsRpcRow.pending_lab_tests ?? 0),
      pendingRadiologyCount: Number(alertsRpcRow.pending_radiology_requests ?? 0),
      overdueInvoiceCount: Number(alertsRpcRow.outstanding_invoices ?? 0),
      expiringDrugsCount: Number(alertsRpcRow.expiring_drugs ?? 0),
      unbilledVisitsCount: Number(alertsRpcRow.unbilled_visits ?? 0),
      pendingDischargesCount: Number(alertsRpcRow.pending_discharges ?? 0),
      lowStockItems: parseDashboardAlertStockRows(alertsRpcRow.low_stock_items),
      consistencyVisitsWithoutBilling: Number(consistency.visits_without_billing ?? alertsRpcRow.unbilled_visits ?? 0),
      consistencyPrescriptionsWithoutDispense: Number(consistency.prescriptions_without_dispense ?? 0),
      consistencyInsuranceBatchesWithoutTotals: Number(consistency.insurance_batches_without_totals ?? 0),
      source: "rpc",
    }
  }

  const today = new Date()
  const thirtyDaysAhead = new Date(today)
  thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30)

  const [pendingLabTests, lowStockRows, pendingRadiologyRequests, overdueInvoices, expiringDrugs, unbilledVisits, pendingDischarges, prescriptionsWithoutDispense, insuranceBatchesWithoutTotals] = await Promise.all([
    supabase.from("lab_tests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("medication_stock")
      .select("quantity_on_hand, reorder_level, medications(name)")
      .gt("reorder_level", 0)
      .order("quantity_on_hand", { ascending: true })
      .limit(DASHBOARD_ALERT_STOCK_LIMIT),
    supabase
      .from("radiology_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "scheduled"]),
    supabase.from("invoices").select("paid_amount, total_amount").gt("total_amount", 0).limit(MAX_REVENUE_INVOICE_SCAN),
    supabase
      .from("medication_stock")
      .select("id", { count: "exact", head: true })
      .gte("expiry_date", today.toISOString().slice(0, 10))
      .lte("expiry_date", thirtyDaysAhead.toISOString().slice(0, 10))
      .gt("quantity_on_hand", 0),
    supabase
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("visit_status", "billing_pending"),
    supabase.from("admissions").select("id", { count: "exact", head: true }).eq("status", "admitted"),
    supabase.from("prescriptions").select("id", { count: "exact", head: true }).in("status", ["pending", "ready", "in_progress"]),
    supabase.from("insurance_billing_batches").select("id", { count: "exact", head: true }).lte("total_amount", 0),
  ])

  const lowStockItems = (((lowStockRows as { data?: DashboardAlertStockRow[] | null }).data || []) as DashboardAlertStockRow[]).filter(
    (row) => Number(row.reorder_level || 0) > 0 && Number(row.quantity_on_hand || 0) <= Number(row.reorder_level || 0),
  )

  return {
    pendingLabCount: Number(pendingLabTests.count ?? 0),
    pendingRadiologyCount: Number(pendingRadiologyRequests.count ?? 0),
    overdueInvoiceCount: (((overdueInvoices as { data?: Array<{ paid_amount?: number | null; total_amount?: number | null }> | null }).data || []).filter(
      (invoice) => Math.max(Number(invoice.total_amount ?? 0) - Number(invoice.paid_amount ?? 0), 0) > 0,
    ).length),
    expiringDrugsCount: Number(expiringDrugs.count ?? 0),
    unbilledVisitsCount: Number(unbilledVisits.count ?? 0),
    pendingDischargesCount: Number(pendingDischarges.count ?? 0),
    lowStockItems,
    consistencyVisitsWithoutBilling: Number(unbilledVisits.count ?? 0),
    consistencyPrescriptionsWithoutDispense: Number(prescriptionsWithoutDispense.count ?? 0),
    consistencyInsuranceBatchesWithoutTotals: Number(insuranceBatchesWithoutTotals.count ?? 0),
    source: "fallback",
  }
}

async function fetchDashboardTrendInputsRaw(
  supabase: QuerySupabaseClient,
  trendStartDate: string,
  trendEndIsoDate: string,
): Promise<DashboardTrendRaw> {
  const trendsRpcResult = await supabase.rpc("dashboard_seven_day_trends", {
    p_start: trendStartDate,
    p_end: trendEndIsoDate,
  })
  const trendsRpcError = (trendsRpcResult as { error?: { message?: string } | null }).error
  const trendsRpcRows = ((trendsRpcResult as { data?: DashboardTrendsRpcRow[] | null }).data || []) as DashboardTrendsRpcRow[]

  if (!trendsRpcError && trendsRpcRows.length > 0) {
    return {
      patientTrendRows: {
        data: trendsRpcRows.map((row) => ({ created_at: row.day ? `${row.day}T00:00:00.000Z` : null, value: Number(row.patient_count ?? 0) })),
      },
      appointmentTrendRows: {
        data: trendsRpcRows.map((row) => ({ appointment_date: row.day, value: Number(row.appointment_count ?? 0) })),
      },
      revenueTrendRows: {
        data: trendsRpcRows.map((row) => ({ payment_date: row.day ? `${row.day}T00:00:00.000Z` : null, paid_amount: Number(row.revenue_total ?? 0) })),
      },
      source: "rpc",
      trendDataTruncated: false,
    }
  }

  const [patientTrendRows, appointmentTrendRows, revenueTrendRows] = await Promise.all([
    supabase
      .from("patients")
      .select("created_at")
      .gte("created_at", `${trendStartDate}T00:00:00.000Z`)
      .limit(MAX_TREND_ROW_SCAN),
    supabase
      .from("appointments")
      .select("appointment_date")
      .gte("appointment_date", trendStartDate)
      .neq("status", "cancelled")
      .limit(MAX_TREND_ROW_SCAN),
    supabase
      .from("invoices")
      .select("payment_date, paid_amount")
      .gte("payment_date", trendStartDate)
      .not("payment_date", "is", null)
      .gt("paid_amount", 0)
      .limit(MAX_TREND_ROW_SCAN),
  ])

  const patientRows = ((patientTrendRows as { data?: Array<{ created_at?: string | null }> | null }).data || []).map((row) => ({
    created_at: row.created_at,
    value: 1,
  }))
  const appointmentRows = ((appointmentTrendRows as { data?: Array<{ appointment_date?: string | null }> | null }).data || []).map(
    (row) => ({ appointment_date: row.appointment_date, value: 1 }),
  )
  const revenueRows = ((revenueTrendRows as { data?: Array<{ payment_date?: string | null; paid_amount?: number | null }> | null }).data || []).map(
    (row) => ({ payment_date: row.payment_date, paid_amount: Number(row.paid_amount ?? 0) }),
  )

  const trendDataTruncated =
    patientRows.length >= MAX_TREND_ROW_SCAN ||
    appointmentRows.length >= MAX_TREND_ROW_SCAN ||
    revenueRows.length >= MAX_TREND_ROW_SCAN

  return {
    patientTrendRows: { data: patientRows },
    appointmentTrendRows: { data: appointmentRows },
    revenueTrendRows: { data: revenueRows },
    source: "fallback",
    trendDataTruncated,
  }
}

const fetchCachedDashboardMetrics = unstable_cache(
  async (todayIsoDate: string) => fetchDashboardMetricsRaw(getDashboardAggregateClient(), todayIsoDate),
  ["dashboard-home-metrics"],
  { revalidate: DASHBOARD_CACHE_REVALIDATE_SECONDS },
)

const fetchCachedDashboardAlerts = unstable_cache(
  async () => fetchDashboardAlertInputsRaw(getDashboardAggregateClient()),
  ["dashboard-home-alerts"],
  { revalidate: DASHBOARD_CACHE_REVALIDATE_SECONDS },
)

const fetchCachedDashboardTrends = unstable_cache(
  async (trendStartDate: string, trendEndIsoDate: string) =>
    fetchDashboardTrendInputsRaw(getDashboardAggregateClient(), trendStartDate, trendEndIsoDate),
  ["dashboard-home-trends"],
  { revalidate: DASHBOARD_CACHE_REVALIDATE_SECONDS },
)

export async function fetchDashboardMetrics(
  supabase: QuerySupabaseClient,
  rbacUser: DashboardRbacUser,
  todayIsoDate: string,
  queryTimings: DashboardQueryTimingRow[],
) {
  let metrics: DashboardMetricsRaw

  try {
    metrics = await runTimedDashboardQuery(queryTimings, "dashboard.metrics.cached", () => fetchCachedDashboardMetrics(todayIsoDate))
  } catch (error) {
    console.warn("[dashboard.metrics] Cached aggregate unavailable, using request fallback", error)
    metrics = await runTimedDashboardQuery(queryTimings, "dashboard.metrics.request", () => fetchDashboardMetricsRaw(supabase, todayIsoDate))
  }

  return {
    patientsCount: { count: metrics.totalPatients },
    appointmentsToday: { count: metrics.todayAppointments },
    pendingPrescriptions: { count: metrics.pendingPrescriptions },
    activeAdmissions: { count: metrics.activeAdmissions },
    pendingLabTests: { count: metrics.pendingLabTests },
    revenue: metrics.revenue,
    canViewRevenue: can(rbacUser, "billing.manage") || can(rbacUser, "reports.view"),
    canViewAdmissions: can(rbacUser, "inpatient.manage"),
    canViewLabTests: can(rbacUser, "lab.manage"),
    source: metrics.source,
  }
}

export async function fetchDashboardAlertInputs(
  supabase: QuerySupabaseClient,
  rbacUser: DashboardRbacUser,
  queryTimings: DashboardQueryTimingRow[],
) {
  let alerts: DashboardAlertsRaw

  try {
    alerts = await runTimedDashboardQuery(queryTimings, "dashboard.alerts.cached", () => fetchCachedDashboardAlerts())
  } catch (error) {
    console.warn("[dashboard.alerts] Cached aggregate unavailable, using request fallback", error)
    alerts = await runTimedDashboardQuery(queryTimings, "dashboard.alerts.request", () => fetchDashboardAlertInputsRaw(supabase))
  }

  return {
    pendingLabCount: can(rbacUser, "lab.manage") ? alerts.pendingLabCount : 0,
    pendingRadiologyCount: can(rbacUser, "lab.manage") ? alerts.pendingRadiologyCount : 0,
    overdueInvoiceCount: can(rbacUser, "billing.manage") || can(rbacUser, "reports.view") ? alerts.overdueInvoiceCount : 0,
    expiringDrugsCount: can(rbacUser, "pharmacy.manage") ? alerts.expiringDrugsCount : 0,
    unbilledVisitsCount: can(rbacUser, "billing.manage") ? alerts.unbilledVisitsCount : 0,
    pendingDischargesCount: can(rbacUser, "inpatient.manage") ? alerts.pendingDischargesCount : 0,
    consistencyVisitsWithoutBilling: can(rbacUser, "billing.manage") ? alerts.consistencyVisitsWithoutBilling : 0,
    consistencyPrescriptionsWithoutDispense:
      can(rbacUser, "pharmacy.manage") || can(rbacUser, "prescriptions.manage")
        ? alerts.consistencyPrescriptionsWithoutDispense
        : 0,
    consistencyInsuranceBatchesWithoutTotals: can(rbacUser, "billing.manage") ? alerts.consistencyInsuranceBatchesWithoutTotals : 0,
    lowStockItems: can(rbacUser, "pharmacy.manage") ? alerts.lowStockItems : [],
    source: alerts.source,
  }
}

export async function fetchDashboardTrendInputs(
  supabase: QuerySupabaseClient,
  rbacUser: DashboardRbacUser,
  trendStartDate: string,
  queryTimings: DashboardQueryTimingRow[],
) {
  const trendEndIsoDate = new Date().toISOString().split("T")[0]
  let trends: DashboardTrendRaw

  try {
    trends = await runTimedDashboardQuery(queryTimings, "dashboard.trends.cached", () =>
      fetchCachedDashboardTrends(trendStartDate, trendEndIsoDate),
    )
  } catch (error) {
    console.warn("[dashboard.trends] Cached aggregate unavailable, using request fallback", error)
    trends = await runTimedDashboardQuery(queryTimings, "dashboard.trends.request", () =>
      fetchDashboardTrendInputsRaw(supabase, trendStartDate, trendEndIsoDate),
    )
  }

  return {
    patientTrendRows: trends.patientTrendRows,
    appointmentTrendRows: trends.appointmentTrendRows,
    revenueTrendRows:
      can(rbacUser, "billing.manage") || can(rbacUser, "reports.view") ? trends.revenueTrendRows : { data: [] },
    source: trends.source,
    trendDataTruncated: trends.trendDataTruncated,
  }
}

export async function fetchDashboardRecentActivity(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  todayIsoDate: string,
  canViewPatients: boolean,
  canManageAppointments: boolean,
) {
  const [recentPatientsResult, todayAppointmentsResult] = await Promise.all([
    canViewPatients
      ? supabase
          .from("patients")
          .select("id, full_name, patient_number")
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    canManageAppointments
      ? supabase
          .from("appointments")
          .select("id, appointment_time, patients(full_name), profiles(full_name)")
          .eq("appointment_date", todayIsoDate)
          .order("appointment_time", { ascending: true })
          .limit(5)
      : Promise.resolve({ data: [] }),
  ])

  return {
    recentPatients: (recentPatientsResult.data || []) as RecentPatientRow[],
    todayAppointments: (todayAppointmentsResult.data || []) as TodayAppointmentRow[],
  }
}

export const fetchDashboardRecentActivityCached = cache(fetchDashboardRecentActivity)
