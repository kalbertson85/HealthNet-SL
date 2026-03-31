import { createClient as createSupabaseServerClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"

const STORAGE_BUCKET = process.env.NEXT_PUBLIC_PATIENT_PHOTOS_BUCKET || "patient-photos"
const HOSPITAL_LOGO_BUCKET = process.env.NEXT_PUBLIC_HOSPITAL_LOGO_BUCKET || "hospital-logos"
const COMPANY_LOGO_BUCKET = process.env.NEXT_PUBLIC_COMPANY_LOGO_BUCKET || "company-logos"

function resolvePhotoExtensionFromMimeType(mimeType: string): string | null {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    default:
      return null
  }
}

export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase storage is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
  }

  return createSupabaseServerClient(url, serviceRoleKey)
}

export async function uploadPatientPhotoWithClient(
  supabase: SupabaseClient,
  patientId: string,
  file: File,
  opts?: { validatedMimeType?: string },
): Promise<string> {
  const mimeType = opts?.validatedMimeType ?? file.type
  const ext = resolvePhotoExtensionFromMimeType(mimeType)
  if (!ext) {
    throw new Error(`Unsupported image mime type: ${mimeType}`)
  }
  const path = `${patientId}/${Date.now()}.${ext}`

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    upsert: false,
    contentType: mimeType,
  })

  if (error) {
    throw error
  }

  const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path)

  return publicUrlData.publicUrl
}

export async function uploadHospitalLogo(file: File): Promise<string> {
  const supabase = getSupabaseAdminClient()

  const ext = file.name.split(".").pop() || "bin"
  const path = `hospital/${Date.now()}.${ext}`

  const { data, error } = await supabase.storage.from(HOSPITAL_LOGO_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream",
  })

  if (error) {
    throw error
  }

  const { data: publicUrlData } = supabase.storage.from(HOSPITAL_LOGO_BUCKET).getPublicUrl(data.path)

  return publicUrlData.publicUrl
}

export async function uploadCompanyLogo(file: File): Promise<string> {
  const supabase = getSupabaseAdminClient()

  const ext = file.name.split(".").pop() || "bin"
  const path = `company/${Date.now()}.${ext}`

  const { data, error } = await supabase.storage.from(COMPANY_LOGO_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream",
  })

  if (error) {
    throw error
  }

  const { data: publicUrlData } = supabase.storage.from(COMPANY_LOGO_BUCKET).getPublicUrl(data.path)

  return publicUrlData.publicUrl
}
