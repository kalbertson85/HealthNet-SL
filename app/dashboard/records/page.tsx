import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Search } from "lucide-react"
import { ReportFilterSummary } from "@/components/report-filter-summary"
import {
  ensureTodayVisitForRecords,
  fetchTodaysVisitsByPatientIds,
  searchRecordsPatients,
  type PatientRow,
  type VisitRow,
} from "@/lib/records/queries"

const PAGE_SIZE = 20
const MAX_SEARCH_LENGTH = 80

export const revalidate = 0

export default async function RecordsPage(props: {
  searchParams?: Promise<{ q?: string; error?: string; page?: string }>
}) {
  const supabase = await createServerClient()

  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const searchQuery = (resolvedSearchParams?.q || "").trim().slice(0, MAX_SEARCH_LENGTH)
  const currentPage = Math.max(1, Number.parseInt((resolvedSearchParams?.page || "1").trim(), 10) || 1)
  const errorCode = resolvedSearchParams?.error

  const errorMessage = (() => {
    switch (errorCode) {
      case "missing_patient":
        return "We could not find a patient matching that ID or patient number. Please check and try again."
      default:
        return null
    }
  })()

  let patients: PatientRow[] = []
  let totalMatched = 0
  let hasNextPage = false
  const isLikelyId = searchQuery.length === 36 && searchQuery.includes("-")
  const hasSearchQuery = searchQuery.length > 0
  const isSearchTooShort = hasSearchQuery && !isLikelyId && searchQuery.length < 2

  if (hasSearchQuery && !isSearchTooShort) {
    const result = await searchRecordsPatients(supabase, searchQuery, currentPage, PAGE_SIZE, isLikelyId)
    patients = result.patients
    totalMatched = result.totalMatched
    hasNextPage = result.hasNextPage
  }

  const todaysVisitsByPatientId = new Map<string, VisitRow>()

  if (patients.length > 0) {
    const visitMap = await fetchTodaysVisitsByPatientIds(
      supabase,
      patients.map((patient) => patient.id),
    )
    for (const [patientId, visit] of visitMap.entries()) {
      todaysVisitsByPatientId.set(patientId, visit as VisitRow)
    }
  }

  const buildQueryString = (page: number) => {
    const params = new URLSearchParams()
    if (searchQuery) params.set("q", searchQuery)
    if (page > 1) params.set("page", String(page))
    return params.toString()
  }

  async function ensureVisit(formData: FormData) {
    "use server"

    const supabase = await createServerClient()

    const patientId = (formData.get("patient_id") as string | null) ?? null

    if (!patientId) {
      redirect("/dashboard/records?error=missing_patient")
    }

    const result = await ensureTodayVisitForRecords(supabase, patientId)
    if (!result.ok) {
      redirect("/dashboard/records")
    }

    redirect(`/dashboard/records/visit/${result.visitId}`)
  }

  const formatAge = (dob?: string | null) => {
    if (!dob) return "-"
    try {
      const birth = new Date(dob)
      const years = Math.floor((Date.now() - birth.getTime()) / 31557600000)
      return `${years}y`
    } catch {
      return "-"
    }
  }

  return (
    <div className="space-y-8">
      {errorMessage && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Records</h1>
          <p className="text-pretty text-muted-foreground">
            Records staff can look up a patient, start today&apos;s visit, and print a compact patient card.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Find patient</CardTitle>
          <CardDescription>Search by patient number (e.g. PT-123456) or name.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="GET" className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1 space-y-1">
              <Label htmlFor="q">Patient number or name</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="q"
                  name="q"
                  defaultValue={searchQuery}
                  placeholder="PT-000001 or Mary Bull"
                  className="flex-1"
                />
                <Button type="submit" variant="default" size="icon" aria-label="Search patients">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {searchQuery ? (
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/records">Reset</Link>
              </Button>
            ) : null}
          </form>
          <div className="mt-4">
            <ReportFilterSummary items={[{ label: "Search", value: searchQuery || null }]} />
          </div>
        </CardContent>
      </Card>

      {searchQuery && (
        <Card>
          <CardHeader>
            <CardTitle>Search results</CardTitle>
            <CardDescription>
              {isSearchTooShort
                ? "Enter at least 2 characters when searching by name or patient number."
                : patients.length === 0
                ? "No patients match that query. Try a different patient number or name."
                : "Select a patient to start or continue today's visit and print a card."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isSearchTooShort && patients.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Showing page {currentPage}, {patients.length} result{patients.length === 1 ? "" : "s"}
                {totalMatched ? ` (at least ${totalMatched} matched so far)` : ""}.
              </p>
            ) : null}

            {patients.map((p) => {
              const todayVisit = todaysVisitsByPatientId.get(p.id)

              return (
                <div key={p.id} className="rounded-md border p-3 text-sm flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">{p.full_name || "Unknown patient"}</p>
                    <p className="text-xs text-muted-foreground">
                      {(p.patient_number || "-") + " | Age " + formatAge(p.date_of_birth)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={ensureVisit}>
                      <input type="hidden" name="patient_id" value={p.id} />
                      <Button type="submit" size="sm">
                        {todayVisit ? "Open visit handoff" : "Start visit handoff"}
                      </Button>
                    </form>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/records/patient-card/${p.id}`} prefetch={false}>
                        Print patient card
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/dashboard/patients/${p.id}`}>View full record</Link>
                    </Button>
                  </div>
                </div>
              )
            })}

            {!isSearchTooShort && (currentPage > 1 || hasNextPage) ? (
              <div className="mt-2 flex items-center justify-end gap-2">
                {currentPage > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/records?${buildQueryString(currentPage - 1)}`} prefetch={false}>
                      Previous
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Previous
                  </Button>
                )}
                {hasNextPage ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/records?${buildQueryString(currentPage + 1)}`} prefetch={false}>
                      Next
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Next
                  </Button>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
