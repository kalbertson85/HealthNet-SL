"use client"

import { DashboardRouteError } from "@/components/dashboard-route-error"

export default function BillingInvoiceDetailError({
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
      title="Invoice detail could not finish loading"
      description="The invoice page failed while loading billing details. Retry this page or return to the billing list and reopen the invoice."
      primaryHref="/dashboard/billing"
      primaryLabel="Back to billing"
    />
  )
}
