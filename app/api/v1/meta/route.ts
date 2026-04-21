import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import {
  API_V1_CAPABILITIES,
  API_V1_RELEASE_CHANNEL,
  API_V1_VERSION,
  type ApiV1MetaResponse,
} from "@/lib/api/v1"

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_v1_meta",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    await requirePermission(request, "reports.view")

    const payload: ApiV1MetaResponse = {
      ok: true,
      api: {
        version: API_V1_VERSION,
        release_channel: API_V1_RELEASE_CHANNEL,
        capabilities: API_V1_CAPABILITIES,
      },
      app: {
        name: "HealthNet HMS",
        platforms: ["web", "mobile", "desktop"],
      },
      server_time_utc: new Date().toISOString(),
    }

    return NextResponse.json(payload, { status: 200 })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    console.error("[v0] Failed to serve API v1 metadata", error)
    return apiError(500, "internal_error", "Internal Server Error", request)
  }
}

