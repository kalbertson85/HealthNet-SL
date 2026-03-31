import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "report_export_free_health_care_facility_cost",
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "admin.export")

  const { searchParams } = new URL(request.url)
  const fromParam = (searchParams.get("from") || "").trim()
  const toParam = (searchParams.get("to") || "").trim()

  const toDate = toParam ? new Date(toParam) : new Date()
  const fromDate = fromParam
    ? new Date(fromParam)
    : (() => {
        const d = new Date(toDate)
        d.setDate(d.getDate() - 30)
        d.setHours(0, 0, 0, 0)
        return d
      })()

  const fromIso = fromDate.toISOString()
  const toIso = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999).toISOString()

  const { data, error } = await supabase
    .from("invoice_items")
    .select(
      `quantity, unit_price, item_type,
       invoices(created_at, visit_id,
         visits(is_free_health_care, facility_id,
           facilities(name, code)
         )
       )`,
    )
    .gte("invoices.created_at", fromIso)
    .lte("invoices.created_at", toIso)

  if (error) {
    console.error("[fhc-facility-cost-export] Error loading invoice items:", error.message || error)
  }

  type Row = {
    quantity: number | null
    unit_price: number | null
    item_type: string | null
    invoices: {
      visit_id: string | null
      visits: {
        is_free_health_care: boolean | null
        facility_id: string | null
        facilities: {
          name: string | null
          code: string | null
        } | null
      } | null
    } | null
  }

  const fhcCostByFacility = new Map<string, { name: string; code: string | null; amount: number }>()

  for (const row of (data || []) as Row[]) {
    const inv = row.invoices
    const visit = inv?.visits
    if (!visit?.is_free_health_care) continue

    const itemType = (row.item_type || "").toLowerCase()
    if (itemType !== "fhc_covered") continue

    const qty = Number(row.quantity ?? 0)
    const unit = Number(row.unit_price ?? 0)
    if (!Number.isFinite(qty) || !Number.isFinite(unit)) continue

    const amount = qty * unit

    const facilityId = visit.facility_id ?? "(none)"
    const facilityName = visit.facilities?.name ?? "Unknown facility"
    const facilityCode = visit.facilities?.code ?? null

    const existing = fhcCostByFacility.get(facilityId) || { name: facilityName, code: facilityCode, amount: 0 }
    existing.amount += amount
    fhcCostByFacility.set(facilityId, existing)
  }

  const headers = ["FacilityName", "FacilityCode", "FhcEconomicCostLe"]

  const lines: string[] = []
  lines.push(headers.join(","))

  for (const [, entry] of fhcCostByFacility.entries()) {
    const record = [
      JSON.stringify(entry.name ?? ""),
      JSON.stringify(entry.code ?? ""),
      entry.amount.toString(),
    ]

    lines.push(record.join(","))
  }

  const csv = lines.join("\n")

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=fhc_facility_economic_cost_${new Date().toISOString()}.csv`,
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export facility FHC costs", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
