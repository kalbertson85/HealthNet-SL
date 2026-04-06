import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Users, UserCheck, UserX } from "lucide-react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableCard } from "@/components/table-card"
import { redirect } from "next/navigation"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { StatCard } from "@/components/stat-card"
import { ReportFilterSummary } from "@/components/report-filter-summary"
import { ExportPreviewCard } from "@/components/export-preview-card"

const PAGE_SIZE = 50
const PAGE_SCAN_LIMIT = 500
const MAX_SEARCH_LENGTH = 64

function normalizeSearch(search: string | undefined): string {
  return (search || "").trim().slice(0, MAX_SEARCH_LENGTH)
}

function normalizeFilter(value: string | undefined): string {
  return (value || "").trim().toLowerCase()
}

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; status?: string; gender?: string }>
}) {
  const supabase = await createServerClient()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  const { search: searchParam, page: pageParam, status: statusParam, gender: genderParam } = await searchParams
  const searchQuery = normalizeSearch(searchParam)
  const statusFilter = normalizeFilter(statusParam)
  const genderFilter = normalizeFilter(genderParam)
  const parsedPage = Number.parseInt(pageParam || "1", 10)
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE
  const scanCapReached = to >= PAGE_SCAN_LIMIT
  const hasActiveFilters = Boolean(searchQuery) || Boolean(statusFilter) || Boolean(genderFilter)
  const canExport = can(rbacUser, "admin.export")
  const exportQuery = new URLSearchParams()
  if (searchQuery) exportQuery.set("search", searchQuery)
  if (statusFilter) exportQuery.set("status", statusFilter)
  if (genderFilter) exportQuery.set("gender", genderFilter)
  const exportHref = exportQuery.toString()
    ? `/api/export/patients?${exportQuery.toString()}`
    : "/api/export/patients"

  const buildPageHref = (page: number) => {
    const qs = new URLSearchParams()
    if (searchQuery) {
      qs.set("search", searchQuery)
    }
    if (statusFilter) {
      qs.set("status", statusFilter)
    }
    if (genderFilter) {
      qs.set("gender", genderFilter)
    }
    if (page > 1) {
      qs.set("page", String(page))
    }
    const queryString = qs.toString()
    return queryString ? `/dashboard/patients?${queryString}` : "/dashboard/patients"
  }

  // Fetch patients with optional search
  let query = supabase
    .from("patients")
    .select("id, patient_number, full_name, gender, phone_number, status")
    .order("created_at", { ascending: false })

  if (searchQuery) {
    query = query.or(
      `full_name.ilike.%${searchQuery}%,patient_number.ilike.%${searchQuery}%,phone_number.ilike.%${searchQuery}%`,
    )
  }
  if (statusFilter) {
    query = query.eq("status", statusFilter)
  }
  if (genderFilter) {
    query = query.eq("gender", genderFilter)
  }

  let summaryQuery = supabase.from("patients").select("id, status", { count: "exact" })
  if (searchQuery) {
    summaryQuery = summaryQuery.or(
      `full_name.ilike.%${searchQuery}%,patient_number.ilike.%${searchQuery}%,phone_number.ilike.%${searchQuery}%`,
    )
  }
  if (statusFilter) {
    summaryQuery = summaryQuery.eq("status", statusFilter)
  }
  if (genderFilter) {
    summaryQuery = summaryQuery.eq("gender", genderFilter)
  }

  const [{ data: patients }, { data: summaryPatients, count: totalMatches }] = await Promise.all([
    query.range(from, Math.min(to, PAGE_SCAN_LIMIT) - 1),
    summaryQuery.limit(PAGE_SCAN_LIMIT),
  ])

  const activeMatches = summaryPatients?.filter((patient) => patient.status === "active").length || 0
  const inactiveMatches = (summaryPatients?.length || 0) - activeMatches
  const hasNextPage = (patients?.length || 0) === PAGE_SIZE && !scanCapReached

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Patients</h1>
          <p className="text-pretty text-muted-foreground">Manage patient records and information</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/patients/new">
            <Plus className="mr-2 h-4 w-4" />
            Register Patient
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Matching Patients"
          value={totalMatches || 0}
          description="Records in the current filter view"
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Active Patients"
          value={activeMatches}
          description="Active records in current results"
          icon={<UserCheck className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Other Statuses"
          value={inactiveMatches}
          description="Inactive, blocked, or archived in results"
          icon={<UserX className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Patient Directory</CardTitle>
          <CardDescription>Search and view registered patients, 50 per page</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form action="/dashboard/patients" method="get" className="grid gap-3 md:grid-cols-[minmax(0,2fr)_180px_180px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                name="search"
                placeholder="Search by name, patient number, or phone..."
                defaultValue={searchQuery}
                className="pl-9"
              />
            </div>
            <select
              name="status"
              aria-label="Filter by patient status"
              defaultValue={statusFilter}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
            <select
              name="gender"
              aria-label="Filter by gender"
              defaultValue={genderFilter}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All genders</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            <div className="flex gap-2">
              <Button type="submit" variant="outline">
                Apply
              </Button>
              {hasActiveFilters ? (
                <Button type="button" variant="ghost" asChild>
                  <Link href="/dashboard/patients">Reset</Link>
                </Button>
              ) : null}
            </div>
          </form>
          <ReportFilterSummary
            items={[
              { label: "Search", value: searchQuery || null },
              { label: "Status", value: statusFilter || null },
              { label: "Gender", value: genderFilter || null },
            ]}
          />
          {canExport ? (
            <ExportPreviewCard
              title="Export current patient view"
              description="Use the current patient filters, review the matching records above, then export that same slice as CSV."
              href={exportHref}
              previewCount={totalMatches || 0}
              previewLabel="patient records match the current filters"
              limitNote="Exports honor search, status, and gender filters and return up to 5,000 rows."
            />
          ) : null}
          {scanCapReached ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Showing the first {PAGE_SCAN_LIMIT} matching patients. Narrow your filters to view older records.
            </div>
          ) : null}

          <TableCard title="All Patients" description="Full list of registered patients">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient Number</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients && patients.length > 0 ? (
                  patients.map((patient) => (
                    <TableRow key={patient.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{patient.patient_number}</TableCell>
                      <TableCell>{patient.full_name}</TableCell>
                      <TableCell className="capitalize">{patient.gender}</TableCell>
                      <TableCell>{patient.phone_number || "N/A"}</TableCell>
                      <TableCell>
                        <Badge variant={patient.status === "active" ? "default" : "secondary"}>{patient.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/patients/${patient.id}`}>View</Link>
                        </Button>
                        {can(rbacUser, "appointments.manage") ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/appointments/new?patient_id=${patient.id}`}>Appointment</Link>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled
                            title="You don't have permission to book appointments."
                          >
                            Appointment
                          </Button>
                        )}
                        {can(rbacUser, "billing.manage") ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/billing/new?patient_id=${patient.id}`}>Invoice</Link>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled
                            title="You don't have permission to create invoices."
                          >
                            Invoice
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {hasActiveFilters ? "No patients match the selected filters." : "No patients registered yet."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="mt-4 flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                Page {currentPage}
                {scanCapReached ? ` of max ${Math.ceil(PAGE_SCAN_LIMIT / PAGE_SIZE)}` : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="outline" disabled={currentPage <= 1}>
                  <Link href={buildPageHref(currentPage - 1)}>Previous</Link>
                </Button>
                <Button asChild size="sm" variant="outline" disabled={!hasNextPage}>
                  <Link href={buildPageHref(currentPage + 1)}>Next</Link>
                </Button>
              </div>
            </div>
          </TableCard>
        </CardContent>
      </Card>
    </div>
  )
}
