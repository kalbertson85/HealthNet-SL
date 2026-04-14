import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { enforceTrustedOrigin } from "@/lib/http/request-security"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { findMedicationAllergyMatches } from "@/lib/clinical-safety"
import { doesVisitBelongToPatient, isCrossFacilityAccessDenied, isVisitTerminal } from "@/lib/workflow-integrity"
import { ROLES } from "@/lib/utils"

const createPrescriptionSchema = z.object({
  patient_identifier: z.string().trim().min(1).max(64),
  visit_id: z.string().trim().uuid(),
  notes: z.string().trim().max(5000).optional(),
  medications: z
    .array(
      z.object({
        medication_name: z.string().trim().min(1).max(255),
        dosage: z.string().trim().min(1).max(255),
        frequency: z.string().trim().min(1).max(255),
        duration: z.string().trim().min(1).max(255),
        quantity: z.number().finite().int().positive(),
        instructions: z.string().trim().max(2000).optional().default(""),
      }),
    )
    .min(1)
    .max(100),
})

const MAX_PRESCRIPTION_REQUEST_BODY_BYTES = 256 * 1024

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function hasDuplicatePrescriptionLines(
  medications: Array<{
    medication_name: string
    dosage: string
    frequency: string
    duration: string
  }>,
) {
  const seen = new Set<string>()
  for (const med of medications) {
    const key = [
      normalizeText(med.medication_name),
      normalizeText(med.dosage),
      normalizeText(med.frequency),
      normalizeText(med.duration),
    ].join("|")
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}

function generatePrescriptionNumber() {
  return `RX-${Date.now().toString().slice(-6)}`
}

export async function POST(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_prescriptions_create",
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  const originGuard = enforceTrustedOrigin(request)
  if (originGuard) return originGuard

  try {
    const { supabase, user } = await requirePermission(request, "prescriptions.manage")
    if (!user?.id) {
      return apiError(401, "unauthorized", "Unauthorized", request)
    }
    const contentType = request.headers.get("content-type")?.toLowerCase() || ""
    if (!contentType.includes("application/json")) {
      return apiError(415, "unsupported_media_type", "Content-Type must be application/json", request)
    }
    const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10)
    if (Number.isFinite(contentLength) && contentLength > MAX_PRESCRIPTION_REQUEST_BODY_BYTES) {
      return apiError(413, "payload_too_large", "Request payload too large", request)
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return apiError(400, "invalid_json", "Invalid JSON payload", request)
    }

    const parsed = createPrescriptionSchema.safeParse(payload)
    if (!parsed.success) {
      return apiError(400, "invalid_payload", "Invalid prescription payload", request)
    }

    const { patient_identifier, visit_id, notes, medications } = parsed.data
    if (hasDuplicatePrescriptionLines(medications)) {
      return apiError(409, "duplicate_prescription_lines", "Duplicate prescription items are not allowed", request)
    }
    const identifier = patient_identifier.trim()
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, allergies, facility_id")
      .eq(uuidRegex.test(identifier) ? "id" : "patient_number", identifier)
      .maybeSingle()

    if (patientError) {
      return apiError(500, "patient_lookup_failed", "Failed to resolve patient", request)
    }
    if (!patient?.id) {
      return apiError(404, "patient_not_found", "No patient found with that identifier", request)
    }

    const userFacilityId = user?.facility_id ?? null
    const patientFacilityId = (patient as { facility_id?: string | null }).facility_id ?? null
    const userRole = (user?.role || "").toLowerCase()
    if (userRole !== ROLES.ADMIN && userFacilityId && patientFacilityId && userFacilityId !== patientFacilityId) {
      return apiError(403, "patient_facility_mismatch", "Forbidden: patient belongs to another facility", request)
    }

    const allergyMatches = findMedicationAllergyMatches(
      (patient.allergies as string | null | undefined) ?? null,
      medications.map((med) => med.medication_name),
    )
    if (allergyMatches.length > 0) {
      return apiError(409, "allergy_conflict", `Prescription blocked due to allergy match: ${allergyMatches.join(", ")}`, request)
    }

    const visitId = visit_id.trim()
    const { data: visit, error: visitError } = await supabase
      .from("visits")
      .select("id, patient_id, facility_id, visit_status")
      .eq("id", visitId)
      .maybeSingle()

    if (visitError) {
      return apiError(500, "visit_lookup_failed", "Failed to validate visit", request)
    }
    if (!visit?.id) {
      return apiError(404, "visit_not_found", "Visit not found", request)
    }
    if (!doesVisitBelongToPatient({ visitPatientId: visit.patient_id as string | null, patientId: patient.id })) {
      return apiError(409, "visit_patient_mismatch", "Visit does not belong to this patient", request)
    }
    if (isVisitTerminal(visit.visit_status as string | null)) {
      return apiError(409, "visit_closed", "Cannot prescribe on a closed visit", request)
    }
    const visitFacilityId = (visit.facility_id as string | null) ?? null
    if (isCrossFacilityAccessDenied({ userRole, userFacilityId, resourceFacilityId: visitFacilityId })) {
      return apiError(403, "visit_facility_mismatch", "Forbidden: visit belongs to another facility", request)
    }

    const { data: existingPrescriptions, error: existingPrescriptionLookupError } = await supabase
      .from("prescriptions")
      .select("id, status")
      .eq("visit_id", visitId)
      .in("status", ["pending", "partially_dispensed"])
      .limit(1)

    if (existingPrescriptionLookupError) {
      return apiError(500, "prescription_lookup_failed", "Failed to validate existing prescriptions", request)
    }

    if ((existingPrescriptions || []).length > 0) {
      return apiError(409, "duplicate_open_prescription", "An open prescription already exists for this visit", request)
    }

    const insertPayload: Record<string, unknown> = {
      patient_id: patient.id,
      doctor_id: user.id,
      prescription_number: generatePrescriptionNumber(),
      notes: notes || null,
      status: "pending",
    }
    insertPayload.visit_id = visitId

    const rpcFn = (supabase as { rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }).rpc
    if (typeof rpcFn !== "function") {
      return apiError(503, "transactional_dependency_unavailable", "Transactional prescription RPC is unavailable", request)
    }
    const rpcResult = await rpcFn("create_prescription_transactional", {
      p_patient_id: patient.id,
      p_doctor_id: user.id,
      p_visit_id: visitId,
      p_notes: notes || null,
      p_medications: medications,
      p_prescription_number: insertPayload.prescription_number,
      p_status: "pending",
    })

    if (rpcResult.error) {
      const rpcErrorCode = String((rpcResult.error as { code?: string } | null)?.code || "")
      if (rpcErrorCode === "23505") {
        return apiError(409, "duplicate_open_prescription", "An open prescription already exists for this visit", request)
      }
      if (rpcErrorCode === "42883") {
        return apiError(503, "transactional_dependency_unavailable", "Transactional prescription RPC is unavailable", request)
      }
      return apiError(500, "prescription_create_failed", "Failed to create prescription", request)
    }

    const rpcData = (rpcResult.data || null) as
      | { ok?: boolean; code?: string; message?: string; prescription_id?: string | null }
      | null
      | undefined
    if (rpcData?.ok && rpcData.prescription_id) {
      return NextResponse.json({ ok: true, prescription_id: rpcData.prescription_id }, { status: 200 })
    }
    if (rpcData && rpcData.ok === false) {
      if (rpcData.code === "duplicate_open_prescription") {
        return apiError(409, "duplicate_open_prescription", "An open prescription already exists for this visit", request)
      }
      return apiError(500, rpcData.code || "prescription_create_failed", rpcData.message || "Failed to create prescription", request)
    }
    return apiError(500, "prescription_create_failed", "Failed to create prescription", request)
  } catch (error) {
    const authError = toAuthErrorResponse(error, request)
    if (authError) return authError
    console.error("[v0] Failed to create prescription from API", error)
    return apiError(500, "prescription_create_failed", "Failed to create prescription", request)
  }
}
