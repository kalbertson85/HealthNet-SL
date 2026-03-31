import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface CompanyInsuranceReportsPageProps {
  searchParams: Promise<{ company_id?: string; status?: string }>
}

export default async function CompanyInsuranceReportsPage({ searchParams }: CompanyInsuranceReportsPageProps) {
  const supabase = await createServerClient()
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "reports.view") && !can(user, "admin.export") && !can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const sp = await searchParams
  const selectedCompanyId = (sp.company_id || "").trim() || null
  const statusFilter = (sp.status || "all").toLowerCase().trim()

  const exportSearch = new URLSearchParams()
  if (selectedCompanyId) exportSearch.set("company_id", selectedCompanyId)
  if (statusFilter) exportSearch.set("status", statusFilter)
  const exportHref = `/dashboard/reports/company-insurance/export?${exportSearch.toString()}`

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [{ data: companies }, { data: employees }, { data: dependents }, { data: visits }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name")
      .order("name"),
    supabase
      .from("company_employees")
      .select("id, company_id, status, insurance_expiry_date")
      .order("company_id"),
    supabase
      .from("employee_dependents")
      .select("id, employee_id, status, insurance_expiry_date")
      .order("employee_id"),
    supabase
      .from("visits")
      .select("id, patient_id, created_at, assigned_company_id")
      .gte("created_at", startOfMonth.toISOString()),
  ])

  const companyMap = new Map<string, { name: string; employees: number; dependents: number; valid: number; expired: number; visitsThisMonth: number }>()

  for (const company of companies || []) {
    companyMap.set(company.id, {
      name: company.name,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Company insurance overview</h1>
          <p className="text-sm text-muted-foreground">
            View company-level insurance coverage, dependents, and visit activity for this month.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={exportHref}>Export CSV</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/reports">Back to Reports</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 text-sm">
        <div className="space-y-1">
          <label htmlFor="company_id" className="text-xs font-medium text-muted-foreground">
            Company
          </label>
          <select
            id="company_id"
            name="company_id"
            defaultValue={selectedCompanyId || ""}
            className="h-9 min-w-[200px] rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">All companies</option>
            {(companies || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="status" className="text-xs font-medium text-muted-foreground">
            Insurance status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter || "all"}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">All</option>
            <option value="active">Has valid cards</option>
            <option value="expired">Has expired cards</option>
            <option value="missing">No cards</option>
          </select>
        </div>
        <Button type="submit" size="sm" className="mt-4">
          Apply filters
        </Button>
      </form>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Companies</CardTitle>
            <CardDescription>With at least one employee or dependent.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{rows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Valid insurance cards</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {rows.reduce((sum, [, e]) => sum + e.valid, 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Visits this month</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {rows.reduce((sum, [, e]) => sum + e.visitsThisMonth, 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Companies</CardTitle>
          <CardDescription>Employee and dependent coverage by company.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No companies match the selected filters.</p>
          ) : (
            <div className="overflow-x-auto text-sm">
              <table className="min-w-full border divide-y divide-border text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Company</th>
                    <th className="px-3 py-2 text-left font-medium">Employees</th>
                    <th className="px-3 py-2 text-left font-medium">Dependents</th>
                    <th className="px-3 py-2 text-left font-medium">Valid cards</th>
                    <th className="px-3 py-2 text-left font-medium">Expired cards</th>
                    <th className="px-3 py-2 text-left font-medium">Visits this month</th>
                    <th className="px-3 py-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([id, entry]) => (
                    <tr key={id} className="border-b last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap">{entry.name}</td>
                      <td className="px-3 py-2">{entry.employees}</td>
                      <td className="px-3 py-2">{entry.dependents}</td>
                      <td className="px-3 py-2">{entry.valid}</td>
                      <td className="px-3 py-2">{entry.expired}</td>
                      <td className="px-3 py-2">{entry.visitsThisMonth}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/settings/companies/${id}/employees`}>Employees</Link>
                          </Button>
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/dashboard/billing?company_id=${id}`}>Billing</Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
