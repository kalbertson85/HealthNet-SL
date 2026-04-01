"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <main className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-lg border bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-600">
              The error has been captured. Try again, and contact support if this keeps happening.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="mt-4 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
