import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_export_complete",
    maxRequests: 5,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "admin.export")

  // Fetch all data
  const [
    { data: patients },
    { data: appointments },
    { data: prescriptions },
    { data: labTests },
    { data: invoices },
    { data: admissions },
    { data: medications },
  ] = await Promise.all([
    supabase.from("patients").select("*"),
    supabase.from("appointments").select("*"),
    supabase.from("prescriptions").select("*"),
    supabase.from("lab_tests").select("*"),
    supabase.from("invoices").select("*"),
    supabase.from("admissions").select("*"),
    supabase.from("medications").select("*"),
  ])

  const backup = {
    export_date: new Date().toISOString(),
    version: "1.0",
    data: {
      patients: patients || [],
      appointments: appointments || [],
      prescriptions: prescriptions || [],
      lab_tests: labTests || [],
      invoices: invoices || [],
      admissions: admissions || [],
      medications: medications || [],
    },
    counts: {
      patients: patients?.length || 0,
      appointments: appointments?.length || 0,
      prescriptions: prescriptions?.length || 0,
      lab_tests: labTests?.length || 0,
      invoices: invoices?.length || 0,
      admissions: admissions?.length || 0,
      medications: medications?.length || 0,
    },
  }

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=complete_backup_${new Date().toISOString()}.json`,
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export complete backup", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
