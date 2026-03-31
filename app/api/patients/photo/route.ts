import { NextResponse, type NextRequest } from "next/server"
import { uploadPatientPhotoWithClient } from "@/lib/storage"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { enforceTrustedOrigin } from "@/lib/http/request-security"

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_UPLOAD_REQUEST_BYTES = 6 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
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
    return apiError(413, "payload_too_large", "Upload payload too large")
  }

  try {
    // Enforce that only roles allowed to edit patients can upload photos
    const { supabase, user } = await requirePermission(request, "patients.edit")

    const formData = await request.formData()
    const patientId = ((formData.get("patientId") as string | null) || "").trim()
    const file = formData.get("file") as File | null

    if (!patientId || !file) {
      return NextResponse.json({ error: "Missing patientId or file" }, { status: 400 })
    }

    if (!UUID_PATTERN.test(patientId)) {
      return NextResponse.json({ error: "Invalid patientId format" }, { status: 400 })
    }

    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Invalid file size. Max 5MB" }, { status: 400 })
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Allowed: JPEG, PNG, WEBP" }, { status: 400 })
    }

    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, facility_id")
      .eq("id", patientId)
      .maybeSingle()

    if (patientError) {
      console.error("[v0] Error validating patient before photo upload", patientError)
      return NextResponse.json({ error: "Failed to validate patient" }, { status: 500 })
    }

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 })
    }

    if (user?.facility_id && patient.facility_id && user.facility_id !== patient.facility_id) {
      return NextResponse.json({ error: "Forbidden: patient belongs to another facility" }, { status: 403 })
    }

    const photoUrl = await uploadPatientPhotoWithClient(supabase, patientId, file)

    const { error } = await supabase
      .from("patients")
      .update({ photo_url: photoUrl })
      .eq("id", patientId)

    if (error) {
      console.error("[v0] Error updating patient photo_url", error)
      return NextResponse.json({ error: "Failed to update patient photo" }, { status: 500 })
    }

    return NextResponse.json({ photoUrl }, { status: 200 })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[v0] Error uploading patient photo", error)
    return NextResponse.json({ error: "Error uploading patient photo" }, { status: 500 })
  }
}
