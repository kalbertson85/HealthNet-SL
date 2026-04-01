import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

const EXPORT_ROW_LIMIT = 5_000

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_export_appointments",
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "admin.export")

    const { data: fetchedAppointments, error } = await supabase
      .from("appointments")
      .select(`
        appointment_date,
        appointment_time,
        appointment_type,
        status,
        reason,
        notes,
        created_at,
        patient:patients(patient_number, first_name, last_name),
        doctor:profiles!appointments_doctor_id_fkey(first_name, last_name)
      `)
      .order("appointment_date", { ascending: false })
      .limit(EXPORT_ROW_LIMIT + 1)

    if (error) {
      return new NextResponse("Error fetching data", { status: 500 })
    }

    const isTruncated = (fetchedAppointments || []).length > EXPORT_ROW_LIMIT
    const appointments = (fetchedAppointments || []).slice(0, EXPORT_ROW_LIMIT)

    const headers = [
      "Appointment Date",
      "Time",
      "Patient Number",
      "Patient Name",
      "Doctor",
      "Type",
      "Status",
      "Reason",
      "Notes",
      "Created At",
    ]

    const csvRows = [headers.join(",")]

    for (const apt of appointments) {
      const row = [
        apt.appointment_date,
        apt.appointment_time,
        apt.patient?.patient_number || "",
        `${apt.patient?.first_name || ""} ${apt.patient?.last_name || ""}`,
        `${apt.doctor?.first_name || ""} ${apt.doctor?.last_name || ""}`,
        apt.appointment_type,
        apt.status,
        `"${apt.reason || ""}"`,
        `"${apt.notes || ""}"`,
        new Date(apt.created_at).toISOString(),
      ]
      csvRows.push(row.join(","))
    }

    const csv = csvRows.join("\n")

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=appointments_export_${new Date().toISOString()}.csv`,
        "X-Export-Truncated": String(isTruncated),
        "X-Export-Row-Limit": String(EXPORT_ROW_LIMIT),
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export appointments", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
