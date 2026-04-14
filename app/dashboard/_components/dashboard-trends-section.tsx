import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { can } from "@/lib/utils"
import { startPageRenderTimer } from "@/lib/observability/page-performance"
import {
  fetchDashboardTrendInputs,
  getSlowestDashboardQuery,
  MAX_TREND_ROW_SCAN,
  type DashboardQueryTimingRow,
  type DashboardRbacUser,
} from "@/lib/dashboard/queries"
import { getGlobalSettings } from "@/lib/global-settings"
import { createTranslator } from "@/lib/i18n"
import { formatNumber } from "@/lib/locale-format"
import { logDashboardQueryTimings } from "@/app/dashboard/_components/dashboard-query-logging"

interface TrendPoint {
  label: string
  value: number
}

function MiniTrendCard({
  title,
  description,
  points,
}: {
  title: string
  description: string
  points: TrendPoint[]
}) {
  const maxValue = Math.max(...points.map((point) => point.value), 1)
  const total = points.reduce((sum, point) => sum + point.value, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-3xl font-bold">{total}</div>
        <div className="flex items-end gap-3">
          {points.map((point) => (
            <div key={point.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-28 w-full items-end rounded-md bg-muted/40 px-1 py-1">
                <div
                  className="w-full rounded-sm bg-primary/85 transition-all"
                  style={{ height: `${Math.max(8, Math.round((point.value / maxValue) * 100))}%` }}
                  aria-label={`${point.label}: ${point.value}`}
                  title={`${point.label}: ${point.value}`}
                />
              </div>
              <div className="text-center">
                <p className="text-xs font-medium">{point.value}</p>
                <p className="text-[11px] text-muted-foreground">{point.label}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function formatDayLabel(date: Date, locale: string, timezone: string) {
  return new Intl.DateTimeFormat(locale, { timeZone: timezone, weekday: "short" }).format(date)
}

function buildSevenDayWindow(today: Date, locale: string, timezone: string) {
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - index))
    const iso = date.toISOString().split("T")[0]
    return { iso, label: formatDayLabel(date, locale, timezone) }
  })
}

function aggregateTrendByKey(
  windowDays: Array<{ iso: string; label: string }>,
  rows: Array<{ key: string | null | undefined; value?: number | null }>,
) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.key) continue
    counts.set(row.key, (counts.get(row.key) || 0) + Number(row.value ?? 1))
  }

  return windowDays.map((day) => ({
    label: day.label,
    value: counts.get(day.iso) || 0,
  }))
}

export async function DashboardTrendsSection({ rbacUser, todayIsoDate }: { rbacUser: DashboardRbacUser; todayIsoDate: string }) {
  const sectionPerf = startPageRenderTimer("dashboard.home.trends", { slowThresholdMs: 1500 })
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()
  const t = createTranslator(settings.language)
  const queryTimings: DashboardQueryTimingRow[] = []

  try {
    const today = new Date(`${todayIsoDate}T12:00:00.000Z`)
    const trendWindow = buildSevenDayWindow(today, settings.locale, settings.timezone)
    const trendStartDate = trendWindow[0]?.iso || todayIsoDate

    const { patientTrendRows, appointmentTrendRows, revenueTrendRows, source, trendDataTruncated } = await fetchDashboardTrendInputs(
      supabase,
      rbacUser,
      trendStartDate,
      queryTimings,
    )

    const patientTrend = aggregateTrendByKey(
      trendWindow,
      (patientTrendRows.data || []).map((row) => ({
        key: row.created_at?.split("T")[0],
        value: Number(row.value ?? 1),
      })),
    )

    const appointmentTrend = aggregateTrendByKey(
      trendWindow,
      (appointmentTrendRows.data || []).map((row) => ({
        key: row.appointment_date,
        value: Number(row.value ?? 1),
      })),
    )

    const revenueTrend = aggregateTrendByKey(
      trendWindow,
      (revenueTrendRows.data || []).map((row) => ({
        key: row.payment_date ? row.payment_date.split("T")[0] : null,
        value: Number(row.paid_amount || 0),
      })),
    )

    logDashboardQueryTimings(queryTimings)
    const slowest = getSlowestDashboardQuery(queryTimings)
    sectionPerf.done({
      query_count: queryTimings.length,
      slowest_query: slowest?.label || null,
      slowest_query_ms: slowest?.durationMs ?? 0,
      trend_truncated: trendDataTruncated,
      source,
    })

    return (
      <div className="space-y-4">
        {trendDataTruncated ? (
          <div className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t("dashboard.trendsNotice", "Trend charts are computed from the latest {count} matching records per metric for faster dashboard loads.").replace(
              "{count}",
              formatNumber(MAX_TREND_ROW_SCAN, settings),
            )}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("dashboard.trendsTitle", "7-day trends")}</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MiniTrendCard
            title={t("dashboard.trendPatientsTitle", "Patient registrations")}
            description={t("dashboard.trendPatientsDescription", "New patients added over the last 7 days")}
            points={patientTrend}
          />
          <MiniTrendCard
            title={t("dashboard.trendAppointmentsTitle", "Appointments")}
            description={t("dashboard.trendAppointmentsDescription", "Scheduled appointments over the last 7 days")}
            points={appointmentTrend}
          />
          {can(rbacUser, "billing.manage") || can(rbacUser, "reports.view") ? (
            <MiniTrendCard
              title={t("dashboard.trendRevenueTitle", "Paid revenue")}
              description={t("dashboard.trendRevenueDescription", "Paid invoice totals over the last 7 days")}
              points={revenueTrend}
            />
          ) : null}
        </div>
      </div>
    )
  } catch (error) {
    sectionPerf.fail(error, { query_count: queryTimings.length || 1 })
    throw error
  }
}
