"use client"

import * as Sentry from "@sentry/nextjs"
import Link from "next/link"
import { useEffect } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function DashboardRouteError({
  error,
  reset,
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref = "/dashboard",
  secondaryLabel = "Back to dashboard",
}: {
  error: Error & { digest?: string }
  reset: () => void
  title: string
  description: string
  primaryHref: string
  primaryLabel: string
  secondaryHref?: string
  secondaryLabel?: string
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-2xl border-amber-200 bg-amber-50/40">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-medium">Page error</span>
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="text-sm text-slate-700">{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error.digest ? (
            <div className="rounded-md border border-amber-200 bg-white px-3 py-2 text-xs text-slate-600">
              Reference: {error.digest}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link href={primaryHref}>{primaryLabel}</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={secondaryHref}>{secondaryLabel}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
