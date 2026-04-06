import { createServerClient } from "@/lib/supabase/server"
import { can } from "@/lib/utils"
import { cache } from "react"

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>

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
  low_stock_items?: unknown
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

const fetchPendingLabCountCached = cache(async () => {
  const supabase = await createServerClient()
  return supabase.from("lab_tests").select("id", { count: "exact", head: true }).eq("status", "pending")
})

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

export async function fetchDashboardRevenueTotal(
  supabase: SupabaseClient,
  queryTimings: DashboardQueryTimingRow[],
): Promise<DashboardRevenueResult> {
  const rpcResult = await runTimedDashboardQuery(queryTimings, "invoices.revenue_total.rpc", () =>
    supabase.rpc("dashboard_total_paid_revenue"),
  )
  const rpcData = (rpcResult as { data?: unknown; error?: { message?: string } | null }).data
  const rpcError = (rpcResult as { error?: { message?: string } | null }).error
  const rpcValue = Number(rpcData ?? 0)
  if (!rpcError && Number.isFinite(rpcValue)) {
    return { revenue: rpcValue, revenueTruncated: false, source: "rpc" }
  }

  if (rpcError) {
    console.warn("[dashboard.revenue] RPC unavailable, using fallback scan", rpcError.message || rpcError)
  }

  const fallbackResult = await runTimedDashboardQuery(
    queryTimings,
    "invoices.revenue_window.fallback",
    () =>
      supabase
        .from("invoices")
        .select("paid_amount")
        .not("payment_date", "is", null)
        .gt("paid_amount", 0)
        .limit(MAX_REVENUE_INVOICE_SCAN),
    (result) => (result as { data?: unknown[] | null }).data?.length,
  )

  const rows = (fallbackResult as { data?: { paid_amount?: number | null }[] | null }).data || []
  return {
    revenue: rows.reduce((sum, invoice) => sum + Number(invoice.paid_amount || 0), 0),
    revenueTruncated: rows.length >= MAX_REVENUE_INVOICE_SCAN,
    source: "fallback",
  }
}

export async function fetchDashboardMetrics(
  supabase: SupabaseClient,
  rbacUser: DashboardRbacUser,
  todayIsoDate: string,
  queryTimings: DashboardQueryTimingRow[],
) {
  const metricsRpcResult = await runTimedDashboardQuery(queryTimings, "dashboard.metrics.rpc", () =>
    supabase.rpc("dashboard_home_metrics", {
      p_today: todayIsoDate,
    }),
  )
  const metricsRpcError = (metricsRpcResult as { error?: { message?: string } | null }).error
  const metricsRpcRows = ((metricsRpcResult as { data?: DashboardMetricsRpcRow[] | null }).data || []) as DashboardMetricsRpcRow[]
  const metricsRpcRow = metricsRpcRows[0]

  if (!metricsRpcError && metricsRpcRow) {
    return {
      patientsCount: { count: Number(metricsRpcRow.total_patients ?? 0) },
      appointmentsToday: { count: Number(metricsRpcRow.today_appointments ?? 0) },
      pendingPrescriptions: { count: Number(metricsRpcRow.pending_prescriptions ?? 0) },
      activeAdmissions: { count: Number(metricsRpcRow.active_admissions ?? 0) },
      pendingLabTests: { count: Number(metricsRpcRow.pending_lab_tests ?? 0) },
      revenue: {
        revenue: Number(metricsRpcRow.total_revenue ?? 0),
        revenueTruncated: false,
        source: "rpc" as const,
      },
      canViewRevenue: can(rbacUser, "billing.manage") || can(rbacUser, "reports.view"),
      canViewAdmissions: can(rbacUser, "inpatient.manage"),
      canViewLabTests: can(rbacUser, "lab.manage"),
      source: "rpc" as const,
    }
  }

  if (metricsRpcError) {
    console.warn("[dashboard.metrics] RPC unavailable, using fallback queries", metricsRpcError.message || metricsRpcError)
  }

  const revenueResult = fetchDashboardRevenueTotal(supabase, queryTimings)

  const [patientsCount, appointmentsToday, pendingPrescriptions, activeAdmissions, pendingLabTests, revenue] =
    await Promise.all([
      runTimedDashboardQuery(queryTimings, "patients.count", () =>
        supabase.from("patients").select("id", { count: "exact", head: true }),
      ),
      runTimedDashboardQuery(queryTimings, "appointments.today.count", () =>
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("appointment_date", todayIsoDate)
          .neq("status", "cancelled"),
      ),
      runTimedDashboardQuery(queryTimings, "prescriptions.pending.count", () =>
        supabase.from("prescriptions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ),
      runTimedDashboardQuery(queryTimings, "admissions.active.count", () =>
        supabase.from("admissions").select("id", { count: "exact", head: true }).eq("status", "active"),
      ),
      runTimedDashboardQuery(queryTimings, "lab_tests.pending.count", () => fetchPendingLabCountCached()),
      revenueResult,
    ])

  return {
    patientsCount,
    appointmentsToday,
    pendingPrescriptions,
    activeAdmissions,
    pendingLabTests,
    revenue,
    canViewRevenue: can(rbacUser, "billing.manage") || can(rbacUser, "reports.view"),
    canViewAdmissions: can(rbacUser, "inpatient.manage"),
    canViewLabTests: can(rbacUser, "lab.manage"),
    source: "fallback" as const,
  }
}

export async function fetchDashboardAlertInputs(
  supabase: SupabaseClient,
  rbacUser: DashboardRbacUser,
  queryTimings: DashboardQueryTimingRow[],
) {
  const alertsRpcResult = await runTimedDashboardQuery(queryTimings, "dashboard.alerts.rpc", () =>
    supabase.rpc("dashboard_home_alerts", {
      p_low_stock_limit: DASHBOARD_ALERT_STOCK_LIMIT,
    }),
  )
  const alertsRpcError = (alertsRpcResult as { error?: { message?: string } | null }).error
  const alertsRpcRows = ((alertsRpcResult as { data?: DashboardAlertsRpcRow[] | null }).data || []) as DashboardAlertsRpcRow[]
  const alertsRpcRow = alertsRpcRows[0]

  if (!alertsRpcError && alertsRpcRow) {
    return {
      pendingLabCount: Number(alertsRpcRow.pending_lab_tests ?? 0),
      pendingRadiologyCount: Number(alertsRpcRow.pending_radiology_requests ?? 0),
      overdueInvoiceCount: Number(alertsRpcRow.outstanding_invoices ?? 0),
      lowStockItems: parseDashboardAlertStockRows(alertsRpcRow.low_stock_items),
      source: "rpc" as const,
    }
  }

  if (alertsRpcError) {
    console.warn("[dashboard.alerts] RPC unavailable, using fallback queries", alertsRpcError.message || alertsRpcError)
  }

  const [pendingLabTests, lowStockRows, pendingRadiologyRequests, overdueInvoices] = await Promise.all([
    can(rbacUser, "lab.manage")
      ? runTimedDashboardQuery(queryTimings, "lab_tests.pending.alerts.count", () => fetchPendingLabCountCached())
      : Promise.resolve({ count: 0 }),
    can(rbacUser, "pharmacy.manage")
      ? runTimedDashboardQuery(
          queryTimings,
          "medication_stock.low_stock.snapshot",
          () =>
            supabase
              .from("medication_stock")
              .select("quantity_on_hand, reorder_level, medications(name)")
              .gt("reorder_level", 0)
              .order("quantity_on_hand", { ascending: true })
              .limit(DASHBOARD_ALERT_STOCK_LIMIT),
          (result) => (result as { data?: unknown[] | null }).data?.length,
        )
      : Promise.resolve({ data: [] }),
    can(rbacUser, "lab.manage")
      ? runTimedDashboardQuery(queryTimings, "radiology_requests.pending.count", () =>
          supabase
            .from("radiology_requests")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending", "scheduled"]),
        )
      : Promise.resolve({ count: 0 }),
    can(rbacUser, "billing.manage") || can(rbacUser, "reports.view")
      ? runTimedDashboardQuery(queryTimings, "invoices.overdue.count", () =>
          supabase
            .from("invoices")
            .select("paid_amount, total_amount")
            .gt("total_amount", 0)
            .limit(MAX_REVENUE_INVOICE_SCAN),
          (result) => (result as { data?: unknown[] | null }).data?.length,
        )
      : Promise.resolve({ data: [] }),
  ])

  const lowStockItems = (
    (((lowStockRows as { data?: DashboardAlertStockRow[] | null }).data || []) as DashboardAlertStockRow[])
  ).filter((row) => {
    const quantity = Number(row.quantity_on_hand || 0)
    const reorderLevel = Number(row.reorder_level || 0)
    return reorderLevel > 0 && quantity <= reorderLevel
  })

  return {
    pendingLabCount: pendingLabTests.count || 0,
    pendingRadiologyCount: pendingRadiologyRequests.count || 0,
    overdueInvoiceCount: (((overdueInvoices as { data?: Array<{ paid_amount?: number | null; total_amount?: number | null }> | null }).data || []).filter(
      (invoice) => Math.max(Number(invoice.total_amount ?? 0) - Number(invoice.paid_amount ?? 0), 0) > 0,
    ).length),
    lowStockItems,
    source: "fallback" as const,
  }
}

export async function fetchDashboardTrendInputs(
  supabase: SupabaseClient,
  rbacUser: DashboardRbacUser,
  trendStartDate: string,
  queryTimings: DashboardQueryTimingRow[],
) {
  const trendEndDate = new Date()
  const trendEndIsoDate = trendEndDate.toISOString().split("T")[0]
  const trendsRpcResult = await runTimedDashboardQuery(queryTimings, "dashboard.trends.rpc", () =>
    supabase.rpc("dashboard_seven_day_trends", {
      p_start: trendStartDate,
      p_end: trendEndIsoDate,
    }),
  )
  const trendsRpcError = (trendsRpcResult as { error?: { message?: string } | null }).error
  const trendsRpcRows = ((trendsRpcResult as { data?: DashboardTrendsRpcRow[] | null }).data || []) as DashboardTrendsRpcRow[]

  if (!trendsRpcError && trendsRpcRows.length > 0) {
    return {
      patientTrendRows: {
        data: trendsRpcRows.map((row) => ({ created_at: row.day ? `${row.day}T00:00:00.000Z` : null })),
      },
      appointmentTrendRows: {
        data: trendsRpcRows.map((row) => ({ appointment_date: row.day, value: Number(row.appointment_count ?? 0) })),
      },
      revenueTrendRows: {
        data: trendsRpcRows.map((row) => ({ payment_date: row.day ? `${row.day}T00:00:00.000Z` : null, paid_amount: Number(row.revenue_total ?? 0) })),
      },
      source: "rpc" as const,
      trendDataTruncated: false,
    }
  }

  if (trendsRpcError) {
    console.warn("[dashboard.trends] RPC unavailable, using fallback queries", trendsRpcError.message || trendsRpcError)
  }

  const [patientTrendRows, appointmentTrendRows, revenueTrendRows] = await Promise.all([
    runTimedDashboardQuery(
      queryTimings,
      "patients.trend.7d",
      () =>
        supabase
          .from("patients")
          .select("created_at")
          .gte("created_at", `${trendStartDate}T00:00:00.000Z`)
          .limit(MAX_TREND_ROW_SCAN),
      (result) => (result as { data?: unknown[] | null }).data?.length,
    ),
    runTimedDashboardQuery(
      queryTimings,
      "appointments.trend.7d",
      () =>
        supabase
          .from("appointments")
          .select("appointment_date")
          .gte("appointment_date", trendStartDate)
          .neq("status", "cancelled")
          .limit(MAX_TREND_ROW_SCAN),
      (result) => (result as { data?: unknown[] | null }).data?.length,
    ),
    can(rbacUser, "billing.manage") || can(rbacUser, "reports.view")
      ? runTimedDashboardQuery(
          queryTimings,
          "invoices.paid.trend.7d",
          () =>
            supabase
              .from("invoices")
              .select("payment_date, paid_amount")
              .gte("payment_date", trendStartDate)
              .not("payment_date", "is", null)
              .gt("paid_amount", 0)
              .limit(MAX_TREND_ROW_SCAN),
          (result) => (result as { data?: unknown[] | null }).data?.length,
        )
      : Promise.resolve({ data: [] }),
  ])

  const trendDataTruncated =
    (((patientTrendRows as { data?: unknown[] | null }).data || []).length || 0) >= MAX_TREND_ROW_SCAN ||
    (((appointmentTrendRows as { data?: unknown[] | null }).data || []).length || 0) >= MAX_TREND_ROW_SCAN ||
    (((revenueTrendRows as { data?: unknown[] | null }).data || []).length || 0) >= MAX_TREND_ROW_SCAN

  return { patientTrendRows, appointmentTrendRows, revenueTrendRows, source: "fallback" as const, trendDataTruncated }
}

export async function fetchDashboardRecentActivity(
  supabase: SupabaseClient,
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
