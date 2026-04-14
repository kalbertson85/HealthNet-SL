import { NextRequest, NextResponse } from "next/server"
import { ROLES } from "@/lib/utils"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"
import { requireRole, resolveAuthError } from "@/lib/auth-guard"
import { fetchDataConsistencyCounts } from "@/lib/data-consistency"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_admin_data_consistency",
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requireRole([ROLES.ADMIN])
    const counts = await fetchDataConsistencyCounts(supabase as unknown as Parameters<typeof fetchDataConsistencyCounts>[0])
    return NextResponse.json(
      {
        ok: true,
        counts,
        generated_at: new Date().toISOString(),
      },
      {
        status: 200,
        headers: NO_STORE_JSON_HEADERS,
      },
    )
  } catch (error) {
    const authResponse = resolveAuthError(error, request, apiError)
    if (authResponse) return authResponse
    return apiError(500, "data_consistency_failed", "Failed to load data consistency metrics", request)
  }
}
