import * as Sentry from "@sentry/nextjs"

interface PagePerfOptions {
  slowThresholdMs?: number
}

interface PagePerfDoneMeta {
  row_count?: number
  query_count?: number
  [key: string]: string | number | boolean | null | undefined
}

interface PagePerfTimer {
  done: (meta?: PagePerfDoneMeta) => void
  fail: (error: unknown, meta?: PagePerfDoneMeta) => void
}

function hasSentryDsn(): boolean {
  return Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)
}

function isNextControlFlowError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const digest = "digest" in error ? String((error as { digest?: unknown }).digest || "") : ""
  return digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND")
}

export function startPageRenderTimer(page: string, options: PagePerfOptions = {}): PagePerfTimer {
  const startedAt = Date.now()
  const slowThresholdMs = options.slowThresholdMs ?? 1200

  return {
    done(meta = {}) {
      const durationMs = Math.max(0, Date.now() - startedAt)
      const level = durationMs >= slowThresholdMs ? "warn" : "info"
      const payload = { page, duration_ms: durationMs, ...meta }
      if (level === "warn") {
        console.warn("[page]", payload)
        if (hasSentryDsn()) {
          Sentry.addBreadcrumb({
            category: "page.render.slow",
            level: "warning",
            data: payload,
            message: `Slow render: ${page}`,
          })
        }
      } else {
        console.info("[page]", payload)
      }
    },
    fail(error: unknown, meta = {}) {
      if (isNextControlFlowError(error)) return
      const durationMs = Math.max(0, Date.now() - startedAt)
      const payload = {
        page,
        duration_ms: durationMs,
        error_message: error instanceof Error ? error.message : "unknown_error",
        ...meta,
      }
      console.error("[page]", payload)
      if (hasSentryDsn()) {
        Sentry.withScope((scope) => {
          scope.setTag("page", page)
          scope.setContext("page_render", payload)
          scope.setLevel("error")
          Sentry.captureException(error instanceof Error ? error : new Error(`page_render_failed:${page}`))
        })
      }
    },
  }
}
