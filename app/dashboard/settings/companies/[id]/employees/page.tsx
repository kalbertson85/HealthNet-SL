import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface CompanyEmployeesPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ status?: string }>
}

export default async function CompanyEmployeesPage({ params, searchParams }: CompanyEmployeesPageProps) {
  const supabase = await createServerClient()
  const { user } = await getSessionUserAndProfile()
  const { id: companyId } = await params

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.export") && !can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const sp = await searchParams
  const statusFilter = (sp.status || "all").toLowerCase().trim()

  const [{ data: company }, { data: employeesRaw }, { data: dependentsRaw }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name")
      .eq("id", companyId)
      .maybeSingle(),
    supabase
      .from("company_employees")
      .select("id, full_name, phone, insurance_card_number, insurance_card_serial, insurance_expiry_date, status")
      .eq("company_id", companyId)
      .order("full_name"),
    supabase
      .from("employee_dependents")
      .select("id, employee_id, full_name, relationship, insurance_card_number, insurance_card_serial, insurance_expiry_date, status")
      .order("full_name"),
  ])

  if (!company) {
    redirect("/dashboard/settings/companies")
  }

  const employees = (employeesRaw || []).filter((e) =>
    statusFilter === "all" ? true : (e.status || "").toLowerCase() === statusFilter,
  )
  const dependents = (dependentsRaw || []).filter((d) =>
    statusFilter === "all" ? true : (d.status || "").toLowerCase() === statusFilter,
  )

  const totalEmployees = employees?.length ?? 0
  const totalDependents = dependents?.length ?? 0

  const now = new Date()
  const isExpired = (dateStr: string | null | undefined) => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    return d.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  }

  const validCards = [
    ...(employees || []),
    ...(dependents || []),
  ].filter((row) => row.insurance_expiry_date && !isExpired(row.insurance_expiry_date)).length

  const expiredCards = [
    ...(employees || []),
    ...(dependents || []),
  ].filter((row) => row.insurance_expiry_date && isExpired(row.insurance_expiry_date)).length

  async function updateEmployeeInsurance(formData: FormData) {
    "use server"

    const supabase = await createServerClient()

    const id = formData.get("employee_id") as string
    const phone = ((formData.get("phone") as string | null) || "").trim() || null
    const insuranceCardNumber = ((formData.get("insurance_card_number") as string | null) || "").trim() || null
    const insuranceCardSerial = ((formData.get("insurance_card_serial") as string | null) || "").trim() || null
    const insuranceExpiry = (formData.get("insurance_expiry_date") as string | null) || null
    const status = ((formData.get("status") as string | null) || "").trim() || null

    await supabase
      .from("company_employees")
      .update({
        phone,
        insurance_card_number: insuranceCardNumber,
        insurance_card_serial: insuranceCardSerial,
        insurance_expiry_date: insuranceExpiry,
        status,
      })
      .eq("id", id)

    redirect(`/dashboard/settings/companies/${companyId}/employees`)
  }

  async function updateDependentInsurance(formData: FormData) {
    "use server"

    const supabase = await createServerClient()

    const id = formData.get("dependent_id") as string
    const relationship = ((formData.get("relationship") as string | null) || "").trim() || null
    const insuranceCardNumber = ((formData.get("insurance_card_number") as string | null) || "").trim() || null
    const insuranceCardSerial = ((formData.get("insurance_card_serial") as string | null) || "").trim() || null
    const insuranceExpiry = (formData.get("insurance_expiry_date") as string | null) || null
    const status = ((formData.get("status") as string | null) || "").trim() || null

    await supabase
      .from("employee_dependents")
      .update({
        relationship,
        insurance_card_number: insuranceCardNumber,
        insurance_card_serial: insuranceCardSerial,
        insurance_expiry_date: insuranceExpiry,
        status,
      })
      .eq("id", id)

    redirect(`/dashboard/settings/companies/${companyId}/employees`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings/companies">
              Back to Companies
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{company.name} employees & insurance</h1>
            <p className="text-muted-foreground text-sm">
              View registered employees, dependents, and their insurance status.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <form method="GET" className="flex items-center gap-2 text-xs">
            <select
              name="status"
              defaultValue={statusFilter || "all"}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Filter by insurance status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="missing">Missing</option>
            </select>
            <Button type="submit" size="sm" variant="outline">
              Apply
            </Button>
          </form>
          <Button asChild size="sm" variant="outline">
            <Link href={`/dashboard/settings/companies/${company.id}/employees/export`}>
              Export CSV
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total employees</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalEmployees}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total dependents</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalDependents}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Insurance cards</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>Valid: {validCards}</p>
            <p>Expired: {expiredCards}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Employees</CardTitle>
            <CardDescription>Company employees registered as patients.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {!employees || employees.length === 0 ? (
              <p className="text-muted-foreground">No employees recorded yet.</p>
            ) : (
              employees.map((emp) => (
                <form
                  key={emp.id}
                  action={updateEmployeeInsurance}
                  className="rounded border px-3 py-2 space-y-1"
                >
                  <input type="hidden" name="employee_id" value={emp.id} />
                  <p className="font-medium text-sm">{emp.full_name}</p>
                  <div className="grid gap-2 md:grid-cols-2 mt-1">
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Phone</p>
                      <input
                        name="phone"
                        defaultValue={emp.phone || ""}
                        className="h-7 w-full rounded border border-input bg-background px-2 text-[11px]"
                        title="Employee phone number"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Status</p>
                      <select
                        name="status"
                        defaultValue={emp.status || "active"}
                        className="h-7 w-full rounded border border-input bg-background px-2 text-[11px]"
                        title="Employee insurance status"
                      >
                        <option value="active">Active</option>
                        <option value="expired">Expired</option>
                        <option value="missing">Missing</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3 mt-2">
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Insurance ID</p>
                      <input
                        name="insurance_card_number"
                        defaultValue={emp.insurance_card_number || ""}
                        className="h-7 w-full rounded border border-input bg-background px-2 text-[11px] font-mono"
                        title="Employee insurance card number"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Card serial</p>
                      <input
                        name="insurance_card_serial"
                        defaultValue={emp.insurance_card_serial || ""}
                        className="h-7 w-full rounded border border-input bg-background px-2 text-[11px]"
                        title="Employee insurance card serial"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Expiry date</p>
                      <input
                        type="date"
                        name="insurance_expiry_date"
                        defaultValue={emp.insurance_expiry_date || ""}
                        className="h-7 w-full rounded border border-input bg-background px-2 text-[11px]"
                        title="Employee insurance expiry date"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button type="submit" size="sm" variant="outline">
                      Save
                    </Button>
                  </div>
                </form>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dependents</CardTitle>
            <CardDescription>Dependents linked to company employees.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {!dependents || dependents.length === 0 ? (
              <p className="text-muted-foreground">No dependents recorded yet.</p>
            ) : (
              dependents.map((dep) => (
                <form
                  key={dep.id}
                  action={updateDependentInsurance}
                  className="rounded border px-3 py-2 space-y-1"
                >
                  <input type="hidden" name="dependent_id" value={dep.id} />
                  <p className="font-medium text-sm">{dep.full_name}</p>
                  <div className="grid gap-2 md:grid-cols-2 mt-1">
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Relationship</p>
                      <input
                        name="relationship"
                        defaultValue={dep.relationship || ""}
                        className="h-7 w-full rounded border border-input bg-background px-2 text-[11px]"
                        title="Dependent relationship"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Status</p>
                      <select
                        name="status"
                        defaultValue={dep.status || "active"}
                        className="h-7 w-full rounded border border-input bg-background px-2 text-[11px]"
                        title="Dependent insurance status"
                      >
                        <option value="active">Active</option>
                        <option value="expired">Expired</option>
                        <option value="missing">Missing</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3 mt-2">
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Insurance ID</p>
                      <input
                        name="insurance_card_number"
                        defaultValue={dep.insurance_card_number || ""}
                        className="h-7 w-full rounded border border-input bg-background px-2 text-[11px] font-mono"
                        title="Dependent insurance card number"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Card serial</p>
                      <input
                        name="insurance_card_serial"
                        defaultValue={dep.insurance_card_serial || ""}
                        className="h-7 w-full rounded border border-input bg-background px-2 text-[11px]"
                        title="Dependent insurance card serial"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Expiry date</p>
                      <input
                        type="date"
                        name="insurance_expiry_date"
                        defaultValue={dep.insurance_expiry_date || ""}
                        className="h-7 w-full rounded border border-input bg-background px-2 text-[11px]"
                        title="Dependent insurance expiry date"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button type="submit" size="sm" variant="outline">
                      Save
                    </Button>
                  </div>
                </form>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
