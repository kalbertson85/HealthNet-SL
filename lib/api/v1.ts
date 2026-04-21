export const API_V1_VERSION = "v1"
export const API_V1_RELEASE_CHANNEL = "beta"

export const API_V1_CAPABILITIES = [
  "auth.session",
  "patients.workflow",
  "billing.insurance",
  "reports.company_billing",
  "audit.trail",
] as const

export type ApiV1MetaResponse = {
  ok: true
  api: {
    version: typeof API_V1_VERSION
    release_channel: typeof API_V1_RELEASE_CHANNEL
    capabilities: readonly string[]
  }
  app: {
    name: string
    platforms: string[]
  }
  server_time_utc: string
}

