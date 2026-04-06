"use client"

import { DashboardRouteError } from "@/components/dashboard-route-error"

export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <DashboardRouteError
      error={error}
      reset={reset}
      title="Reports could not finish loading"
      description="The selected analytics or report aggregates failed to load. Retry this page or return to the dashboard and narrow the report range if needed."
      primaryHref="/dashboard"
      primaryLabel="Back to dashboard"
      secondaryHref="/dashboard/reports/company-billing"
      secondaryLabel="Open company billing"
    />
  )
}
