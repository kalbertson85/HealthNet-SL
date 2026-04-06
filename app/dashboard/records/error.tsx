"use client"

import { DashboardRouteError } from "@/components/dashboard-route-error"

export default function RecordsError({
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
      title="Records workspace could not finish loading"
      description="Patient search or visit handoff data failed to load. Retry this page or return to the dashboard and reopen the records module."
      primaryHref="/dashboard"
      primaryLabel="Back to dashboard"
      secondaryHref="/dashboard/patients"
      secondaryLabel="Open patients"
    />
  )
}
