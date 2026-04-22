import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_JSON_HEADERS } from "@/lib/http/headers"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { API_V1_VERSION, type ApiV1BillingInsuranceResponse } from "@/lib/api/v1"

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

type InsuranceBatchRow = {
  id?: string | null
  batch_number?: string | null
  company_id?: string | null
  status?: string | null
  total_amount?: number | string | null
  paid_amount?: number | string | null
  created_at?: string | null
  companies?: { name?: string | null } | null
}

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_v1_billing_insurance",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "billing.manage")
    const parsed = querySchema.safeParse({
      limit: request.nextUrl.searchParams.get("limit") || undefined,
    })
    if (!parsed.success) {
      return apiError(400, "invalid_query", "Invalid query parameters", request)
    }
    const limit = parsed.data.limit ?? 20

    const { data, error } = await supabase
      .from("insurance_billing_batches")
      .select("id, batch_number, company_id, status, total_amount, paid_amount, created_at, companies(name)")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      return apiError(500, "billing_insurance_failed", "Failed to load insurance billing summary", request)
    }

    const rows = (data || []) as InsuranceBatchRow[]
    const totals = {
      total_batches: 0,
      draft_batches: 0,
      submitted_batches: 0,
      paid_batches: 0,
      total_amount: 0,
      paid_amount: 0,
    }
    for (const row of rows) {
      const status = String(row.status || "").toLowerCase()
      const totalAmount = Number(row.total_amount ?? 0)
      const paidAmount = Number(row.paid_amount ?? 0)

      totals.total_batches += 1
      totals.total_amount += totalAmount
      totals.paid_amount += paidAmount
      if (status === "draft") totals.draft_batches += 1
      if (status === "submitted") totals.submitted_batches += 1
      if (status === "paid") totals.paid_batches += 1
    }

    const payload: ApiV1BillingInsuranceResponse = {
      ok: true,
      api: { version: API_V1_VERSION },
      billing_insurance: {
        totals: {
          ...totals,
          outstanding_amount: Math.max(totals.total_amount - totals.paid_amount, 0),
        },
        recent_batches: rows.map((row) => ({
          id: String(row.id || ""),
          batch_number: String(row.batch_number || ""),
          company_id: typeof row.company_id === "string" ? row.company_id : null,
          company_name: row.companies?.name ?? null,
          status: String(row.status || "draft"),
          total_amount: Number(row.total_amount ?? 0),
          paid_amount: Number(row.paid_amount ?? 0),
          created_at: String(row.created_at || ""),
        })),
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
    return apiError(500, "billing_insurance_failed", "Failed to load insurance billing summary", request)
  }
}
