import { NextResponse, type NextRequest } from "next/server"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { enforceTrustedOriginOrReferer } from "@/lib/http/request-security"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"
import { formatDate, formatDateTime } from "@/lib/locale-format"
import { GLOBAL_SETTINGS_SELECT, type GlobalSettingsInput } from "@/lib/global-settings"
import { requireRole, requireFacilityAccess, parseUuidParam, resolveAuthError } from "@/lib/auth-guard"
import { ROLES } from "@/lib/utils"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_lab_pdf",
    maxRequests: 60,
    windowMs: 60_000,
  })
  if (limited) return limited

  const originGuard = enforceTrustedOriginOrReferer(request)
  if (originGuard) return originGuard

  try {
    const { supabase, user } = await requireRole([ROLES.ADMIN, ROLES.FACILITY_ADMIN, ROLES.LAB_TECH, ROLES.DOCTOR])
    const { id: rawId } = await context.params
    const id = parseUuidParam(rawId, "lab test id")

    const { data: labTest, error } = await supabase
      .from("lab_tests")
      .select(`*, patients(full_name, patient_number, date_of_birth, phone_number), visits(facility_id)`)
      .eq("id", id)
      .maybeSingle()

    if (error || !labTest) {
      return new NextResponse("Lab test not found", { status: 404 })
    }
    const visit = Array.isArray(labTest.visits) ? labTest.visits[0] : labTest.visits
    requireFacilityAccess({ user, supabase }, (visit?.facility_id as string | null | undefined) ?? null)

    const { data: rawSettings } = await supabase
      .from("hospital_settings")
      .select(GLOBAL_SETTINGS_SELECT)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    const settings = (rawSettings || null) as GlobalSettingsInput

    const createdAt = labTest.created_at ? formatDateTime(labTest.created_at, settings) : ""
    const resultsDate = labTest.results_entered_at ? formatDateTime(labTest.results_entered_at, settings) : ""

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
      labTest.patients?.date_of_birth ? `Date of Birth: ${formatDate(labTest.patients.date_of_birth, settings)}` : "",
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
    const authResponse = resolveAuthError(error, request, (status, code, message) => apiError(status, code, message, request))
    if (authResponse) return authResponse
    console.error("[v0] Failed to export lab PDF", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
