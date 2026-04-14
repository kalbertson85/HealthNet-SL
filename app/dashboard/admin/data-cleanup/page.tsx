import Link from "next/link"
import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { logAuditEvent } from "@/lib/audit"
import { requireServerActionPermission } from "@/lib/server-action-security"

type PatientRow = {
  id: string
  full_name: string | null
  patient_number: string | null
  phone_number: string | null
  date_of_birth: string | null
  company_id: string | null
  insurance_type: string | null
  insurance_card_number: string | null
  created_at: string | null
}

type EmployeeRow = {
  id: string
  company_id: string | null
  patient_id: string | null
  full_name: string | null
  phone: string | null
  insurance_card_number: string | null
}

type CompanyRow = {
  id: string
  name: string | null
}

type DuplicateCandidate = {
  primary: PatientRow
  secondary: PatientRow
  score: number
  reasons: string[]
}

type CoverageSuggestion = {
  patient: PatientRow
  companyId: string
  companyName: string
  employeeId: string | null
  employeeName: string | null
  confidence: "exact" | "review"
  reasons: string[]
}

const PATIENT_SCAN_LIMIT = 800

function normalizeName(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizePhone(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "")
}

function lastPhoneDigits(value: string | null | undefined) {
  const digits = normalizePhone(value)
  return digits.slice(-7)
}

function buildDuplicateCandidates(patients: PatientRow[]) {
  const candidates: DuplicateCandidate[] = []
  const sorted = [...patients].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))

  for (let index = 0; index < sorted.length; index += 1) {
    const primary = sorted[index]
    const primaryName = normalizeName(primary.full_name)
    const primaryPhone = lastPhoneDigits(primary.phone_number)
    for (let compareIndex = index + 1; compareIndex < sorted.length; compareIndex += 1) {
      const secondary = sorted[compareIndex]
      const secondaryName = normalizeName(secondary.full_name)
      const secondaryPhone = lastPhoneDigits(secondary.phone_number)
      const reasons: string[] = []
      let score = 0

      if (primaryName && primaryName === secondaryName) {
        score += 70
        reasons.push("same normalized name")
      }

      if (primaryPhone && secondaryPhone && primaryPhone === secondaryPhone) {
        score += 25
        reasons.push("same phone suffix")
      }

      if (primary.date_of_birth && secondary.date_of_birth && primary.date_of_birth === secondary.date_of_birth) {
        score += 20
        reasons.push("same date of birth")
      }

      if (primary.insurance_card_number && secondary.insurance_card_number && primary.insurance_card_number === secondary.insurance_card_number) {
        score += 30
        reasons.push("same insurance card")
      }

      if (score >= 70) {
        candidates.push({ primary, secondary, score, reasons })
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 50)
}

function buildCoverageSuggestions(
  patients: PatientRow[],
  invoices: Array<{ patient_id: string | null; company_id: string | null }>,
  employees: EmployeeRow[],
  companies: CompanyRow[],
) {
  const companyNameById = new Map(companies.map((company) => [company.id, company.name || "Unknown company"]))
  const patientById = new Map(patients.map((patient) => [patient.id, patient]))
  const suggestions: CoverageSuggestion[] = []
  const candidatePatientIds = Array.from(
    new Set(
      invoices
        .filter((row) => row.patient_id && row.company_id)
        .map((row) => row.patient_id as string)
        .filter(Boolean),
    ),
  )

  for (const patientId of candidatePatientIds) {
    const patient = patientById.get(patientId)
    if (!patient) continue
    if (patient.company_id && patient.insurance_type) continue

    const companyId = invoices.find((row) => row.patient_id === patientId)?.company_id
    if (!companyId) continue

    const companyEmployees = employees.filter((employee) => employee.company_id === companyId)
    const reasons: string[] = []
    let employeeMatch: EmployeeRow | null = null
    let confidence: "exact" | "review" = "review"

    if (patient.insurance_card_number) {
      employeeMatch =
        companyEmployees.find((employee) => employee.insurance_card_number && employee.insurance_card_number === patient.insurance_card_number) ||
        null
      if (employeeMatch) {
        confidence = "exact"
        reasons.push("insurance card matches employee roster")
      }
    }

    if (!employeeMatch) {
      const patientName = normalizeName(patient.full_name)
      const patientPhone = lastPhoneDigits(patient.phone_number)
      employeeMatch =
        companyEmployees.find((employee) => {
          const sameName = patientName && patientName === normalizeName(employee.full_name)
          const samePhone = patientPhone && patientPhone === lastPhoneDigits(employee.phone)
          return sameName || (sameName && samePhone)
        }) || null
      if (employeeMatch) {
        reasons.push("name or phone is similar to employee roster")
      }
    }

    suggestions.push({
      patient,
      companyId,
      companyName: companyNameById.get(companyId) || "Unknown company",
      employeeId: employeeMatch?.id ?? null,
      employeeName: employeeMatch?.full_name ?? null,
      confidence,
      reasons: reasons.length > 0 ? reasons : ["company invoice exists but roster match needs review"],
    })
  }

  return suggestions.sort((a, b) => {
    if (a.confidence === b.confidence) return (a.patient.full_name || "").localeCompare(b.patient.full_name || "")
    return a.confidence === "exact" ? -1 : 1
  })
}

export default async function AdminDataCleanupPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; error?: string }>
}) {
  const supabase = await createServerClient()
  const { user } = await getSessionUserAndProfile()
  const sp = searchParams ? await searchParams : undefined

  if (!user) redirect("/auth/login")
  if (!can(user, "admin.settings.manage")) redirect("/dashboard")

  async function applyExactCoverageLinks() {
    "use server"

    const { supabase, user } = await requireServerActionPermission("admin.settings.manage")

    const [{ data: patientsRaw }, { data: companyInvoicesRaw }, { data: employeesRaw }, { data: companiesRaw }] =
      await Promise.all([
        supabase
          .from("patients")
          .select("id, full_name, patient_number, phone_number, date_of_birth, company_id, insurance_type, insurance_card_number, created_at")
          .order("created_at", { ascending: false })
          .limit(PATIENT_SCAN_LIMIT),
        supabase.from("invoices").select("patient_id, company_id").eq("payer_type", "company").limit(2000),
        supabase.from("company_employees").select("id, company_id, patient_id, full_name, phone, insurance_card_number").limit(2000),
        supabase.from("companies").select("id, name").limit(500),
      ])

    const suggestions = buildCoverageSuggestions(
      (patientsRaw || []) as PatientRow[],
      (companyInvoicesRaw || []) as Array<{ patient_id: string | null; company_id: string | null }>,
      (employeesRaw || []) as EmployeeRow[],
      (companiesRaw || []) as CompanyRow[],
    ).filter((row) => row.confidence === "exact" && row.employeeId)

    for (const suggestion of suggestions) {
      const previousSnapshot = {
        company_id: suggestion.patient.company_id,
        insurance_type: suggestion.patient.insurance_type,
        employee_id: null as string | null,
      }
      const { data: currentPatient, error: currentPatientError } = await supabase
        .from("patients")
        .select("id, company_id, insurance_type, employee_id")
        .eq("id", suggestion.patient.id)
        .maybeSingle()
      if (currentPatientError || !currentPatient?.id) {
        redirect("/dashboard/admin/data-cleanup?error=patient_lookup_failed")
      }
      previousSnapshot.employee_id = (currentPatient.employee_id as string | null) ?? null

      const { error: patientUpdateError } = await supabase
        .from("patients")
        .update({
          company_id: suggestion.companyId,
          insurance_type: "employee",
          employee_id: suggestion.employeeId,
        })
        .eq("id", suggestion.patient.id)
      if (patientUpdateError) {
        redirect("/dashboard/admin/data-cleanup?error=patient_update_failed")
      }

      const { error: adminAuditError } = await supabase.from("admin_audit_logs").insert({
        actor_user_id: user.id,
        target_user_id: user.id,
        action: "patient_coverage_bulk_linked",
        notes: `Linked patient ${suggestion.patient.id} to company ${suggestion.companyId} employee ${suggestion.employeeId}`,
      })
      if (adminAuditError) {
        await supabase
          .from("patients")
          .update({
            company_id: previousSnapshot.company_id,
            insurance_type: previousSnapshot.insurance_type,
            employee_id: previousSnapshot.employee_id,
          })
          .eq("id", suggestion.patient.id)
        redirect("/dashboard/admin/data-cleanup?error=audit_log_failed")
      }

      await logAuditEvent({
        action: "patient.coverage_bulk_linked",
        entityType: "patient",
        entityId: suggestion.patient.id,
        user,
        metadata: {
          patient_id: suggestion.patient.id,
          company_id: suggestion.companyId,
          employee_id: suggestion.employeeId,
          source: "admin_data_cleanup",
          confidence: suggestion.confidence,
        },
        before: {
          company_id: suggestion.patient.company_id,
          insurance_type: suggestion.patient.insurance_type,
        },
        after: {
          company_id: suggestion.companyId,
          insurance_type: "employee",
          employee_id: suggestion.employeeId,
        },
      })
    }

    redirect("/dashboard/admin/data-cleanup?status=applied")
  }

  const [{ data: patientsRaw }, { data: companyInvoicesRaw }, { data: employeesRaw }, { data: companiesRaw }] = await Promise.all([
    supabase
      .from("patients")
      .select("id, full_name, patient_number, phone_number, date_of_birth, company_id, insurance_type, insurance_card_number, created_at")
      .order("created_at", { ascending: false })
      .limit(PATIENT_SCAN_LIMIT),
    supabase.from("invoices").select("patient_id, company_id").eq("payer_type", "company").limit(2000),
    supabase.from("company_employees").select("id, company_id, patient_id, full_name, phone, insurance_card_number").limit(2000),
    supabase.from("companies").select("id, name").limit(500),
  ])

  const patients = (patientsRaw || []) as PatientRow[]
  const companyInvoices = (companyInvoicesRaw || []) as Array<{ patient_id: string | null; company_id: string | null }>
  const employees = (employeesRaw || []) as EmployeeRow[]
  const companies = (companiesRaw || []) as CompanyRow[]

  const duplicateCandidates = buildDuplicateCandidates(patients)
  const coverageSuggestions = buildCoverageSuggestions(patients, companyInvoices, employees, companies)
  const exactCoverageSuggestions = coverageSuggestions.filter((row) => row.confidence === "exact")
  const reviewCoverageSuggestions = coverageSuggestions.filter((row) => row.confidence === "review")

  return (
    <div className="space-y-6">
      {sp?.status === "applied" ? (
        <div className="rounded-md border border-emerald-400/40 bg-emerald-500/5 p-3 text-sm text-emerald-700">
          Exact coverage links applied successfully.
        </div>
      ) : null}
      {sp?.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {sp.error === "patient_lookup_failed" && "Unable to load patient state before bulk linking."}
          {sp.error === "patient_update_failed" && "Unable to apply one or more patient coverage links."}
          {sp.error === "audit_log_failed" && "Bulk coverage link audit failed and the latest change was rolled back."}
          {!["patient_lookup_failed", "patient_update_failed", "audit_log_failed"].includes(sp.error) &&
            "Unable to complete bulk coverage linking."}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Data cleanup</h1>
          <p className="text-sm text-muted-foreground">
            Review duplicate patients and bulk-fix exact company linkage matches without creating destructive merge tools.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/admin">Back to Admin</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Patients scanned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{patients.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Duplicate candidates</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{duplicateCandidates.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Exact linkage fixes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{exactCoverageSuggestions.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Duplicate patient detection</CardTitle>
          <CardDescription>
            Fuzzy review based on normalized name, phone suffix, date of birth, and insurance card overlap.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {duplicateCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No high-confidence duplicate candidates were found in the current scan window.</p>
          ) : (
            duplicateCandidates.map((candidate) => (
              <div key={`${candidate.primary.id}-${candidate.secondary.id}`} className="rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {candidate.primary.full_name || "Unknown"} ↔ {candidate.secondary.full_name || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Score {candidate.score} · {candidate.reasons.join(", ")}
                    </p>
                  </div>
                  <Badge variant="outline">Review</Badge>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm">
                  <div className="rounded-md bg-muted/20 p-3">
                    <p className="font-medium">{candidate.primary.patient_number || "-"}</p>
                    <p>{candidate.primary.phone_number || "-"}</p>
                    <p>{candidate.primary.date_of_birth || "-"}</p>
                    <div className="mt-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/patients/${candidate.primary.id}`}>Open primary</Link>
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/20 p-3">
                    <p className="font-medium">{candidate.secondary.patient_number || "-"}</p>
                    <p>{candidate.secondary.phone_number || "-"}</p>
                    <p>{candidate.secondary.date_of_birth || "-"}</p>
                    <div className="mt-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/patients/${candidate.secondary.id}`}>Open secondary</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Company linkage suggestions</CardTitle>
              <CardDescription>
                Uses company-paid invoices plus employee roster data to suggest missing patient insurance linkage.
              </CardDescription>
            </div>
            <form action={applyExactCoverageLinks}>
              <Button type="submit" size="sm" disabled={exactCoverageSuggestions.length === 0}>
                Apply all exact matches
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {coverageSuggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No missing company linkage suggestions were found in the current scan window.</p>
          ) : (
            <>
              {exactCoverageSuggestions.length > 0 ? (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  {exactCoverageSuggestions.length} exact employee roster matches can be bulk-applied safely.
                </div>
              ) : null}
              {coverageSuggestions.map((suggestion) => (
                <div key={suggestion.patient.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{suggestion.patient.full_name || "Unknown patient"}</p>
                      <p className="text-xs text-muted-foreground">
                        {suggestion.patient.patient_number || "-"} · {suggestion.companyName}
                      </p>
                    </div>
                    <Badge variant={suggestion.confidence === "exact" ? "secondary" : "outline"}>
                      {suggestion.confidence === "exact" ? "Exact match" : "Needs review"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{suggestion.reasons.join(", ")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/patients/${suggestion.patient.id}`}>Open patient</Link>
                    </Button>
                    {suggestion.employeeId ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/settings/companies/${suggestion.companyId}/employees`}>Open roster</Link>
                      </Button>
                    ) : null}
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/reports/company-billing?company_id=${suggestion.companyId}#linkage-audit`}>
                        Open linkage audit
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
              {reviewCoverageSuggestions.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Review-only suggestions are intentionally not auto-applied. Use the linkage audit to confirm the correct principal employee or dependent relationship first.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
