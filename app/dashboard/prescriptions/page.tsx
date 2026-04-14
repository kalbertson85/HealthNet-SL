import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Plus, Search } from "lucide-react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableCard } from "@/components/table-card"
import { ReportFilterSummary } from "@/components/report-filter-summary"
import { ExportPreviewCard } from "@/components/export-preview-card"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { getGlobalSettings } from "@/lib/global-settings"
import { formatDate } from "@/lib/locale-format"

const PRESCRIPTION_LIST_LIMIT = 50

interface PrescriptionRow {
  id: string
  prescription_number: string
  status: string
  created_at: string
  patient_id: string
  visit_id?: string | null
  patients?: { full_name?: string | null; patient_number?: string | null } | null
  profiles?: { full_name?: string | null } | null
}

interface PrescriptionsPageSearchParams {
  q?: string
  status?: string
}

export default async function PrescriptionsPage(props: { searchParams?: Promise<PrescriptionsPageSearchParams> }) {
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()
  const searchParams = props.searchParams ? await props.searchParams : undefined
  const query = (searchParams?.q || "").trim().toLowerCase()
  const statusFilter = (searchParams?.status || "all").trim().toLowerCase()
  const hasActiveFilters = Boolean(query) || statusFilter !== "all"
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  const canExport = can(rbacUser, "admin.export")
  const exportQuery = new URLSearchParams()
  if (query) exportQuery.set("q", query)
  if (statusFilter !== "all") exportQuery.set("status", statusFilter)
  const exportHref = exportQuery.toString()
    ? `/api/export/prescriptions?${exportQuery.toString()}`
    : "/api/export/prescriptions"

  // Fetch prescriptions
  const { data: prescriptions } = await supabase
    .from("prescriptions")
    .select(`
      *,
      patients(full_name, patient_number),
      profiles(full_name)
    `)
      .order("created_at", { ascending: false })
      .limit(PRESCRIPTION_LIST_LIMIT)

  const filteredPrescriptions = ((prescriptions || []) as PrescriptionRow[]).filter((prescription) => {
    if (statusFilter !== "all" && (prescription.status || "").toLowerCase() !== statusFilter) return false
    if (!query) return true

    const haystack = [
      prescription.prescription_number,
      prescription.status,
      prescription.patients?.full_name,
      prescription.patients?.patient_number,
      prescription.profiles?.full_name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()

    return haystack.includes(query)
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "default"
      case "dispensed":
        return "secondary"
      default:
        return "secondary"
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Prescriptions</h1>
          <p className="text-pretty text-muted-foreground">Manage patient prescriptions and medications</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/prescriptions/new">
            <Plus className="mr-2 h-4 w-4" />
            New Prescription
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Prescriptions</CardTitle>
          <CardDescription>Recent prescriptions ordered for patients</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form method="GET" className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                name="q"
                defaultValue={query}
                className="h-8 pl-7 text-xs"
                placeholder="Search by patient, prescription #, or doctor"
              />
            </div>
            <select
              name="status"
              defaultValue={statusFilter}
              aria-label="Filter by prescription status"
              className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="dispensed">Dispensed</option>
            </select>
            <Button type="submit" size="sm" variant="outline">
              Apply
            </Button>
            {hasActiveFilters ? (
              <Button type="button" size="sm" variant="ghost" asChild>
                <Link href="/dashboard/prescriptions">Reset</Link>
              </Button>
            ) : null}
          </form>

          <ReportFilterSummary
            items={[
              { label: "Search", value: query || null },
              { label: "Status", value: statusFilter !== "all" ? statusFilter : null },
            ]}
          />

          {canExport ? (
            <ExportPreviewCard
              title="Export current prescription view"
              description="Use the same search and status filters shown here, review the current preview, then export that slice as CSV."
              href={exportHref}
              previewCount={filteredPrescriptions.length}
              previewLabel="prescriptions are visible in the current preview"
              limitNote="Exports honor prescription search and status filters and return up to 5,000 rows."
              settings={settings}
            />
          ) : null}

          {(prescriptions?.length || 0) >= PRESCRIPTION_LIST_LIMIT ? (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Showing the latest {PRESCRIPTION_LIST_LIMIT} prescriptions. Open patient, billing, or appointment
              follow-up from the relevant record when older prescriptions are needed.
            </div>
          ) : null}
          <TableCard title="All Prescriptions" description="Recent prescriptions ordered for patients">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prescription #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPrescriptions.length > 0 ? (
                  filteredPrescriptions.map((prescription: PrescriptionRow) => (
                    <TableRow key={prescription.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{prescription.prescription_number}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{prescription.patients?.full_name}</p>
                          <p className="text-sm text-muted-foreground">{prescription.patients?.patient_number}</p>
                        </div>
                      </TableCell>
                      <TableCell>Dr. {prescription.profiles?.full_name}</TableCell>
                      <TableCell>{formatDate(prescription.created_at, settings)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(prescription.status)}>{prescription.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/prescriptions/${prescription.id}`}>View</Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/appointments/new?patient_id=${prescription.patient_id}`}>
                            Appointment
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href={prescription.visit_id ? `/dashboard/billing/visit/${prescription.visit_id}` : `/dashboard/billing/new?patient_id=${prescription.patient_id}`}>
                            Invoice
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {hasActiveFilters
                        ? "No prescriptions match the current search or status filter."
                        : "No prescriptions are available right now. Create a new prescription or open a patient record to review medication history."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableCard>
        </CardContent>
      </Card>
    </div>
  )
}
