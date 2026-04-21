import { NextResponse, type NextRequest } from "next/server"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { API_V1_VERSION, type ApiV1DashboardSummaryResponse } from "@/lib/api/v1"

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_v1_dashboard_summary",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "dashboard.view")

    const [{ count: patientsTotal }, { count: visitsActive }, { data: invoicesRows, error: invoicesError }] =
      await Promise.all([
        supabase.from("patients").select("id", { count: "exact", head: true }),
        supabase
          .from("visits")
          .select("id", { count: "exact", head: true })
          .not("visit_status", "in", "(completed,discharged)"),
        supabase
          .from("invoices")
          .select("id, total_amount, paid_amount")
          .limit(5000),
      ])

    if (invoicesError) {
      return apiError(500, "dashboard_summary_failed", "Failed to load dashboard summary", request)
    }

    const invoiceRows = (invoicesRows || []) as Array<{ total_amount?: number | null; paid_amount?: number | null }>
    const open = invoiceRows.reduce(
      (acc, row) => {
        const total = Number(row.total_amount || 0)
        const paid = Number(row.paid_amount || 0)
        const balance = Math.max(total - paid, 0)
        if (balance > 0) {
          acc.count += 1
          acc.balance += balance
        }
        return acc
      },
      { count: 0, balance: 0 },
    )

    const payload: ApiV1DashboardSummaryResponse = {
      ok: true,
      api: { version: API_V1_VERSION },
      dashboard: {
        patients_total: Number(patientsTotal || 0),
        visits_active: Number(visitsActive || 0),
        invoices_open: open.count,
        invoices_open_balance: open.balance,
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
    return apiError(500, "dashboard_summary_failed", "Failed to load dashboard summary", request)
  }
}

