import { NextResponse, type NextRequest } from "next/server"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { API_V1_VERSION, type ApiV1PharmacySummaryResponse } from "@/lib/api/v1"

const MS_PER_DAY = 86_400_000

function toDayDiff(dateRaw: string | null | undefined, now: Date) {
  if (!dateRaw) return null
  const parsed = new Date(dateRaw)
  if (Number.isNaN(parsed.getTime())) return null
  return Math.ceil((parsed.getTime() - now.getTime()) / MS_PER_DAY)
}

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_v1_pharmacy_summary",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "pharmacy.manage")

    const [{ count: pendingPrescriptionsCount }, { data: stockRows, error: stockError }] = await Promise.all([
      supabase.from("prescriptions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("medication_stock").select("quantity_on_hand, reorder_level, expiry_date").limit(5000),
    ])

    if (stockError) {
      return apiError(500, "pharmacy_summary_failed", "Failed to load pharmacy summary", request)
    }

    const now = new Date()
    const stock = (stockRows || []) as Array<{
      quantity_on_hand?: number | null
      reorder_level?: number | null
      expiry_date?: string | null
    }>

    const aggregate = stock.reduce(
      (acc, row) => {
        const qty = Number(row.quantity_on_hand || 0)
        const reorder = Number(row.reorder_level || 0)
        if (reorder > 0 && qty <= reorder) {
          acc.low_stock_items += 1
        }

        const dayDiff = toDayDiff(row.expiry_date, now)
        if (dayDiff === null) return acc
        if (dayDiff < 0) acc.expired_items += 1
        else if (dayDiff <= 30) acc.expiring_soon_items += 1
        return acc
      },
      {
        low_stock_items: 0,
        expiring_soon_items: 0,
        expired_items: 0,
      },
    )

    const payload: ApiV1PharmacySummaryResponse = {
      ok: true,
      api: { version: API_V1_VERSION },
      pharmacy: {
        pending_prescriptions: Number(pendingPrescriptionsCount || 0),
        low_stock_items: aggregate.low_stock_items,
        expiring_soon_items: aggregate.expiring_soon_items,
        expired_items: aggregate.expired_items,
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
    return apiError(500, "pharmacy_summary_failed", "Failed to load pharmacy summary", request)
  }
}
