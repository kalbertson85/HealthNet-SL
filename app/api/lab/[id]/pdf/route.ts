import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_lab_pdf",
    maxRequests: 60,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    // Enforce that only lab staff (and admins) can export lab results
    const { supabase } = await requirePermission(request, "lab.manage")

    const { id } = await context.params

    const { data: labTest, error } = await supabase
      .from("lab_tests")
      .select(`*, patients(full_name, patient_number, date_of_birth, phone_number)`)
      .eq("id", id)
      .maybeSingle()

    if (error || !labTest) {
      return new NextResponse("Lab test not found", { status: 404 })
    }

    const createdAt = labTest.created_at ? new Date(labTest.created_at).toLocaleString() : ""
    const resultsDate = labTest.results_entered_at
      ? new Date(labTest.results_entered_at).toLocaleString()
      : ""

    const lines = [
      "LAB RESULT",
      "",
      `Test #: ${labTest.test_number ?? ""}`,
      `Test Type: ${labTest.test_type ?? ""}`,
      `Category: ${labTest.test_category ?? ""}`,
      `Priority: ${labTest.priority ?? ""}`,
      "",
      `Patient: ${labTest.patients?.full_name ?? ""}`,
      `Patient Number: ${labTest.patients?.patient_number ?? ""}`,
      labTest.patients?.date_of_birth ? `Date of Birth: ${labTest.patients.date_of_birth}` : "",
      labTest.patients?.phone_number ? `Phone: ${labTest.patients.phone_number}` : "",
      "",
      `Ordered At: ${createdAt}`,
      resultsDate ? `Results Date: ${resultsDate}` : "",
      "",
      "Interpretation:",
      labTest.interpretation ?? "No interpretation recorded.",
    ].filter(Boolean)

    const text = lines.join("\n")

    // This is a simple text-based export served with a PDF content type so it can be downloaded/printed.
    // For richer formatting, you can later swap this to a real PDF generator.
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=lab_result_${labTest.test_number || id}.pdf`,
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export lab PDF", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
