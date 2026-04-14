import { createServerClient } from "@/lib/supabase/server"
import { getGlobalSettings } from "@/lib/global-settings"
import { createTranslator } from "@/lib/i18n"
import { can } from "@/lib/utils"
import { startPageRenderTimer } from "@/lib/observability/page-performance"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Activity, AlertCircle, Pill, TriangleAlert } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import { formatNumber } from "@/lib/locale-format"
import {
  fetchDashboardAlertInputs,
  getSlowestDashboardQuery,
  type DashboardQueryTimingRow,
  type DashboardRbacUser,
} from "@/lib/dashboard/queries"
import { logDashboardQueryTimings } from "@/app/dashboard/_components/dashboard-query-logging"

interface OperationalAlertItem {
  id: string
  title: string
  message: string
  href: string
  cta: string
  tone: "urgent" | "warning"
  icon: ReactNode
}

function OperationalAlertsSection({
  alerts,
  labels,
}: {
  alerts: OperationalAlertItem[]
  labels: { title: string; openNotifications: string }
}) {
  if (alerts.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{labels.title}</h2>
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/notifications">{labels.openNotifications}</Link>
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {alerts.map((alert) => (
          <Card
            key={alert.id}
            className={
              alert.tone === "urgent"
                ? "border-red-200 bg-red-50/60"
                : "border-amber-200 bg-amber-50/60"
            }
          >
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className={alert.tone === "urgent" ? "text-red-700" : "text-amber-700"}>{alert.icon}</div>
                  <CardTitle className="text-base">{alert.title}</CardTitle>
                </div>
              </div>
              <CardDescription className="text-sm text-slate-700">{alert.message}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" variant={alert.tone === "urgent" ? "default" : "outline"}>
                <Link href={alert.href}>{alert.cta}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export async function DashboardAlertsSection({ rbacUser }: { rbacUser: DashboardRbacUser }) {
  const sectionPerf = startPageRenderTimer("dashboard.home.alerts", { slowThresholdMs: 1200 })
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()
  const t = createTranslator(settings.language)
  const queryTimings: DashboardQueryTimingRow[] = []

  try {
    const {
      pendingLabCount,
      pendingRadiologyCount,
      overdueInvoiceCount,
      expiringDrugsCount,
      unbilledVisitsCount,
      pendingDischargesCount,
      consistencyVisitsWithoutBilling,
      consistencyPrescriptionsWithoutDispense,
      consistencyInsuranceBatchesWithoutTotals,
      lowStockItems,
      source,
    } =
      await fetchDashboardAlertInputs(supabase, rbacUser, queryTimings)

    const operationalAlerts: OperationalAlertItem[] = []

    if (lowStockItems.length > 0) {
      const leadMedication = lowStockItems[0]?.medications?.name || "Medication stock"
      operationalAlerts.push({
        id: "low-stock",
        title: t("dashboard.alertsLowStockTitle", "Low stock needs reorder review"),
        message:
          lowStockItems.length === 1
            ? t("dashboard.alertsLowStockSingle", "{name} is at or below reorder level in the current stock snapshot.").replace("{name}", leadMedication)
            : t("dashboard.alertsLowStockMultiple", "{count} medicines in the current stock snapshot are at or below reorder level.").replace("{count}", formatNumber(lowStockItems.length, settings)),
        href: "/dashboard/pharmacy?stock_filter=low",
        cta: t("common.reviewStock", "Review stock"),
        tone: "warning",
        icon: <Pill className="h-4 w-4" />,
      })
    }

    if (pendingLabCount > 0 && can(rbacUser, "lab.manage")) {
      operationalAlerts.push({
        id: "pending-lab",
        title: t("dashboard.alertsPendingLabTitle", "Pending lab backlog"),
        message: t("dashboard.alertsPendingLabMessage", "{count} lab tests are still awaiting completion.").replace(
          "{count}",
          formatNumber(pendingLabCount, settings),
        ),
        href: "/dashboard/lab?status=pending",
        cta: t("common.openLabQueue", "Open lab queue"),
        tone: pendingLabCount >= 10 ? "urgent" : "warning",
        icon: <AlertCircle className="h-4 w-4" />,
      })
    }

    if (pendingRadiologyCount > 0 && can(rbacUser, "lab.manage")) {
      operationalAlerts.push({
        id: "pending-radiology",
        title: t("dashboard.alertsPendingRadiologyTitle", "Radiology queue requires review"),
        message: t("dashboard.alertsPendingRadiologyMessage", "{count} radiology requests are pending or scheduled.").replace(
          "{count}",
          formatNumber(pendingRadiologyCount, settings),
        ),
        href: "/dashboard/radiology",
        cta: t("common.openRadiology", "Open radiology"),
        tone: pendingRadiologyCount >= 10 ? "urgent" : "warning",
        icon: <Activity className="h-4 w-4" />,
      })
    }

    if (overdueInvoiceCount > 0 && (can(rbacUser, "billing.manage") || can(rbacUser, "reports.view"))) {
      operationalAlerts.push({
        id: "outstanding-billing",
        title: t("dashboard.alertsOutstandingInvoicesTitle", "Outstanding invoices need follow-up"),
        message: t("dashboard.alertsOutstandingInvoicesMessage", "{count} invoices still have an unpaid balance and need billing follow-up.").replace(
          "{count}",
          formatNumber(overdueInvoiceCount, settings),
        ),
        href: "/dashboard/billing",
        cta: t("common.reviewInvoices", "Review invoices"),
        tone: overdueInvoiceCount >= 10 ? "urgent" : "warning",
        icon: <TriangleAlert className="h-4 w-4" />,
      })
    }

    if (expiringDrugsCount > 0 && can(rbacUser, "pharmacy.manage")) {
      operationalAlerts.push({
        id: "expiring-drugs",
        title: t("dashboard.alertsExpiringDrugsTitle", "Expiring stock needs review"),
        message: t("dashboard.alertsExpiringDrugsMessage", "{count} stocked medicines expire within the next 30 days.").replace(
          "{count}",
          formatNumber(expiringDrugsCount, settings),
        ),
        href: "/dashboard/pharmacy?stock_filter=expiring_soon",
        cta: t("common.reviewStock", "Review stock"),
        tone: expiringDrugsCount >= 10 ? "urgent" : "warning",
        icon: <Pill className="h-4 w-4" />,
      })
    }

    if (unbilledVisitsCount > 0 && can(rbacUser, "billing.manage")) {
      operationalAlerts.push({
        id: "unbilled-visits",
        title: t("dashboard.alertsUnbilledVisitsTitle", "Unbilled visits need billing review"),
        message: t("dashboard.alertsUnbilledVisitsMessage", "{count} visits are waiting for billing without an invoice recorded yet.").replace(
          "{count}",
          formatNumber(unbilledVisitsCount, settings),
        ),
        href: "/dashboard/billing",
        cta: t("common.reviewInvoices", "Review billing"),
        tone: unbilledVisitsCount >= 5 ? "urgent" : "warning",
        icon: <TriangleAlert className="h-4 w-4" />,
      })
    }

    if (consistencyVisitsWithoutBilling > 0 && can(rbacUser, "billing.manage")) {
      operationalAlerts.push({
        id: "consistency-unbilled-visits",
        title: t("dashboard.alertsConsistencyUnbilledTitle", "Visit-billing consistency check failed"),
        message: t("dashboard.alertsConsistencyUnbilledMessage", "{count} billing-pending visits still have no invoice record.").replace(
          "{count}",
          formatNumber(consistencyVisitsWithoutBilling, settings),
        ),
        href: "/dashboard/billing",
        cta: t("common.reviewBilling", "Review billing"),
        tone: "urgent",
        icon: <TriangleAlert className="h-4 w-4" />,
      })
    }

    if (consistencyPrescriptionsWithoutDispense > 0 && can(rbacUser, "pharmacy.manage")) {
      operationalAlerts.push({
        id: "consistency-undispensed-prescriptions",
        title: t("dashboard.alertsConsistencyRxTitle", "Prescription dispense queue has unresolved items"),
        message: t("dashboard.alertsConsistencyRxMessage", "{count} prescriptions are still pending dispense confirmation.").replace(
          "{count}",
          formatNumber(consistencyPrescriptionsWithoutDispense, settings),
        ),
        href: "/dashboard/pharmacy",
        cta: t("common.openPharmacy", "Open pharmacy"),
        tone: consistencyPrescriptionsWithoutDispense >= 10 ? "urgent" : "warning",
        icon: <Pill className="h-4 w-4" />,
      })
    }

    if (consistencyInsuranceBatchesWithoutTotals > 0 && can(rbacUser, "billing.manage")) {
      operationalAlerts.push({
        id: "consistency-batches-without-totals",
        title: t("dashboard.alertsConsistencyBatchTitle", "Insurance batches with invalid totals"),
        message: t("dashboard.alertsConsistencyBatchMessage", "{count} insurance batches have zero or mismatched totals and need reconciliation.").replace(
          "{count}",
          formatNumber(consistencyInsuranceBatchesWithoutTotals, settings),
        ),
        href: "/dashboard/billing/insurance/reconciliation",
        cta: t("common.openReconciliation", "Open reconciliation"),
        tone: "urgent",
        icon: <TriangleAlert className="h-4 w-4" />,
      })
    }

    if (pendingDischargesCount > 0 && can(rbacUser, "inpatient.manage")) {
      operationalAlerts.push({
        id: "pending-discharges",
        title: t("dashboard.alertsPendingDischargesTitle", "Discharge planning is still open"),
        message: t("dashboard.alertsPendingDischargesMessage", "{count} admissions are still open and may need discharge planning or review.").replace(
          "{count}",
          formatNumber(pendingDischargesCount, settings),
        ),
        href: "/dashboard/inpatient",
        cta: t("common.reviewAdmissions", "Review admissions"),
        tone: pendingDischargesCount >= 10 ? "urgent" : "warning",
        icon: <Activity className="h-4 w-4" />,
      })
    }

    logDashboardQueryTimings(queryTimings)
    const slowest = getSlowestDashboardQuery(queryTimings)
    sectionPerf.done({
      query_count: queryTimings.length,
      slowest_query: slowest?.label || null,
      slowest_query_ms: slowest?.durationMs ?? 0,
      alerts_count: operationalAlerts.length,
      source,
    })

    return (
      <OperationalAlertsSection
        alerts={operationalAlerts}
        labels={{
          title: t("dashboard.alertsTitle", "Operational alerts"),
          openNotifications: t("common.openNotifications", "Open notifications"),
        }}
      />
    )
  } catch (error) {
    sectionPerf.fail(error, { query_count: queryTimings.length || 1 })
    throw error
  }
}
