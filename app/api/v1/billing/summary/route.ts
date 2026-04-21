import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { API_V1_VERSION, type ApiV1BillingSummaryResponse } from "@/lib/api/v1"

const querySchema = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  payer_type: z.enum(["all", "patient", "company"]).optional(),
})

function parseDayRange(fromRaw?: string, toRaw?: string) {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999))

  const from = fromRaw ? new Date(`${fromRaw}T00:00:00Z`) : monthStart
  const to = toRaw ? new Date(`${toRaw}T23:59:59.999Z`) : monthEnd

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from.getTime() > to.getTime()) {
    return null
  }

  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    fromDay: from.toISOString().slice(0, 10),
    toDay: to.toISOString().slice(0, 10),
  }
}

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_v1_billing_summary",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "billing.manage")
    const parsed = querySchema.safeParse({
      from: request.nextUrl.searchParams.get("from") || undefined,
      to: request.nextUrl.searchParams.get("to") || undefined,
      payer_type: (request.nextUrl.searchParams.get("payer_type") || "all") as "all" | "patient" | "company",
    })
    if (!parsed.success) {
      return apiError(400, "invalid_query", "Invalid query parameters", request)
    }

    const range = parseDayRange(parsed.data.from, parsed.data.to)
    if (!range) {
      return apiError(400, "invalid_range", "Invalid date range", request)
    }

    let query = supabase
      .from("invoices")
      .select("id, total_amount, paid_amount")
      .gte("created_at", range.fromIso)
      .lte("created_at", range.toIso)

    if (parsed.data.payer_type && parsed.data.payer_type !== "all") {
      query = query.eq("payer_type", parsed.data.payer_type)
    }

    const { data: invoices, error } = await query.limit(5000)
    if (error) {
      return apiError(500, "billing_summary_failed", "Failed to load billing summary", request)
    }

    const rows = (invoices || []) as Array<{ total_amount?: number | null; paid_amount?: number | null }>
    const totals = rows.reduce<{
      invoice_count: number
      total_amount: number
      paid_amount: number
      outstanding_balance: number
      open_invoice_count: number
    }>(
      (acc, row) => {
        const total = Number(row.total_amount || 0)
        const paid = Number(row.paid_amount || 0)
        const balance = Math.max(total - paid, 0)
        acc.invoice_count += 1
        acc.total_amount += total
        acc.paid_amount += paid
        acc.outstanding_balance += balance
        if (balance > 0) acc.open_invoice_count += 1
        return acc
      },
      {
        invoice_count: 0,
        total_amount: 0,
        paid_amount: 0,
        outstanding_balance: 0,
        open_invoice_count: 0,
      },
    )

    const payload: ApiV1BillingSummaryResponse = {
      ok: true,
      api: { version: API_V1_VERSION },
      range: {
        from: range.fromDay,
        to: range.toDay,
      },
      billing: totals,
      server_time_utc: new Date().toISOString(),
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_JSON_HEADERS,
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    return apiError(500, "billing_summary_failed", "Failed to load billing summary", request)
  }
}
