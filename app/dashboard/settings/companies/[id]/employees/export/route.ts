import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "report_export_company_employees",
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "admin.export")
    const { id: companyId } = await params

  const [{ data: company }, { data: employees }, { data: dependents }] = await Promise.all([
    supabase.from("companies").select("id, name").eq("id", companyId).maybeSingle(),
    supabase
      .from("company_employees")
      .select("full_name, phone, insurance_card_number, insurance_card_serial, insurance_expiry_date, status")
      .eq("company_id", companyId),
    supabase
      .from("employee_dependents")
      .select("full_name, relationship, insurance_card_number, insurance_card_serial, insurance_expiry_date, status"),
  ])

  if (!company) {
    return new NextResponse("Company not found", { status: 404 })
  }

  const lines: string[] = []
  lines.push(`Company,${JSON.stringify(company.name)}`)
  lines.push("")
  lines.push("Section,Name,Role,Phone/Relationship,Insurance ID,Card Serial,Expiry,Status")

  for (const e of employees || []) {
    lines.push(
      [
        "Employee",
        JSON.stringify(e.full_name ?? ""),
        "Employee",
        JSON.stringify(e.phone ?? ""),
        JSON.stringify(e.insurance_card_number ?? ""),
        JSON.stringify(e.insurance_card_serial ?? ""),
        JSON.stringify(e.insurance_expiry_date ?? ""),
        JSON.stringify(e.status ?? ""),
      ].join(","),
    )
  }

  for (const d of dependents || []) {
    lines.push(
      [
        "Dependent",
        JSON.stringify(d.full_name ?? ""),
        JSON.stringify(d.relationship ?? ""),
        "",
        JSON.stringify(d.insurance_card_number ?? ""),
        JSON.stringify(d.insurance_card_serial ?? ""),
        JSON.stringify(d.insurance_expiry_date ?? ""),
        JSON.stringify(d.status ?? ""),
      ].join(","),
    )
  }

  const csv = lines.join("\n")

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=company_${company.id}_employees.csv`,
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export company employees", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
