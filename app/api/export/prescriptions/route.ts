import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { enforceTrustedOriginOrReferer } from "@/lib/http/request-security"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"
import { ROLES } from "@/lib/utils"

const EXPORT_ROW_LIMIT = 5_000

interface PrescriptionExportRow {
  prescription_number: string
  medications: unknown
  status: string
  dispensed_at: string | null
  created_at: string
  patient?: {
    patient_number?: string | null
    first_name?: string | null
    last_name?: string | null
  } | null
  doctor?: {
    first_name?: string | null
    last_name?: string | null
  } | null
}

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_export_prescriptions",
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (limited) return limited

  const originGuard = enforceTrustedOriginOrReferer(request)
  if (originGuard) return originGuard

  try {
    const { supabase, user } = await requirePermission(request, "admin.export")
    if (user?.role !== ROLES.ADMIN) {
      return apiError(403, "forbidden", "Only admin can run full prescription exports", request)
    }
    const { searchParams } = new URL(request.url)
    const query = (searchParams.get("q") || "").trim().toLowerCase()
    const statusFilter = (searchParams.get("status") || "").trim().toLowerCase()

    const { data: fetchedPrescriptions, error } = await supabase
      .from("prescriptions")
      .select(`
        prescription_number,
        medications,
        status,
        dispensed_at,
        created_at,
        patient:patients(patient_number, first_name, last_name),
        doctor:profiles!prescriptions_doctor_id_fkey(first_name, last_name)
      `)
      .order("created_at", { ascending: false })
      .limit(EXPORT_ROW_LIMIT + 1)

    if (error) {
      return new NextResponse("Error fetching data", { status: 500 })
    }

    const filteredRows = ((fetchedPrescriptions || []) as PrescriptionExportRow[]).filter((rx) => {
      if (statusFilter && statusFilter !== "all" && (rx.status || "").toLowerCase() !== statusFilter) {
        return false
      }
      if (!query) return true

      const haystack = [
        rx.prescription_number,
        rx.status,
        rx.patient?.patient_number,
        rx.patient?.first_name,
        rx.patient?.last_name,
        rx.doctor?.first_name,
        rx.doctor?.last_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(query)
    })

    const isTruncated = filteredRows.length > EXPORT_ROW_LIMIT
    const prescriptions = filteredRows.slice(0, EXPORT_ROW_LIMIT)

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
        "X-Export-Truncated": String(isTruncated),
        "X-Export-Row-Limit": String(EXPORT_ROW_LIMIT),
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
