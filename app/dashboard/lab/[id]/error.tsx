"use client"

import { DashboardRouteError } from "@/components/dashboard-route-error"

export default function LabTestDetailError({
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
      title="Lab test detail could not finish loading"
      description="The lab detail page failed while loading results or workflow context. Retry this page or return to the lab queue and reopen the test."
      primaryHref="/dashboard/lab"
      primaryLabel="Back to lab"
    />
  )
}
