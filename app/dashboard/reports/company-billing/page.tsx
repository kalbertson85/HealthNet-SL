import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import Link from "next/link"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ReportFilterSummary } from "@/components/report-filter-summary"
import { fetchCompanyCoverageMap } from "@/lib/billing/company-coverage"
import { getGlobalSettings } from "@/lib/global-settings"
import { formatCurrency, formatDate as formatLocalizedDate } from "@/lib/locale-format"
import { logAuditEvent } from "@/lib/audit"
import { requireServerActionPermission } from "@/lib/server-action-security"
import { z } from "zod"

interface CompanyBillingReportsPageProps {
  searchParams: Promise<{
    company_id?: string
    from?: string
    to?: string
    status?: string
    page?: string
    bulk_applied?: string
    bulk_skipped?: string
    bulk_failed?: string
  }>
}

interface InvoiceRow {
  id: string
  invoice_number: string | null
  total_amount: number | null
  paid_amount: number | null
  status: string | null
  created_at: string | null
  payment_date: string | null
  payer_type: string | null
  company_id: string | null
  patient_id: string | null
  visit_id: string | null
  companies?: { name?: string | null } | null
}
interface CompanyLite {
  id: string
  name: string | null
}
interface PatientLite {
  id: string
  full_name: string | null
  patient_number: string | null
  phone_number?: string | null
  company_id?: string | null
  insurance_type?: string | null
  insurance_card_number?: string | null
  insurance_expiry_date?: string | null
  employee_id?: string | null
}

interface EmployeeRosterLite {
  id: string
  full_name: string | null
  patient_id?: string | null
  insurance_card_number?: string | null
  status?: string | null
}

const MAX_COMPANY_BILLING_ROWS = 2000
const COMPANY_BILLING_PAGE_SIZE = 100

function parseReportDate(value: string | null, fallback: Date) {
  if (!value) return fallback
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function normalizeInsuranceCard(value: string | null | undefined) {
  return (value || "").trim().toUpperCase()
}

type LinkageSuggestion = {
  linkageType: "employee" | "dependent"
  principalEmployeeId: string
  dependentRelationship: string
  reason: string
}

function suggestLinkage(
  patient: Pick<PatientLite, "id" | "insurance_type" | "insurance_card_number" | "employee_id">,
  employeeById: Map<string, EmployeeRosterLite>,
  employeeByCard: Map<string, EmployeeRosterLite>,
) {
  const patientCard = normalizeInsuranceCard(patient.insurance_card_number)
  const cardMatchedEmployee = patientCard ? employeeByCard.get(patientCard) || null : null
  const employeeIdFromPatient = patient.employee_id && employeeById.has(patient.employee_id) ? patient.employee_id : ""

  let suggestion: LinkageSuggestion = {
    linkageType: "employee",
    principalEmployeeId: "",
    dependentRelationship: "Spouse",
    reason: "Default employee linkage",
  }

  if ((patient.insurance_type || "").toLowerCase() === "dependent") {
    suggestion = {
      linkageType: "dependent",
      principalEmployeeId: employeeIdFromPatient || cardMatchedEmployee?.id || "",
      dependentRelationship: "Dependent",
      reason: employeeIdFromPatient
        ? "Suggested from patient insurance type + employee reference"
        : cardMatchedEmployee
          ? "Suggested from insurance card roster match"
          : "Dependent selected from patient insurance type",
    }
  } else if ((patient.insurance_type || "").toLowerCase() === "employee") {
    if (cardMatchedEmployee && cardMatchedEmployee.patient_id && cardMatchedEmployee.patient_id !== patient.id) {
      suggestion = {
        linkageType: "dependent",
        principalEmployeeId: cardMatchedEmployee.id,
        dependentRelationship: "Dependent",
        reason: "Card matches another employee record; dependent linkage suggested",
      }
    } else {
      suggestion = {
        linkageType: "employee",
        principalEmployeeId: "",
        dependentRelationship: "Spouse",
        reason: cardMatchedEmployee ? "Suggested from insurance card roster match" : "Suggested from patient insurance type",
      }
    }
  } else if (cardMatchedEmployee) {
    if (cardMatchedEmployee.patient_id && cardMatchedEmployee.patient_id !== patient.id) {
      suggestion = {
        linkageType: "dependent",
        principalEmployeeId: cardMatchedEmployee.id,
        dependentRelationship: "Dependent",
        reason: "Card matches principal employee in roster",
      }
    } else {
      suggestion = {
        linkageType: "employee",
        principalEmployeeId: "",
        dependentRelationship: "Spouse",
        reason: "Card matches employee roster",
      }
    }
  }

  return suggestion
}

export default async function CompanyBillingReportsPage({ searchParams }: CompanyBillingReportsPageProps) {
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }

  if (!can(rbacUser, "reports.view") && !can(rbacUser, "admin.export") && !can(rbacUser, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const sp = await searchParams
  const selectedCompanyId = (sp.company_id || "").trim() || null
  const statusFilter = (sp.status || "all").toLowerCase().trim()
  const fromParam = (sp.from || "").trim()
  const toParam = (sp.to || "").trim()
  const currentPage = Math.max(1, Number.parseInt((sp.page || "1").trim(), 10) || 1)
  const hasActiveFilters = Boolean(selectedCompanyId) || statusFilter !== "all" || Boolean(fromParam) || Boolean(toParam)

  const today = new Date()
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const fromDate = parseReportDate(fromParam || null, startOfMonth)
  const toDate = parseReportDate(toParam || null, endOfMonth)
  const fromDateValue = fromDate.toISOString().split("T")[0]
  const toDateValue = toDate.toISOString().split("T")[0]

  const fromIso = fromDate.toISOString()
  const toIso = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999).toISOString()

  async function backfillCompanyCoverage(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("admin.settings.manage")
    const parsed = z
      .object({
        company_id: z.string().uuid(),
        patient_id: z.string().uuid(),
        linkage_type: z.enum(["employee", "dependent"]),
        principal_employee_id: z.string().uuid().optional(),
        dependent_relationship: z.string().trim().max(100).optional(),
        from: z.string().trim().max(50).optional(),
        to: z.string().trim().max(50).optional(),
        status: z.string().trim().max(50).optional(),
      })
      .safeParse({
        company_id: formData.get("company_id"),
        patient_id: formData.get("patient_id"),
        linkage_type: formData.get("linkage_type"),
        principal_employee_id: formData.get("principal_employee_id") || undefined,
        dependent_relationship: formData.get("dependent_relationship"),
        from: formData.get("from"),
        to: formData.get("to"),
        status: formData.get("status"),
      })

    if (!parsed.success) {
      redirect("/dashboard/reports/company-billing")
    }
    const companyId = parsed.data.company_id
    const patientId = parsed.data.patient_id
    const linkageType = parsed.data.linkage_type
    const principalEmployeeId = parsed.data.principal_employee_id || null
    const dependentRelationship = parsed.data.dependent_relationship || null
    const from = parsed.data.from || ""
    const to = parsed.data.to || ""
    const status = parsed.data.status || ""

    const { data: patient } = await supabase
      .from("patients")
      .select("id, full_name, phone_number, company_id, insurance_type, employee_id, insurance_card_number, insurance_expiry_date, insurance_card_serial, insurance_mobile")
      .eq("id", patientId)
      .maybeSingle()

    if (!patient?.id) {
      redirect("/dashboard/reports/company-billing")
    }

    const statusValue = patient.insurance_expiry_date
      ? new Date(patient.insurance_expiry_date).getTime() >= new Date(new Date().setHours(0, 0, 0, 0)).getTime()
        ? "active"
        : "expired"
      : "missing"

    const { data: originalEmployee } = await supabase
      .from("company_employees")
      .select(
        "id, company_id, patient_id, full_name, phone, insurance_card_number, insurance_card_serial, insurance_expiry_date, status",
      )
      .eq("patient_id", patientId)
      .maybeSingle()
    const { data: originalDependentRows } = await supabase
      .from("employee_dependents")
      .select(
        "id, employee_id, patient_id, full_name, relationship, insurance_card_number, insurance_card_serial, insurance_expiry_date, status",
      )
      .eq("patient_id", patientId)

    const rollbackLinkage = async () => {
      await supabase
        .from("patients")
        .update({
          company_id: patient.company_id ?? null,
          insurance_type: patient.insurance_type ?? null,
          employee_id: patient.employee_id ?? null,
        })
        .eq("id", patientId)

      await supabase.from("employee_dependents").delete().eq("patient_id", patientId)
      if ((originalDependentRows || []).length > 0) {
        await supabase.from("employee_dependents").upsert(originalDependentRows || [], { onConflict: "patient_id" })
      }

      if (originalEmployee?.id) {
        await supabase
          .from("company_employees")
          .upsert(
            {
              id: originalEmployee.id,
              company_id: originalEmployee.company_id,
              patient_id: originalEmployee.patient_id,
              full_name: originalEmployee.full_name,
              phone: originalEmployee.phone,
              insurance_card_number: originalEmployee.insurance_card_number,
              insurance_card_serial: originalEmployee.insurance_card_serial,
              insurance_expiry_date: originalEmployee.insurance_expiry_date,
              status: originalEmployee.status,
            },
            { onConflict: "patient_id" },
          )
      } else {
        await supabase.from("company_employees").delete().eq("patient_id", patientId)
      }
    }

    const { error: clearDependentsError } = await supabase.from("employee_dependents").delete().eq("patient_id", patientId)
    if (clearDependentsError) {
      redirect(`/dashboard/reports/company-billing?company_id=${companyId}&from=${from}&to=${to}&status=${status || "all"}`)
    }

    if (linkageType === "employee") {
      const { data: employeeRow, error: employeeUpsertError } = await supabase
        .from("company_employees")
        .upsert(
          {
            company_id: companyId,
            patient_id: patientId,
            full_name: patient.full_name || "Unknown patient",
            phone: patient.phone_number || null,
            insurance_card_number: patient.insurance_card_number || null,
            insurance_expiry_date: patient.insurance_expiry_date || new Date().toISOString().slice(0, 10),
            status: statusValue,
          },
          { onConflict: "patient_id" },
        )
        .select("id")
        .maybeSingle()
      if (employeeUpsertError) {
        await rollbackLinkage()
        redirect(`/dashboard/reports/company-billing?company_id=${companyId}&from=${from}&to=${to}&status=${status || "all"}`)
      }

      const { error: patientUpdateError } = await supabase
        .from("patients")
        .update({
          company_id: companyId,
          insurance_type: "employee",
          employee_id: employeeRow?.id ?? null,
        })
        .eq("id", patientId)
      if (patientUpdateError) {
        await rollbackLinkage()
        redirect(`/dashboard/reports/company-billing?company_id=${companyId}&from=${from}&to=${to}&status=${status || "all"}`)
      }

      await logAuditEvent({
        action: "patient.coverage_linked",
        entityType: "patient",
        entityId: patientId,
        user,
        metadata: {
          patient_id: patientId,
          company_id: companyId,
          linkage_type: "employee",
          source: "company_billing_audit",
        },
        before: {
          company_id: patient.company_id as string | null,
          insurance_type: patient.insurance_type as string | null,
          employee_id: patient.employee_id as string | null,
        },
        after: {
          company_id: companyId,
          insurance_type: "employee",
          employee_id: employeeRow?.id ?? null,
        },
      })
    } else {
      if (!principalEmployeeId) {
        redirect(`/dashboard/reports/company-billing?company_id=${companyId}&from=${from}&to=${to}&status=${status || "all"}`)
      }

      const { data: principalEmployee } = await supabase
        .from("company_employees")
        .select("id")
        .eq("id", principalEmployeeId)
        .eq("company_id", companyId)
        .maybeSingle()

      if (!principalEmployee?.id) {
        redirect(`/dashboard/reports/company-billing?company_id=${companyId}&from=${from}&to=${to}&status=${status || "all"}`)
      }

      const { error: employeeDeleteError } = await supabase.from("company_employees").delete().eq("patient_id", patientId)
      if (employeeDeleteError) {
        await rollbackLinkage()
        redirect(`/dashboard/reports/company-billing?company_id=${companyId}&from=${from}&to=${to}&status=${status || "all"}`)
      }

      const { error: dependentUpsertError } = await supabase
        .from("employee_dependents")
        .upsert(
          {
            employee_id: principalEmployee.id,
            patient_id: patientId,
            full_name: patient.full_name || "Unknown patient",
            relationship: dependentRelationship || "Dependent",
            insurance_card_number: patient.insurance_card_number || null,
            insurance_expiry_date: patient.insurance_expiry_date || new Date().toISOString().slice(0, 10),
            status: statusValue,
          },
          { onConflict: "patient_id" },
        )
      if (dependentUpsertError) {
        await rollbackLinkage()
        redirect(`/dashboard/reports/company-billing?company_id=${companyId}&from=${from}&to=${to}&status=${status || "all"}`)
      }

      const { error: patientUpdateError } = await supabase
        .from("patients")
        .update({
          company_id: companyId,
          insurance_type: "dependent",
          employee_id: principalEmployee.id,
        })
        .eq("id", patientId)
      if (patientUpdateError) {
        await rollbackLinkage()
        redirect(`/dashboard/reports/company-billing?company_id=${companyId}&from=${from}&to=${to}&status=${status || "all"}`)
      }

      await logAuditEvent({
        action: "patient.coverage_linked",
        entityType: "patient",
        entityId: patientId,
        user,
        metadata: {
          patient_id: patientId,
          company_id: companyId,
          linkage_type: "dependent",
          principal_employee_id: principalEmployee.id,
          dependent_relationship: dependentRelationship || "Dependent",
          source: "company_billing_audit",
        },
        before: {
          company_id: patient.company_id as string | null,
          insurance_type: patient.insurance_type as string | null,
          employee_id: patient.employee_id as string | null,
        },
        after: {
          company_id: companyId,
          insurance_type: "dependent",
          employee_id: principalEmployee.id,
        },
      })
    }

    revalidatePath("/dashboard/reports/company-billing")
    const redirectParams = new URLSearchParams()
    redirectParams.set("company_id", companyId)
    if (from) redirectParams.set("from", from)
    if (to) redirectParams.set("to", to)
    if (status && status !== "all") redirectParams.set("status", status)
    redirect(`/dashboard/reports/company-billing?${redirectParams.toString()}#linkage-audit`)
  }

  async function applySuggestedCoverageBulk(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("admin.settings.manage")
    const parsed = z
      .object({
        company_id: z.string().uuid(),
        from: z.string().trim().min(10).max(10),
        to: z.string().trim().min(10).max(10),
        status: z.string().trim().max(50).optional(),
      })
      .safeParse({
        company_id: formData.get("company_id"),
        from: formData.get("from"),
        to: formData.get("to"),
        status: formData.get("status"),
      })

    if (!parsed.success) {
      redirect("/dashboard/reports/company-billing")
    }

    const companyId = parsed.data.company_id
    const from = parsed.data.from
    const to = parsed.data.to
    const status = (parsed.data.status || "all").toLowerCase()
    const fromIso = new Date(`${from}T00:00:00`).toISOString()
    const toIso = new Date(`${to}T23:59:59.999`).toISOString()

    const { data: invoicesRaw } = await supabase
      .from("invoices")
      .select("id, patient_id, status")
      .eq("payer_type", "company")
      .eq("company_id", companyId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .limit(MAX_COMPANY_BILLING_ROWS)

    const invoices = ((invoicesRaw || []) as Array<{ patient_id?: string | null; status?: string | null }>).filter((invoice) =>
      status === "all" ? true : (invoice.status || "").toLowerCase() === status,
    )

    const patientIds = Array.from(new Set(invoices.map((invoice) => invoice.patient_id).filter((id): id is string => Boolean(id))))
    if (patientIds.length === 0) {
      redirect(`/dashboard/reports/company-billing?company_id=${companyId}&from=${from}&to=${to}&status=${status}#linkage-audit`)
    }

    const coverageMap = await fetchCompanyCoverageMap(supabase, companyId, patientIds)
    const unlinkedPatientIds = patientIds.filter((id) => {
      const coverage = coverageMap.get(id)
      return !coverage || coverage.relationshipLabel === "Unlinked"
    })

    if (unlinkedPatientIds.length === 0) {
      redirect(`/dashboard/reports/company-billing?company_id=${companyId}&from=${from}&to=${to}&status=${status}&bulk_applied=0&bulk_skipped=0&bulk_failed=0#linkage-audit`)
    }

    const [{ data: patientsRaw }, { data: employeeRosterRaw }] = await Promise.all([
      supabase
        .from("patients")
        .select("id, full_name, phone_number, insurance_type, insurance_card_number, insurance_expiry_date, employee_id")
        .in("id", unlinkedPatientIds),
      supabase
        .from("company_employees")
        .select("id, full_name, patient_id, insurance_card_number")
        .eq("company_id", companyId),
    ])

    const patients = (patientsRaw || []) as Array<PatientLite & { insurance_expiry_date?: string | null; phone_number?: string | null }>
    const employeeRoster = (employeeRosterRaw || []) as EmployeeRosterLite[]
    const employeeById = new Map(employeeRoster.map((employee) => [employee.id, employee]))
    const employeeByCard = new Map(
      employeeRoster
        .filter((employee) => normalizeInsuranceCard(employee.insurance_card_number))
        .map((employee) => [normalizeInsuranceCard(employee.insurance_card_number), employee]),
    )

    let applied = 0
    let skipped = 0
    let failed = 0

    for (const patient of patients) {
      const suggestion = suggestLinkage(patient, employeeById, employeeByCard)
      if (suggestion.linkageType === "dependent" && !suggestion.principalEmployeeId) {
        skipped += 1
        continue
      }

      const statusValue = patient.insurance_expiry_date
        ? new Date(patient.insurance_expiry_date).getTime() >= new Date(new Date().setHours(0, 0, 0, 0)).getTime()
          ? "active"
          : "expired"
        : "missing"

      try {
        if (suggestion.linkageType === "employee") {
          const { data: employeeRow, error: employeeUpsertError } = await supabase
            .from("company_employees")
            .upsert(
              {
                company_id: companyId,
                patient_id: patient.id,
                full_name: patient.full_name || "Unknown patient",
                phone: patient.phone_number || null,
                insurance_card_number: patient.insurance_card_number || null,
                insurance_expiry_date: patient.insurance_expiry_date || new Date().toISOString().slice(0, 10),
                status: statusValue,
              },
              { onConflict: "patient_id" },
            )
            .select("id")
            .maybeSingle()
          if (employeeUpsertError) throw employeeUpsertError

          const { error: clearDependentError } = await supabase.from("employee_dependents").delete().eq("patient_id", patient.id)
          if (clearDependentError) throw clearDependentError

          const { error: patientUpdateError } = await supabase
            .from("patients")
            .update({
              company_id: companyId,
              insurance_type: "employee",
              employee_id: employeeRow?.id ?? null,
            })
            .eq("id", patient.id)
          if (patientUpdateError) throw patientUpdateError
        } else {
          const { error: employeeDeleteError } = await supabase.from("company_employees").delete().eq("patient_id", patient.id)
          if (employeeDeleteError) throw employeeDeleteError

          const { error: dependentUpsertError } = await supabase
            .from("employee_dependents")
            .upsert(
              {
                employee_id: suggestion.principalEmployeeId,
                patient_id: patient.id,
                full_name: patient.full_name || "Unknown patient",
                relationship: suggestion.dependentRelationship || "Dependent",
                insurance_card_number: patient.insurance_card_number || null,
                insurance_expiry_date: patient.insurance_expiry_date || new Date().toISOString().slice(0, 10),
                status: statusValue,
              },
              { onConflict: "patient_id" },
            )
          if (dependentUpsertError) throw dependentUpsertError

          const { error: patientUpdateError } = await supabase
            .from("patients")
            .update({
              company_id: companyId,
              insurance_type: "dependent",
              employee_id: suggestion.principalEmployeeId,
            })
            .eq("id", patient.id)
          if (patientUpdateError) throw patientUpdateError
        }

        await logAuditEvent({
          action: "patient.coverage_linked_bulk_suggested",
          entityType: "patient",
          entityId: patient.id,
          user,
          metadata: {
            patient_id: patient.id,
            company_id: companyId,
            linkage_type: suggestion.linkageType,
            principal_employee_id: suggestion.principalEmployeeId || null,
            source: "company_billing_bulk_suggested",
            reason: suggestion.reason,
          },
          before: {
            insurance_type: patient.insurance_type || null,
            employee_id: patient.employee_id || null,
          },
          after: {
            insurance_type: suggestion.linkageType,
            employee_id: suggestion.linkageType === "employee" ? null : suggestion.principalEmployeeId,
          },
        })
        applied += 1
      } catch (error) {
        console.error("[company-billing] failed bulk suggested linkage", { patientId: patient.id, error })
        failed += 1
      }
    }

    await supabase.from("admin_audit_logs").insert({
      actor_user_id: user.id,
      target_user_id: user.id,
      action: "patient_coverage_bulk_suggested_linking",
      notes: `company=${companyId} applied=${applied} skipped=${skipped} failed=${failed}`,
    })

    revalidatePath("/dashboard/reports/company-billing")
    redirect(
      `/dashboard/reports/company-billing?${new URLSearchParams({
        company_id: companyId,
        from,
        to,
        ...(status && status !== "all" ? { status } : {}),
        bulk_applied: String(applied),
        bulk_skipped: String(skipped),
        bulk_failed: String(failed),
      }).toString()}#linkage-audit`,
    )
  }

  const [{ data: companies }, { data: invoices }, { data: employeeRosterRaw }] = await Promise.all([
    supabase.from("companies").select("id, name").order("name"),
    supabase
      .from("invoices")
      .select(
        `id, invoice_number, total_amount, paid_amount, status, created_at, payment_date, payer_type, company_id, patient_id, visit_id,
         companies(name)`
      )
      .eq("payer_type", "company")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .limit(MAX_COMPANY_BILLING_ROWS),
    selectedCompanyId
      ? supabase
          .from("company_employees")
          .select("id, full_name, patient_id, insurance_card_number, status")
          .eq("company_id", selectedCompanyId)
          .order("full_name")
      : Promise.resolve({ data: [] as EmployeeRosterLite[] }),
  ])

  let filteredInvoices = ((invoices || []) as unknown) as InvoiceRow[]
  const invoicesTruncated = (invoices || []).length >= MAX_COMPANY_BILLING_ROWS

  if (selectedCompanyId) {
    filteredInvoices = filteredInvoices.filter((inv) => (inv.company_id as string | null) === selectedCompanyId)
  }

  if (statusFilter !== "all") {
    filteredInvoices = filteredInvoices.filter((inv) => (inv.status || "").toLowerCase() === statusFilter)
  }

  const patientIds = Array.from(
    new Set(filteredInvoices.map((inv) => inv.patient_id).filter((id): id is string => Boolean(id)))
  )

  const { data: patients } = await (
    patientIds.length
      ? supabase
          .from("patients")
          .select("id, full_name, patient_number, phone_number, company_id, insurance_type, insurance_card_number, insurance_expiry_date, employee_id")
          .in("id", patientIds)
      : Promise.resolve({ data: [] as PatientLite[] })
  )

  const patientIdsByCompany = new Map<string, Set<string>>()
  for (const inv of filteredInvoices) {
    if (!inv.company_id || !inv.patient_id) continue
    const existing = patientIdsByCompany.get(inv.company_id) || new Set<string>()
    existing.add(inv.patient_id)
    patientIdsByCompany.set(inv.company_id, existing)
  }

  const coverageMapByCompanyPatient = new Map<string, { relationshipLabel: string; principalEmployeeName: string | null }>()
  await Promise.all(
    Array.from(patientIdsByCompany.entries()).map(async ([companyId, companyPatientIds]) => {
      const coverageMap = await fetchCompanyCoverageMap(supabase, companyId, Array.from(companyPatientIds))
      for (const [patientId, coverage] of coverageMap.entries()) {
        coverageMapByCompanyPatient.set(`${companyId}:${patientId}`, {
          relationshipLabel: coverage.relationshipLabel,
          principalEmployeeName: coverage.principalEmployeeName || null,
        })
      }
    }),
  )

  const patientById = new Map<string, { full_name?: string | null; patient_number?: string | null }>()
  for (const p of (patients || []) as PatientLite[]) {
    patientById.set(p.id, {
      full_name: p.full_name ?? null,
      patient_number: p.patient_number ?? null,
    })
  }

  const rows = filteredInvoices.map((inv) => {
    const patient = inv.patient_id ? patientById.get(inv.patient_id) : null
    const coverage =
      inv.company_id && inv.patient_id ? coverageMapByCompanyPatient.get(`${inv.company_id}:${inv.patient_id}`) || null : null

    const total = Number(inv.total_amount ?? 0)
    const paid = Number(inv.paid_amount ?? 0)
    const balance = Math.max(total - paid, 0)

    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number || "",
      companyId: inv.company_id || null,
      companyName: inv.companies?.name || "Unknown company",
      staffName: patient?.full_name || "Unknown",
      staffNumber: patient?.patient_number || "-",
      relationship: coverage?.relationshipLabel || "Unlinked",
      principalEmployee: coverage?.principalEmployeeName || "Not linked",
      visitId: inv.visit_id,
      createdAt: inv.created_at,
      total,
      paid,
      balance,
      status: inv.status || "",
    }
  })

  const totalAmount = rows.reduce((sum, r) => sum + r.total, 0)
  const totalPaid = rows.reduce((sum, r) => sum + r.paid, 0)
  const totalBalance = rows.reduce((sum, r) => sum + r.balance, 0)
  const totalRows = rows.length
  const pageStart = (currentPage - 1) * COMPANY_BILLING_PAGE_SIZE
  const pageEnd = pageStart + COMPANY_BILLING_PAGE_SIZE
  const pageRows = rows.slice(pageStart, pageEnd)
  const hasNextPage = pageEnd < totalRows

  const buildReportQuery = (page: number) => {
    const params = new URLSearchParams()
    if (selectedCompanyId) params.set("company_id", selectedCompanyId)
    if (fromParam) params.set("from", fromParam)
    if (toParam) params.set("to", toParam)
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter)
    if (page > 1) params.set("page", String(page))
    const query = params.toString()
    return query ? `?${query}` : ""
  }

  const formatDate = (value: string | null) => formatLocalizedDate(value, settings, { style: "numeric" })
  const monthFormatter = new Intl.DateTimeFormat(settings.locale || "en-GB", {
    month: "short",
    year: "numeric",
    timeZone: settings.timezone || "UTC",
  })

  const employeeRoster = (employeeRosterRaw || []) as EmployeeRosterLite[]
  const employeeById = new Map(employeeRoster.map((employee) => [employee.id, employee]))
  const employeeByCard = new Map(
    employeeRoster
      .filter((employee) => normalizeInsuranceCard(employee.insurance_card_number))
      .map((employee) => [normalizeInsuranceCard(employee.insurance_card_number), employee]),
  )
  const unlinkedRows = selectedCompanyId
    ? rows
        .filter((row) => row.relationship === "Unlinked")
        .map((row) => {
          const patient = filteredInvoices.find((invoice) => invoice.id === row.id)?.patient_id
            ? patientById.get(filteredInvoices.find((invoice) => invoice.id === row.id)?.patient_id as string)
            : null
          const patientId = filteredInvoices.find((invoice) => invoice.id === row.id)?.patient_id || null
          const patientRecord = patientId ? ((patients || []) as PatientLite[]).find((candidate) => candidate.id === patientId) || null : null
          return {
            ...row,
            patientId,
            patientRecord,
            patientName: patient?.full_name || row.staffName,
            patientNumber: patient?.patient_number || row.staffNumber,
          }
        })
        .filter((row, index, array) => row.patientId && array.findIndex((candidate) => candidate.patientId === row.patientId) === index)
    : []

  const linkageSuggestionByPatientId = new Map<
    string,
    LinkageSuggestion
  >()

  for (const row of unlinkedRows) {
    if (!row.patientId || !row.patientRecord) continue
    const patient = row.patientRecord
    linkageSuggestionByPatientId.set(row.patientId, suggestLinkage(patient, employeeById, employeeByCard))
  }

  const suggestionStats = unlinkedRows.reduce(
    (acc, row) => {
      const suggestion = row.patientId ? linkageSuggestionByPatientId.get(row.patientId) : null
      if (!suggestion) {
        acc.blocked += 1
        return acc
      }

      if (suggestion.linkageType === "dependent" && !suggestion.principalEmployeeId) {
        acc.blocked += 1
      } else {
        acc.actionable += 1
      }

      if (suggestion.linkageType === "employee") acc.employee += 1
      if (suggestion.linkageType === "dependent") acc.dependent += 1
      return acc
    },
    { actionable: 0, blocked: 0, employee: 0, dependent: 0 },
  )

  const unlinkedByCompanyMonth = Array.from(
    rows
      .filter((row) => row.relationship === "Unlinked")
      .reduce(
        (acc, row) => {
          const parsedDate = row.createdAt ? new Date(row.createdAt) : null
          const monthKey = parsedDate && !Number.isNaN(parsedDate.getTime()) ? monthFormatter.format(parsedDate) : "Unknown month"
          const key = `${row.companyName}__${monthKey}`
          const monthSort = parsedDate ? Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), 1) : 0
          const monthYear = parsedDate ? parsedDate.getUTCFullYear() : null
          const monthIndex = parsedDate ? parsedDate.getUTCMonth() : null
          const monthStartDate = monthSort ? new Date(monthSort) : null
          const monthEndDate =
            monthYear !== null && monthIndex !== null ? new Date(Date.UTC(monthYear, monthIndex + 1, 0)) : null
          const existing = acc.get(key) || {
            key,
            companyId: row.companyId,
            companyName: row.companyName,
            monthKey,
            monthSort,
            monthFrom: monthStartDate ? monthStartDate.toISOString().slice(0, 10) : fromDateValue,
            monthTo: monthEndDate ? monthEndDate.toISOString().slice(0, 10) : toDateValue,
            unlinkedBeneficiaries: 0,
            billedAmount: 0,
            outstandingBalance: 0,
          }
          existing.unlinkedBeneficiaries += 1
          existing.billedAmount += row.total
          existing.outstandingBalance += row.balance
          acc.set(key, existing)
          return acc
        },
        new Map<
          string,
          {
            key: string
            companyId: string | null
            companyName: string
            monthKey: string
            monthSort: number
            monthFrom: string
            monthTo: string
            unlinkedBeneficiaries: number
            billedAmount: number
            outstandingBalance: number
          }
        >(),
      )
      .values(),
  ).sort((a, b) => {
    if (a.monthSort === b.monthSort) return a.companyName.localeCompare(b.companyName)
    return b.monthSort - a.monthSort
  })

  return (
    <div className="space-y-6">
      {sp.bulk_applied || sp.bulk_failed || sp.bulk_skipped ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Suggested bulk linkage result: applied {sp.bulk_applied || "0"}, skipped {sp.bulk_skipped || "0"}, failed{" "}
          {sp.bulk_failed || "0"}.
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Company billing statement</h1>
          <p className="text-sm text-muted-foreground">
            View company-paid visits for the selected period, including beneficiary relationship and principal employee.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/reports">Back to Reports</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/billing/insurance">Open insurance billing</Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
          >
            <Link
              href={`/dashboard/reports/company-billing/export?${new URLSearchParams({
                ...(selectedCompanyId ? { company_id: selectedCompanyId } : {}),
                ...(fromParam ? { from: fromParam } : {}),
                ...(toParam ? { to: toParam } : {}),
                ...(statusFilter ? { status: statusFilter } : {}),
              }).toString()}`}
              target="_blank"
              rel="noreferrer"
            >
              Export CSV
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
          >
            <Link
              href={`/dashboard/reports/company-billing/export?${new URLSearchParams({
                ...(selectedCompanyId ? { company_id: selectedCompanyId } : {}),
                ...(fromParam ? { from: fromParam } : {}),
                ...(toParam ? { to: toParam } : {}),
                ...(statusFilter ? { status: statusFilter } : {}),
                scope: "unlinked",
              }).toString()}`}
              target="_blank"
              rel="noreferrer"
            >
              Export Unlinked Queue
            </Link>
          </Button>
          {selectedCompanyId ? (
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/dashboard/reports/company-billing/statement?${new URLSearchParams({
                  company_id: selectedCompanyId,
                  from: fromDateValue,
                  to: toDateValue,
                }).toString()}`}
                target="_blank"
                rel="noreferrer"
              >
                Monthly statement PDF
              </Link>
            </Button>
          ) : null}
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
            {((companies || []) as CompanyLite[]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
            From (date)
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={fromDateValue}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="to" className="text-xs font-medium text-muted-foreground">
            To (date)
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={toDateValue}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="status" className="text-xs font-medium text-muted-foreground">
            Invoice status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter || "all"}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button asChild type="button" size="sm" variant="ghost">
            <Link href="/dashboard/reports/company-billing">This month</Link>
          </Button>
          {hasActiveFilters ? (
            <Button asChild type="button" size="sm" variant="outline">
              <Link href="/dashboard/reports/company-billing">Reset</Link>
            </Button>
          ) : null}
          <Button type="submit" size="sm">
            Apply filters
          </Button>
        </div>
      </form>

      <ReportFilterSummary
        items={[
          { label: "Company", value: ((companies || []) as CompanyLite[]).find((company) => company.id === selectedCompanyId)?.name || selectedCompanyId },
          { label: "From", value: fromDateValue || null },
          { label: "To", value: toDateValue || null },
          { label: "Status", value: statusFilter !== "all" ? statusFilter : null },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total billed</CardTitle>
            <CardDescription>Sum of {totalRows} matching invoice(s) in this period.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalAmount, settings)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total paid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalPaid, settings)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Outstanding balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalBalance, settings)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Unlinked reconciliation queue</CardTitle>
          <CardDescription>
            Remaining unlinked billed beneficiaries grouped by company and billing month for targeted backfill.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unlinkedByCompanyMonth.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No unlinked billed beneficiaries in the selected reporting window.
            </p>
          ) : (
            <div className="overflow-x-auto text-sm">
              <table className="min-w-full border divide-y divide-border text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Company</th>
                    <th className="px-3 py-2 text-left font-medium">Billing month</th>
                    <th className="px-3 py-2 text-right font-medium">Unlinked beneficiaries</th>
                    <th className="px-3 py-2 text-right font-medium">Billed amount</th>
                    <th className="px-3 py-2 text-right font-medium">Outstanding balance</th>
                    <th className="px-3 py-2 text-left font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {unlinkedByCompanyMonth.map((entry) => (
                    <tr key={entry.key} className="border-b last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap">{entry.companyName}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{entry.monthKey}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{entry.unlinkedBeneficiaries}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(entry.billedAmount, settings)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(entry.outstandingBalance, settings)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {entry.companyId ? (
                          <Link
                            href={`/dashboard/reports/company-billing?${new URLSearchParams({
                              company_id: entry.companyId,
                              from: entry.monthFrom,
                              to: entry.monthTo,
                            }).toString()}#linkage-audit`}
                            className="text-blue-600 hover:underline"
                          >
                            Open linkage audit
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {invoicesTruncated ? (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Showing the first {MAX_COMPANY_BILLING_ROWS.toLocaleString()} invoices for performance. Narrow filters to refine results.
        </div>
      ) : null}

      {selectedCompanyId ? (
        <Card id="linkage-audit">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Roster linkage audit</CardTitle>
                <CardDescription>
                  Review company-billed patients who are not yet linked to the employee or dependent roster. Link them here so monthly statements can identify employee, spouse, or child correctly.
                </CardDescription>
              </div>
              <form action={applySuggestedCoverageBulk}>
                <input type="hidden" name="company_id" value={selectedCompanyId} />
                <input type="hidden" name="from" value={fromDateValue} />
                <input type="hidden" name="to" value={toDateValue} />
                <input type="hidden" name="status" value={statusFilter} />
                <Button type="submit" size="sm" variant="outline" disabled={suggestionStats.actionable === 0}>
                  Apply Suggested Links ({suggestionStats.actionable})
                </Button>
              </form>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-md border px-3 py-3">
                <p className="text-xs text-muted-foreground">Unlinked beneficiaries</p>
                <p className="text-2xl font-bold">{unlinkedRows.length}</p>
              </div>
              <div className="rounded-md border px-3 py-3">
                <p className="text-xs text-muted-foreground">Roster employees available</p>
                <p className="text-2xl font-bold">{employeeRoster.length}</p>
              </div>
              <div className="rounded-md border px-3 py-3">
                <p className="text-xs text-muted-foreground">Audit scope</p>
                <p className="text-sm font-medium">{fromDateValue} to {toDateValue}</p>
              </div>
            </div>
            {unlinkedRows.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Suggested actionable</p>
                  <p className="text-lg font-semibold">{suggestionStats.actionable}</p>
                </div>
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Blocked suggestions</p>
                  <p className="text-lg font-semibold">{suggestionStats.blocked}</p>
                </div>
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Employee links</p>
                  <p className="text-lg font-semibold">{suggestionStats.employee}</p>
                </div>
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Dependent links</p>
                  <p className="text-lg font-semibold">{suggestionStats.dependent}</p>
                </div>
              </div>
            ) : null}

            {unlinkedRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All company-billed patients in the selected period are already linked to the employee/dependent roster.
              </p>
            ) : (
              <div className="space-y-3">
                {unlinkedRows.map((row) => (
                  <form key={row.patientId} action={backfillCompanyCoverage} className="rounded-md border px-4 py-3 space-y-3">
                    {(() => {
                      const suggestion = row.patientId ? linkageSuggestionByPatientId.get(row.patientId) : null
                      return (
                        <>
                    <input type="hidden" name="company_id" value={selectedCompanyId} />
                    <input type="hidden" name="patient_id" value={row.patientId || ""} />
                    <input type="hidden" name="from" value={fromDateValue} />
                    <input type="hidden" name="to" value={toDateValue} />
                    <input type="hidden" name="status" value={statusFilter} />
                    <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">{row.patientName}</p>
                        <p className="text-xs text-muted-foreground">
                          Patient #: {row.patientNumber} · Invoice: {row.invoiceNumber} · Visit: {row.visitId || "-"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Patient insurance type: {row.patientRecord?.insurance_type || "not set"} · Card: {row.patientRecord?.insurance_card_number || "not set"}
                        </p>
                        {suggestion ? (
                          <p className="text-xs text-blue-700">
                            Suggested: {suggestion.linkageType}
                            {suggestion.principalEmployeeId ? " with principal employee preselected" : ""}
                            . {suggestion.reason}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <p>Total billed: {formatCurrency(row.total, settings)}</p>
                        <p>Status: {row.status}</p>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground" htmlFor={`linkage-type-${row.patientId}`}>
                          Link as
                        </label>
                        <select
                          id={`linkage-type-${row.patientId}`}
                          name="linkage_type"
                          defaultValue={suggestion?.linkageType || "employee"}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm"
                        >
                          <option value="employee">Employee</option>
                          <option value="dependent">Dependent</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground" htmlFor={`principal-employee-${row.patientId}`}>
                          Principal employee
                        </label>
                        <select
                          id={`principal-employee-${row.patientId}`}
                          name="principal_employee_id"
                          defaultValue={suggestion?.principalEmployeeId || ""}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm"
                        >
                          <option value="">Select employee</option>
                          {employeeRoster.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.full_name || "Unnamed employee"}{employee.insurance_card_number ? ` · ${employee.insurance_card_number}` : ""}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-muted-foreground">Required only when linking as dependent.</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground" htmlFor={`dependent-relationship-${row.patientId}`}>
                          Relationship
                        </label>
                        <input
                          id={`dependent-relationship-${row.patientId}`}
                          name="dependent_relationship"
                          defaultValue={suggestion?.dependentRelationship || "Spouse"}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm"
                          placeholder="Spouse, Child, Parent"
                        />
                        <p className="text-[11px] text-muted-foreground">Used only for dependent linkage.</p>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button type="submit" size="sm" variant="outline">
                        Save roster linkage
                      </Button>
                    </div>
                        </>
                      )
                    })()}
                  </form>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Company invoices by visit</CardTitle>
          <CardDescription>One line per visit, with beneficiary relationship and principal employee where linked.</CardDescription>
        </CardHeader>
        <CardContent>
          {totalRows === 0 ? (
            <p className="text-sm text-muted-foreground">
              No company invoices match the selected filters.
              {hasActiveFilters ? (
                <>
                  {" "}
                  <Link href="/dashboard/reports/company-billing" className="text-blue-600 hover:underline">
                    Clear filters
                  </Link>
                  .
                </>
              ) : null}
            </p>
          ) : (
            <div className="overflow-x-auto text-sm">
              <table className="min-w-full border divide-y divide-border text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Company</th>
                    <th className="px-3 py-2 text-left font-medium">Beneficiary</th>
                    <th className="px-3 py-2 text-left font-medium">Patient #</th>
                    <th className="px-3 py-2 text-left font-medium">Relationship</th>
                    <th className="px-3 py-2 text-left font-medium">Principal employee</th>
                    <th className="px-3 py-2 text-left font-medium">Visit ID</th>
                    <th className="px-3 py-2 text-left font-medium">Invoice #</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-right font-medium">Paid</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.companyName}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.staffName}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.staffNumber}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.relationship}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.principalEmployee}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.visitId || "-"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.invoiceNumber}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(row.total, settings)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(row.paid, settings)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(row.balance, settings)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalRows > 0 ? (
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Page {currentPage} · Showing {pageRows.length} of {totalRows} invoice{totalRows === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/reports/company-billing${buildReportQuery(currentPage - 1)}`}>Previous</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled>
                    Previous
                  </Button>
                )}
                {hasNextPage ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/reports/company-billing${buildReportQuery(currentPage + 1)}`}>Next</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled>
                    Next
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
