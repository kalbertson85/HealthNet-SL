import { NextResponse, type NextRequest } from "next/server"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { can, type PermissionKey } from "@/lib/utils"
import { API_V1_VERSION, type ApiV1SessionResponse } from "@/lib/api/v1"

const PERMISSION_KEYS: PermissionKey[] = [
  "dashboard.view",
  "patients.view",
  "patients.edit",
  "patients.create",
  "appointments.manage",
  "emergency.manage",
  "queue.manage",
  "prescriptions.manage",
  "lab.manage",
  "pharmacy.manage",
  "inpatient.manage",
  "billing.manage",
  "notifications.manage",
  "reports.view",
  "admin.export",
  "admin.settings.manage",
]

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_v1_session",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { user } = await requirePermission(request, "dashboard.view")
    if (!user?.id) {
      return apiError(401, "unauthorized", "Unauthorized", request)
    }

    const payload: ApiV1SessionResponse = {
      ok: true,
      api: { version: API_V1_VERSION },
      session: {
        user_id: user.id,
        role: user.role ?? null,
        facility_id: user.facility_id ?? null,
        permissions: PERMISSION_KEYS.filter((permission) => can(user, permission)),
      },
      server_time_utc: new Date().toISOString(),
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_JSON_HEADERS,
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    return apiError(500, "internal_error", "Internal Server Error", request)
  }
}

