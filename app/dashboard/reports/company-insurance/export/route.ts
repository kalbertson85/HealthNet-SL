import { NextResponse, type NextRequest } from "next/server"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { enforceFixedWindowRateLimit } from "@/lib/http/api"
import { NO_STORE_DOWNLOAD_HEADERS } from "@/lib/http/headers"

const EXPORT_ROW_LIMIT = 5_000

export async function GET(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "report_export_company_insurance",
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (limited) return limited

  try {
    const { supabase } = await requirePermission(request, "admin.export")

  const { searchParams } = new URL(request.url)
  const selectedCompanyId = (searchParams.get("company_id") || "").trim() || null
  const statusFilter = (searchParams.get("status") || "all").toLowerCase().trim()

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [{ data: companies }, { data: fetchedEmployees }, { data: fetchedDependents }, { data: fetchedVisits }] =
    await Promise.all([
    supabase
      .from("companies")
      .select("id, name")
      .order("name"),
    supabase
      .from("company_employees")
      .select("id, company_id, status, insurance_expiry_date")
      .order("company_id")
      .limit(EXPORT_ROW_LIMIT + 1),
    supabase
      .from("employee_dependents")
      .select("id, employee_id, status, insurance_expiry_date")
      .order("employee_id")
      .limit(EXPORT_ROW_LIMIT + 1),
    supabase
      .from("visits")
      .select("id, patient_id, created_at, assigned_company_id")
      .gte("created_at", startOfMonth.toISOString())
      .order("created_at", { ascending: false })
      .limit(EXPORT_ROW_LIMIT + 1),
  ])

  const employees = (fetchedEmployees || []).slice(0, EXPORT_ROW_LIMIT)
  const dependents = (fetchedDependents || []).slice(0, EXPORT_ROW_LIMIT)
  const visits = (fetchedVisits || []).slice(0, EXPORT_ROW_LIMIT)
  const isQueryTruncated =
    (fetchedEmployees || []).length > EXPORT_ROW_LIMIT ||
    (fetchedDependents || []).length > EXPORT_ROW_LIMIT ||
    (fetchedVisits || []).length > EXPORT_ROW_LIMIT

  const companyMap = new Map<
    string,
    { name: string; employees: number; dependents: number; valid: number; expired: number; visitsThisMonth: number }
  >()

  for (const company of companies || []) {
    companyMap.set(company.id as string, {
      name: company.name as string,
      employees: 0,
      dependents: 0,
      valid: 0,
      expired: 0,
      visitsThisMonth: 0,
    })
  }

  const today = new Date()
  const isExpired = (dateStr: string | null | undefined) => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    return d.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  }

  for (const emp of employees || []) {
    const entry = companyMap.get(emp.company_id as string)
    if (!entry) continue
    entry.employees += 1
    if (emp.insurance_expiry_date) {
      if (isExpired(emp.insurance_expiry_date as string)) entry.expired += 1
      else entry.valid += 1
    }
  }

  const employeeCompanyById = new Map<string, string>()
  for (const emp of employees || []) {
    employeeCompanyById.set(emp.id as string, emp.company_id as string)
  }

  for (const dep of dependents || []) {
    const companyId = employeeCompanyById.get(dep.employee_id as string)
    if (!companyId) continue
    const entry = companyMap.get(companyId)
    if (!entry) continue
    entry.dependents += 1
    if (dep.insurance_expiry_date) {
      if (isExpired(dep.insurance_expiry_date as string)) entry.expired += 1
      else entry.valid += 1
    }
  }

  for (const v of visits || []) {
    const companyId = v.assigned_company_id as string | null
    if (!companyId) continue
    const entry = companyMap.get(companyId)
    if (!entry) continue
    entry.visitsThisMonth += 1
  }

  const rows = Array.from(companyMap.entries())
    .filter(([id]) => (selectedCompanyId ? id === selectedCompanyId : true))
    .filter(([, entry]) => {
      if (statusFilter === "all") return true
      if (statusFilter === "active") return entry.valid > 0
      if (statusFilter === "expired") return entry.expired > 0
      if (statusFilter === "missing") return entry.valid === 0 && entry.expired === 0
      return true
    })

  const lines: string[] = []
  lines.push("Company,Employees,Dependents,ValidCards,ExpiredCards,VisitsThisMonth")

  for (const [, entry] of rows) {
    lines.push(
      [
        JSON.stringify(entry.name ?? ""),
        entry.employees,
        entry.dependents,
        entry.valid,
        entry.expired,
        entry.visitsThisMonth,
      ].join(","),
    )
  }

  const csv = lines.join("\n")

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=company_insurance_${new Date().toISOString()}.csv`,
        "X-Export-Truncated": String(isQueryTruncated),
        "X-Export-Row-Limit": String(EXPORT_ROW_LIMIT),
        ...NO_STORE_DOWNLOAD_HEADERS,
      },
    })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error, request)
    if (authResponse) return authResponse
    console.error("[v0] Failed to export company insurance report", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
