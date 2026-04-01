import * as Sentry from "@sentry/nextjs"

function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "",
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || "0"),
    sendDefaultPii: false,
  })
}

export function register() {
  initSentry()
}

export const onRequestError = Sentry.captureRequestError
