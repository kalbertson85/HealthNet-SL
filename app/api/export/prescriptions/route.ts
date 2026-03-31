import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_export_prescriptions",
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "admin.export")

  const { data: prescriptions, error } = await supabase
    .from("prescriptions")
    .select(`
      *,
      patient:patients(patient_number, first_name, last_name),
      doctor:profiles!prescriptions_doctor_id_fkey(first_name, last_name)
    `)
    .order("created_at", { ascending: false })

  if (error) {
    return new NextResponse("Error fetching data", { status: 500 })
  }

  const headers = [
    "Prescription Number",
    "Patient Number",
    "Patient Name",
    "Doctor",
    "Medications",
    "Status",
    "Dispensed At",
    "Created At",
  ]

  const csvRows = [headers.join(",")]

  interface PrescriptionMedication {
    name?: string | null
    dosage?: string | null
    frequency?: string | null
    duration?: string | null
  }

  for (const rx of prescriptions) {
    const medications =
      (rx.medications as PrescriptionMedication[] | null | undefined)
        ?.map((m) => `${m.name} (${m.dosage} ${m.frequency} for ${m.duration})`)
        .join("; ") || ""

    const row = [
      rx.prescription_number,
      rx.patient?.patient_number || "",
      `${rx.patient?.first_name || ""} ${rx.patient?.last_name || ""}`,
      `${rx.doctor?.first_name || ""} ${rx.doctor?.last_name || ""}`,
      `"${medications}"`,
      rx.status,
      rx.dispensed_at || "",
      new Date(rx.created_at).toISOString(),
    ]
    csvRows.push(row.join(","))
  }

  const csv = csvRows.join("\n")

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=prescriptions_export_${new Date().toISOString()}.csv`,
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export prescriptions", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
