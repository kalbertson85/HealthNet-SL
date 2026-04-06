"use client"

import { DashboardRouteError } from "@/components/dashboard-route-error"

export default function DashboardError({
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
      title="Dashboard could not finish loading"
      description="Some dashboard data failed to load. You can retry this page or move to another module while the issue is investigated."
      primaryHref="/dashboard/reports"
      primaryLabel="Open reports"
    />
  )
}
