import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_export_lab_tests",
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "admin.export")

  const { data: labTests, error } = await supabase
    .from("lab_tests")
    .select(`
      *,
      patient:patients(patient_number, first_name, last_name),
      ordered_by:profiles!lab_tests_ordered_by_fkey(first_name, last_name)
    `)
    .order("created_at", { ascending: false })

  if (error) {
    return new NextResponse("Error fetching data", { status: 500 })
  }

  const headers = [
    "Test ID",
    "Patient Number",
    "Patient Name",
    "Test Type",
    "Test Name",
    "Status",
    "Priority",
    "Ordered By",
    "Results",
    "Interpretation",
    "Completed At",
    "Created At",
  ]

  const csvRows = [headers.join(",")]

  for (const test of labTests) {
    const row = [
      test.id,
      test.patient?.patient_number || "",
      `${test.patient?.first_name || ""} ${test.patient?.last_name || ""}`,
      test.test_type,
      test.test_name,
      test.status,
      test.priority,
      `${test.ordered_by?.first_name || ""} ${test.ordered_by?.last_name || ""}`,
      `"${test.results || ""}"`,
      `"${test.interpretation || ""}"`,
      test.completed_at || "",
      new Date(test.created_at).toISOString(),
    ]
    csvRows.push(row.join(","))
  }

  const csv = csvRows.join("\n")

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=lab_tests_export_${new Date().toISOString()}.csv`,
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export lab tests", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
