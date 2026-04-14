import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { enforceTrustedOriginOrReferer } from "@/lib/http/request-security"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"
import { ROLES } from "@/lib/utils"

const EXPORT_ROW_LIMIT = 5_000

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_export_patients",
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (limited) return limited

  const originGuard = enforceTrustedOriginOrReferer(request)
  if (originGuard) return originGuard

  try {
    const { supabase, user } = await requirePermission(request, "admin.export")
    if (user?.role !== ROLES.ADMIN) {
      return apiError(403, "forbidden", "Only admin can run full patient exports", request)
    }
    const { searchParams } = new URL(request.url)
    const searchQuery = (searchParams.get("search") || "").trim()
    const statusFilter = (searchParams.get("status") || "").trim().toLowerCase()
    const genderFilter = (searchParams.get("gender") || "").trim().toLowerCase()

    let query = supabase
      .from("patients")
      .select(
        "national_id, patient_number, first_name, last_name, full_name, date_of_birth, gender, phone, phone_number, email, address, blood_group, allergies, medical_history, emergency_contact_name, emergency_contact_phone, next_of_kin, status, created_at",
      )
      .order("created_at", { ascending: false })

    if (searchQuery) {
      query = query.or(
        `patient_number.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%,phone_number.ilike.%${searchQuery}%`,
      )
    }
    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter)
    }
    if (genderFilter && genderFilter !== "all") {
      query = query.eq("gender", genderFilter)
    }

    const { data: fetchedPatients, error } = await query.limit(EXPORT_ROW_LIMIT + 1)

    if (error) {
      return new NextResponse("Error fetching data", { status: 500 })
    }

    const isTruncated = (fetchedPatients || []).length > EXPORT_ROW_LIMIT
    const patients = (fetchedPatients || []).slice(0, EXPORT_ROW_LIMIT)

    const headers = [
      "National ID",
      "Patient Number",
      "First Name",
      "Last Name",
      "Date of Birth",
      "Gender",
      "Phone",
      "Email",
      "Address",
      "Blood Group",
      "Allergies",
      "Medical History",
      "Emergency Contact",
      "Emergency Phone",
      "Next of Kin (JSON)",
      "Status",
      "Registration Date",
    ]

    const csvRows = [headers.join(",")]

    for (const patient of patients) {
      const nextOfKin = patient.next_of_kin ? JSON.stringify(patient.next_of_kin) : ""
      const row = [
        patient.national_id || "",
        patient.patient_number,
        patient.first_name || patient.full_name || "",
        patient.last_name || "",
        patient.date_of_birth,
        patient.gender,
        patient.phone || patient.phone_number || "",
        patient.email || "",
        `"${patient.address || ""}"`,
        patient.blood_group || "",
        `"${patient.allergies || ""}"`,
        `"${patient.medical_history || ""}"`,
        patient.emergency_contact_name || "",
        patient.emergency_contact_phone || "",
        `"${nextOfKin}"`,
        patient.status,
        new Date(patient.created_at).toISOString(),
      ]
      csvRows.push(row.join(","))
    }

    const csv = csvRows.join("\n")

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=patients_export_${new Date().toISOString()}.csv`,
        "X-Export-Truncated": String(isTruncated),
        "X-Export-Row-Limit": String(EXPORT_ROW_LIMIT),
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export patients", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
