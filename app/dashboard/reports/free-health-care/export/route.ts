import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null
  try {
    const birth = new Date(dob)
    const years = Math.floor((Date.now() - birth.getTime()) / 31557600000)
    return Number.isFinite(years) ? years : null
  } catch {
    return null
  }
}

function ageBand(age: number | null): string {
  if (age == null) return "unknown"
  if (age < 5) return "0-4"
  if (age < 18) return "5-17"
  if (age < 50) return "18-49"
  if (age < 65) return "50-64"
  return "65+"
}

function categoryLabel(cat: string): string {
  switch (cat) {
    case "u5":
      return "Under 5 years"
    case "pregnant":
      return "Pregnant women"
    case "lactating":
      return "Lactating mothers"
    case "none":
    default:
      return "Not FHC"
  }
}

interface FhcExportRow {
  id: string
  created_at: string
  visit_status: string
  is_free_health_care: boolean
  payer_category: string | null
  free_health_category: string
  full_name: string | null
  ageBand: string
  facility_name: string | null
  facility_code: string | null
}

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "report_export_free_health_care",
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "admin.export")

  const { searchParams } = new URL(request.url)
  const fromParam = (searchParams.get("from") || "").trim()
  const toParam = (searchParams.get("to") || "").trim()
  const categoryFilter = (searchParams.get("category") || "all").trim().toLowerCase()
  const statusFilter = (searchParams.get("status") || "all").trim().toLowerCase()
  const facilityFilter = (searchParams.get("facility") || "all").trim()
  const serviceType = (searchParams.get("service_type") || "").trim()

  const toDate = toParam ? new Date(toParam) : new Date()
  const fromDate = fromParam ? new Date(fromParam) : (() => {
    const d = new Date(toDate)
    d.setDate(d.getDate() - 30)
    d.setHours(0, 0, 0, 0)
    return d
  })()

  const fromIso = fromDate.toISOString()
  const toIso = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999).toISOString()

  let visitIdsForServiceType: string[] | null = null
  if (serviceType === "radiology_requests" || serviceType === "lab_tests") {
    const { data: serviceRows } = await supabase
      .from(serviceType)
      .select("visit_id")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
    visitIdsForServiceType = (serviceRows || []).map((r: { visit_id: string | null }) => r.visit_id as string).filter(Boolean)
  }

  const { data, error } = await supabase
    .from("visits")
    .select(
      `id, created_at, visit_status, is_free_health_care, payer_category,
       patients(full_name, date_of_birth, free_health_category),
       facilities(name, code)`
    )
    .eq("is_free_health_care", true)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)

  if (error) {
    console.error("[fhc-export] Error loading FHC visits:", error.message || error)
  }

  const rows: FhcExportRow[] = (data || []).map((row: {
    id: string;
    created_at: string;
    visit_status: string;
    is_free_health_care: boolean;
    payer_category: string | null;
    patients: {
      full_name: string | null;
      date_of_birth: string | null;
      free_health_category: string | null;
    };
    facilities: {
      name: string | null;
      code: string | null;
    };
  }) => {
    const p = row.patients || {}
    const f = row.facilities || {}
    const cat = (p.free_health_category as string | null) ?? "none"
    const dob = (p.date_of_birth as string | null) ?? null
    const age = ageFromDob(dob)
    const band = ageBand(age)

    return {
      id: row.id as string,
      created_at: row.created_at as string,
      visit_status: (row.visit_status as string) || "",
      is_free_health_care: Boolean(row.is_free_health_care),
      payer_category: (row.payer_category as string | null) ?? null,
      free_health_category: cat,
      full_name: (p.full_name as string | null) ?? null,
      ageBand: band,
      facility_name: (f.name as string | null) ?? null,
      facility_code: (f.code as string | null) ?? null,
    }
  }).filter((row: FhcExportRow) => {
    if (categoryFilter !== "all" && row.free_health_category !== categoryFilter) {
      return false
    }

    if (statusFilter !== "all") {
      const status = row.visit_status.toLowerCase()
      if (statusFilter === "completed" && status !== "completed") return false
      if (statusFilter === "admitted" && status !== "admitted") return false
      if (statusFilter === "pending" && (status === "completed" || status === "admitted")) return false
    }

    if (facilityFilter !== "all") {
      const code = (row.facility_code || "").trim()
      if (!code || code !== facilityFilter) return false
    }

    if (visitIdsForServiceType && !visitIdsForServiceType.includes(row.id)) {
      return false
    }

    return true
  })

  const headers = [
    "VisitId",
    "CreatedAt",
    "PatientName",
    "FhcCategory",
    "AgeBand",
    "VisitStatus",
    "PayerCategory",
    "FacilityName",
    "FacilityCode",
  ]

  const lines: string[] = []
  lines.push(headers.join(","))

  for (const row of rows) {
    const record = [
      row.id,
      new Date(row.created_at).toISOString(),
      JSON.stringify(row.full_name ?? ""),
      JSON.stringify(categoryLabel(row.free_health_category)),
      row.ageBand,
      row.visit_status,
      row.payer_category ?? "",
      JSON.stringify(row.facility_name ?? ""),
      JSON.stringify(row.facility_code ?? ""),
    ]

    lines.push(record.join(","))
  }

  const csv = lines.join("\n")

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=fhc_activity_${new Date().toISOString()}.csv`,
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export free health care report", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
