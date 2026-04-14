import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { enforceTrustedOrigin } from "@/lib/http/request-security"
import { requireRole, resolveAuthError } from "@/lib/auth-guard"
import { ROLES } from "@/lib/utils"

const createMedicationSchema = z.object({
  name: z.string().trim().min(2).max(255),
})

const MAX_MEDICATION_REQUEST_BODY_BYTES = 32 * 1024

export async function POST(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_medications_create",
    maxRequests: 60,
    windowMs: 60_000,
  })
  if (limited) return limited

  const originGuard = enforceTrustedOrigin(request)
  if (originGuard) return originGuard

  try {
    const { supabase, user } = await requireRole([ROLES.ADMIN, ROLES.FACILITY_ADMIN, ROLES.PHARMACIST, ROLES.DOCTOR])
    const contentType = request.headers.get("content-type")?.toLowerCase() || ""
    if (!contentType.includes("application/json")) {
      return apiError(415, "unsupported_media_type", "Content-Type must be application/json", request)
    }
    const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10)
    if (Number.isFinite(contentLength) && contentLength > MAX_MEDICATION_REQUEST_BODY_BYTES) {
      return apiError(413, "payload_too_large", "Request payload too large", request)
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return apiError(400, "invalid_json", "Invalid JSON payload", request)
    }

    const parsed = createMedicationSchema.safeParse(payload)
    if (!parsed.success) {
      return apiError(400, "invalid_payload", "Invalid medication payload", request)
    }

    const { data, error } = await supabase
      .from("medications")
      .insert({
        name: parsed.data.name,
        dosage_form: "unspecified",
        strength: "",
        unit: "unit",
        category: "Uncategorized",
        unit_price: 0,
      })
      .select("id, name")
      .single()

    const errorCode = (error as { code?: string } | null)?.code
    if (errorCode === "23505") {
      return apiError(409, "medication_already_exists", "A medication with this name already exists", request)
    }

    if (error || !data) {
      return apiError(500, "medication_create_failed", "Failed to create medication", request)
    }

    const { error: auditError } = await supabase.from("admin_audit_logs").insert({
      actor_user_id: user.id,
      target_user_id: user.id,
      action: "medication_create",
      notes: `Created medication ${data.id}`,
    })
    if (auditError) {
      await supabase.from("medications").delete().eq("id", data.id)
      return apiError(500, "audit_log_failed", "Failed to record medication creation audit log", request)
    }

    return NextResponse.json({ ok: true, medication: { id: data.id, name: data.name } }, { status: 200 })
  } catch (error) {
    const authError = resolveAuthError(error, request, apiError)
    if (authError) return authError
    return apiError(500, "medication_create_failed", "Failed to create medication", request)
  }
}
