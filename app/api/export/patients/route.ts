import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_export_patients",
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "admin.export")

  // Fetch all patients
  const { data: patients, error } = await supabase
    .from("patients")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    return new NextResponse("Error fetching data", { status: 500 })
  }

  // Convert to CSV
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
      patient.first_name,
      patient.last_name,
      patient.date_of_birth,
      patient.gender,
      patient.phone,
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
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export patients", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
