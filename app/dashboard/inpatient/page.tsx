import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Bed } from "lucide-react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableCard } from "@/components/table-card"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"

const PAGE_SIZE = 25
const PAGE_SCAN_LIMIT = 250

interface AdmissionRow {
  id: string
  admission_number: string
  admission_date: string
  status: string
  patient_id: string
  visit_id?: string | null
  patients?:
    | {
        full_name?: string | null
        patient_number?: string | null
      }
    | Array<{
        full_name?: string | null
        patient_number?: string | null
      }>
    | null
  wards?:
    | {
        name?: string | null
      }
    | Array<{
        name?: string | null
      }>
    | null
  beds?:
    | {
        bed_number?: string | null
      }
    | Array<{
        bed_number?: string | null
      }>
    | null
  profiles?:
    | {
        full_name?: string | null
      }
    | Array<{
        full_name?: string | null
      }>
    | null
  visits?: {
    is_free_health_care?: boolean | null
    facilities?:
      | {
          name?: string | null
          code?: string | null
        }
      | Array<{
          name?: string | null
          code?: string | null
        }>
      | null
  } | Array<{
    is_free_health_care?: boolean | null
    facilities?:
      | {
          name?: string | null
          code?: string | null
        }
      | Array<{
          name?: string | null
          code?: string | null
        }>
      | null
  }> | null
}

interface WardRow {
  id: string
  name: string
  ward_number: string
  total_beds: number
  available_beds: number
  status: string
}

interface BedRow {
  id: string
  ward_id: string
  bed_number: string
  bed_type: string | null
  status: string
}

function normalizeSingle<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) {
    return null
  }
  return Array.isArray(relation) ? (relation[0] ?? null) : relation
}

export default async function InpatientPage(props: { searchParams?: Promise<{ page?: string }> }) {
  const supabase = await createServerClient()

  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "inpatient.manage")) {
    redirect("/dashboard")
  }
  const sp = props.searchParams ? await props.searchParams : undefined
  const parsedPage = Number.parseInt(sp?.page || "1", 10)
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE
  const scanCapReached = to >= PAGE_SCAN_LIMIT

  // Fetch admissions, wards, beds, and visit context (FHC + facility)
  const [{ data: admissions }, { data: wards }, { data: beds }] = await Promise.all([
    supabase
      .from("admissions")
      .select(`
        id, admission_number, admission_date, status, patient_id, visit_id,
        patients(full_name, patient_number),
        wards(name, ward_number),
        beds(bed_number),
        profiles(full_name),
        visits(is_free_health_care, facilities(name, code))
      `)
      .order("admission_date", { ascending: false })
      .range(from, Math.min(to, PAGE_SCAN_LIMIT) - 1),
    supabase.from("wards").select("id, name, ward_number, total_beds, available_beds, status").order("ward_number"),
    supabase.from("beds").select("id, ward_id, bed_number, bed_type, status").order("ward_id, bed_number"),
  ])
  const hasNextPage = (admissions?.length || 0) === PAGE_SIZE && !scanCapReached
  const buildPageHref = (page: number) => (page <= 1 ? "/dashboard/inpatient" : `/dashboard/inpatient?page=${page}`)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Inpatient Management</h1>
          <p className="text-pretty text-muted-foreground">Manage patient admissions and ward assignments</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/inpatient/new">
            <Plus className="mr-2 h-4 w-4" />
            New Admission
          </Link>
        </Button>
      </div>
      {scanCapReached ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Showing the first {PAGE_SCAN_LIMIT} admissions. Use narrower time windows for older records.
        </div>
      ) : null}

      {/* Wards Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        {(wards as WardRow[] | null | undefined)?.map((ward) => {
          const occupancyRate =
            ward.total_beds > 0 ? (((ward.total_beds - ward.available_beds) / ward.total_beds) * 100).toFixed(0) : 0

          const wardBeds = (beds as BedRow[] | null | undefined)?.filter((b) => b.ward_id === ward.id) || []

          return (
            <Card key={ward.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{ward.name}</CardTitle>
                    <CardDescription>Ward {ward.ward_number}</CardDescription>
                  </div>
                  <Bed className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Occupancy</span>
                    <span className="font-medium">{occupancyRate}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Available Beds</span>
                    <span className="font-medium">
                      {ward.available_beds} / {ward.total_beds}
                    </span>
                  </div>
                  <Badge variant={ward.status === "active" ? "default" : "secondary"} className="w-full justify-center">
                    {ward.status}
                  </Badge>
                  {wardBeds.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Beds</p>
                      <div className="flex flex-wrap gap-1">
                        {wardBeds.map((bed: BedRow) => {
                          const isAvailable = bed.status === "available"
                          const isOccupied = bed.status === "occupied"

                          const baseClasses = "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] border"
                          const statusClasses = isAvailable
                            ? "border-emerald-500 text-emerald-600 bg-emerald-50"
                            : isOccupied
                              ? "border-amber-500 text-amber-700 bg-amber-50"
                              : "border-muted text-muted-foreground bg-muted/40"

                          return (
                            <span key={bed.id} className={`${baseClasses} ${statusClasses}`}>
                              {bed.bed_number}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Admissions</CardTitle>
          <CardDescription>List of all inpatient admissions</CardDescription>
        </CardHeader>
        <CardContent>
          <TableCard title="All Admissions" description="List of all inpatient admissions">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Ward/Bed</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Admission Date</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admissions && admissions.length > 0 ? (
                  admissions.map((admission: AdmissionRow) => (
                    <TableRow key={admission.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{admission.admission_number}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{normalizeSingle(admission.patients)?.full_name}</p>
                          <p className="text-sm text-muted-foreground">{normalizeSingle(admission.patients)?.patient_number}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {normalizeSingle(admission.wards)?.name} - Bed {normalizeSingle(admission.beds)?.bed_number}
                        {admission.visit_id && (
                          <div className="mt-1 text-xs">
                            <a
                              href={`/dashboard/billing/visit/${admission.visit_id}`}
                              className="text-emerald-700 underline-offset-2 hover:underline"
                            >
                              Linked visit – billing
                            </a>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-xs">
                          {normalizeSingle(admission.visits)?.is_free_health_care && (
                            <Badge variant="secondary" className="w-fit text-[11px]">
                              Free Health Care
                            </Badge>
                          )}
                          {normalizeSingle(normalizeSingle(admission.visits)?.facilities)?.name && (
                            <span className="text-muted-foreground">
                              {normalizeSingle(normalizeSingle(admission.visits)?.facilities)?.name}
                              {normalizeSingle(normalizeSingle(admission.visits)?.facilities)?.code
                                ? ` (${normalizeSingle(normalizeSingle(admission.visits)?.facilities)?.code})`
                                : ""}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{new Date(admission.admission_date).toLocaleDateString()}</TableCell>
                      <TableCell>Dr. {normalizeSingle(admission.profiles)?.full_name}</TableCell>
                      <TableCell>
                        <Badge variant={admission.status === "active" ? "default" : "secondary"}>
                          {admission.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/inpatient/${admission.id}`}>View</Link>
                        </Button>
                        {can(rbacUser, "appointments.manage") ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/appointments/new?patient_id=${admission.patient_id}`}>
                              Appointment
                            </Link>
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
                            <Link href={`/dashboard/billing/new?patient_id=${admission.patient_id}`}>Invoice</Link>
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
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No admissions found
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
