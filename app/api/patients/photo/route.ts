import { NextResponse, type NextRequest } from "next/server"
import { uploadPatientPhotoWithClient } from "@/lib/storage"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { enforceTrustedOrigin } from "@/lib/http/request-security"
import { detectImageMimeType } from "@/lib/files/image-signature"
import { resolveRequestId } from "@/lib/http/request-id"

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_UPLOAD_REQUEST_BYTES = 6 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request)
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_patient_photo_upload",
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (limited) return limited

  const originGuard = enforceTrustedOrigin(request)
  if (originGuard) return originGuard

  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_REQUEST_BYTES) {
    return apiError(413, "payload_too_large", "Upload payload too large", request)
  }

  try {
    // Enforce that only roles allowed to edit patients can upload photos
    const { supabase, user } = await requirePermission(request, "patients.edit")

    const formData = await request.formData()
    const patientId = ((formData.get("patientId") as string | null) || "").trim()
    const file = formData.get("file") as File | null

    if (!patientId || !file) {
      return apiError(400, "missing_required_fields", "Missing patientId or file", request)
    }

    if (!UUID_PATTERN.test(patientId)) {
      return apiError(400, "invalid_patient_id", "Invalid patientId format", request)
    }

    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return apiError(400, "invalid_file_size", "Invalid file size. Max 5MB", request)
    }

    const fileName = file.name.trim().toLowerCase()
    const fileExtension = fileName.includes(".") ? fileName.split(".").pop() || "" : ""
    if (fileExtension && !ALLOWED_IMAGE_EXTENSIONS.has(fileExtension)) {
      return apiError(400, "invalid_file_extension", "Invalid file extension. Allowed: JPG, JPEG, PNG, WEBP", request)
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type || "")) {
      return apiError(400, "invalid_file_type", "Invalid file type. Allowed: JPEG, PNG, WEBP", request)
    }

    const fileBytes = new Uint8Array(await file.arrayBuffer())
    const sniffedType = detectImageMimeType(fileBytes)
    if (!sniffedType) {
      return apiError(400, "invalid_image_signature", "Invalid image file signature", request)
    }
    if (sniffedType !== file.type) {
      return apiError(400, "mismatched_file_signature", "Image signature does not match file type", request)
    }

    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, facility_id")
      .eq("id", patientId)
      .maybeSingle()

    if (patientError) {
      console.error("[v0] Error validating patient before photo upload", { requestId, patientError })
      return apiError(500, "patient_validation_failed", "Failed to validate patient", request)
    }

    if (!patient) {
      return apiError(404, "patient_not_found", "Patient not found", request)
    }

    if (user?.facility_id && patient.facility_id && user.facility_id !== patient.facility_id) {
      return apiError(403, "patient_facility_mismatch", "Forbidden: patient belongs to another facility", request)
    }

    const photoUrl = await uploadPatientPhotoWithClient(supabase, patientId, file, {
      validatedMimeType: sniffedType,
    })

    const { error } = await supabase
      .from("patients")
      .update({ photo_url: photoUrl })
      .eq("id", patientId)

    if (error) {
      console.error("[v0] Error updating patient photo_url", { requestId, error })
      return apiError(500, "patient_photo_update_failed", "Failed to update patient photo", request)
    }

    return NextResponse.json({ ok: true, photoUrl, request_id: requestId }, { status: 200 })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    console.error("[v0] Error uploading patient photo", { requestId, error })
    return apiError(500, "patient_photo_upload_failed", "Error uploading patient photo", request)
  }
}
