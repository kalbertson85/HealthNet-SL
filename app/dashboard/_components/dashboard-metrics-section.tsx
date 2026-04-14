import { createServerClient } from "@/lib/supabase/server"
import { StatCard } from "@/components/stat-card"
import { AlertCircle, Calendar, DollarSign, Activity, FileText, Users } from "lucide-react"
import { can } from "@/lib/utils"
import { startPageRenderTimer } from "@/lib/observability/page-performance"
import {
  fetchDashboardMetrics,
  getSlowestDashboardQuery,
  MAX_REVENUE_INVOICE_SCAN,
  type DashboardQueryTimingRow,
  type DashboardRbacUser,
} from "@/lib/dashboard/queries"
import { getGlobalSettings } from "@/lib/global-settings"
import { createTranslator } from "@/lib/i18n"
import { formatCurrency, formatNumber } from "@/lib/locale-format"
import { logDashboardQueryTimings } from "@/app/dashboard/_components/dashboard-query-logging"

export async function DashboardMetricsSection({
  rbacUser,
  todayIsoDate,
}: {
  rbacUser: DashboardRbacUser
  todayIsoDate: string
}) {
  const sectionPerf = startPageRenderTimer("dashboard.home.metrics", { slowThresholdMs: 1500 })
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()
  const t = createTranslator(settings.language)
  const queryTimings: DashboardQueryTimingRow[] = []

  try {
    const { patientsCount, appointmentsToday, pendingPrescriptions, activeAdmissions, pendingLabTests, revenue, source } =
      await fetchDashboardMetrics(supabase, rbacUser, todayIsoDate, queryTimings)

    logDashboardQueryTimings(queryTimings)
    const slowest = getSlowestDashboardQuery(queryTimings)
    sectionPerf.done({
      query_count: queryTimings.length,
      slowest_query: slowest?.label || null,
      slowest_query_ms: slowest?.durationMs ?? 0,
      revenue_truncated: revenue.revenueTruncated,
      revenue_source: revenue.source,
      source,
    })

    return (
      <div className="space-y-6">
        {revenue.revenueTruncated ? (
          <div className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t("dashboard.metricsRevenueFallbackNotice", "Revenue is computed from the latest {count} paid invoices while aggregate RPC is unavailable.").replace(
              "{count}",
              formatNumber(MAX_REVENUE_INVOICE_SCAN, settings),
            )}
          </div>
        ) : null}

        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">{t("dashboard.keyMetrics", "Key metrics")}</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title={t("dashboard.metricTotalPatients", "Total Patients")}
              value={patientsCount.count || 0}
              description={t("dashboard.metricTotalPatientsDescription", "Registered in system")}
              icon={<Users className="h-4 w-4 text-muted-foreground" />}
            />

            <StatCard
              title={t("dashboard.metricAppointmentsToday", "Today’s Appointments")}
              value={appointmentsToday.count || 0}
              description={t("dashboard.metricAppointmentsTodayDescription", "Scheduled for today")}
              icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
            />

            <StatCard
              title={t("dashboard.metricPendingPrescriptions", "Pending Prescriptions")}
              value={pendingPrescriptions.count || 0}
              description={t("dashboard.metricPendingPrescriptionsDescription", "Awaiting dispensing")}
              icon={<FileText className="h-4 w-4 text-muted-foreground" />}
            />

            {can(rbacUser, "billing.manage") || can(rbacUser, "reports.view") ? (
              <StatCard
                title={t("dashboard.metricRevenue", "Total Revenue")}
                value={formatCurrency(revenue.revenue, settings)}
                description={
                  revenue.revenueTruncated
                    ? t("dashboard.metricRevenueFallbackDescription", "Recent paid-invoice window revenue")
                    : t("dashboard.metricRevenueDescription", "Collected revenue")
                }
                icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
              />
            ) : null}

            {can(rbacUser, "inpatient.manage") ? (
              <StatCard
                title={t("dashboard.metricActiveAdmissions", "Active Admissions")}
                value={activeAdmissions.count || 0}
                description={t("dashboard.metricActiveAdmissionsDescription", "Currently admitted")}
                icon={<Activity className="h-4 w-4 text-muted-foreground" />}
              />
            ) : null}

            {can(rbacUser, "lab.manage") ? (
              <StatCard
                title={t("dashboard.metricPendingLabTests", "Pending Lab Tests")}
                value={pendingLabTests.count || 0}
                description={t("dashboard.metricPendingLabTestsDescription", "Awaiting results")}
                icon={<AlertCircle className="h-4 w-4 text-muted-foreground" />}
              />
            ) : null}
          </div>
        </div>
      </div>
    )
  } catch (error) {
    sectionPerf.fail(error, { query_count: queryTimings.length || 1 })
    throw error
  }
}
