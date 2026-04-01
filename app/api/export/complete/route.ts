import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

const EXPORT_TABLE_LIMIT = 2_000

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_export_complete",
    maxRequests: 5,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "admin.export")

    // Bounded backup export to avoid excessively large responses.
    const [
      { data: patients },
      { data: appointments },
      { data: prescriptions },
      { data: labTests },
      { data: invoices },
      { data: admissions },
      { data: medications },
    ] = await Promise.all([
      supabase.from("patients").select("*").order("id", { ascending: false }).limit(EXPORT_TABLE_LIMIT + 1),
      supabase.from("appointments").select("*").order("id", { ascending: false }).limit(EXPORT_TABLE_LIMIT + 1),
      supabase.from("prescriptions").select("*").order("id", { ascending: false }).limit(EXPORT_TABLE_LIMIT + 1),
      supabase.from("lab_tests").select("*").order("id", { ascending: false }).limit(EXPORT_TABLE_LIMIT + 1),
      supabase.from("invoices").select("*").order("id", { ascending: false }).limit(EXPORT_TABLE_LIMIT + 1),
      supabase.from("admissions").select("*").order("id", { ascending: false }).limit(EXPORT_TABLE_LIMIT + 1),
      supabase.from("medications").select("*").order("id", { ascending: false }).limit(EXPORT_TABLE_LIMIT + 1),
    ])

    const tableRows = {
      patients: (patients || []).slice(0, EXPORT_TABLE_LIMIT),
      appointments: (appointments || []).slice(0, EXPORT_TABLE_LIMIT),
      prescriptions: (prescriptions || []).slice(0, EXPORT_TABLE_LIMIT),
      lab_tests: (labTests || []).slice(0, EXPORT_TABLE_LIMIT),
      invoices: (invoices || []).slice(0, EXPORT_TABLE_LIMIT),
      admissions: (admissions || []).slice(0, EXPORT_TABLE_LIMIT),
      medications: (medications || []).slice(0, EXPORT_TABLE_LIMIT),
    }

    const tableTruncated = {
      patients: (patients || []).length > EXPORT_TABLE_LIMIT,
      appointments: (appointments || []).length > EXPORT_TABLE_LIMIT,
      prescriptions: (prescriptions || []).length > EXPORT_TABLE_LIMIT,
      lab_tests: (labTests || []).length > EXPORT_TABLE_LIMIT,
      invoices: (invoices || []).length > EXPORT_TABLE_LIMIT,
      admissions: (admissions || []).length > EXPORT_TABLE_LIMIT,
      medications: (medications || []).length > EXPORT_TABLE_LIMIT,
    }

    const backup = {
      export_date: new Date().toISOString(),
      version: "1.1",
      row_limit_per_table: EXPORT_TABLE_LIMIT,
      data: tableRows,
      counts: {
        patients: tableRows.patients.length,
        appointments: tableRows.appointments.length,
        prescriptions: tableRows.prescriptions.length,
        lab_tests: tableRows.lab_tests.length,
        invoices: tableRows.invoices.length,
        admissions: tableRows.admissions.length,
        medications: tableRows.medications.length,
      },
      truncated: tableTruncated,
    }

    const isAnyTruncated = Object.values(tableTruncated).some(Boolean)

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=complete_backup_${new Date().toISOString()}.json`,
        "X-Export-Truncated": String(isAnyTruncated),
        "X-Export-Row-Limit": String(EXPORT_TABLE_LIMIT),
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export complete backup", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
