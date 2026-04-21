import Link from "next/link"
import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import {
  buildInsuranceBatchNumber,
  createInsuranceBillingBatchTransactional,
  fetchEligibleInsuranceInvoices,
  groupInvoicesForInsurer,
} from "@/lib/billing/insurance-batches"
import { fetchCompanyCoverageMap } from "@/lib/billing/company-coverage"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ReportFilterSummary } from "@/components/report-filter-summary"
import { PatientWorkflowPanel } from "@/components/patient-workflow-panel"
import { getGlobalSettings } from "@/lib/global-settings"
import { formatCurrency } from "@/lib/locale-format"
import { requireServerActionPermission } from "@/lib/server-action-security"
import { z } from "zod"

interface InsuranceBillingPageProps {
  searchParams: Promise<{ company_id?: string; from?: string; to?: string; status?: string }>
}

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

export default async function InsuranceBillingPage({ searchParams }: InsuranceBillingPageProps) {
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }
  if (!can(user, "billing.manage")) {
    redirect("/dashboard")
  }

  const sp = await searchParams
  const selectedCompanyId = (sp.company_id || "").trim() || null
  const statusFilter = (sp.status || "all").trim().toLowerCase()

  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const fromDate = parseDate((sp.from || "").trim() || null, monthStart)
  const toDate = parseDate((sp.to || "").trim() || null, monthEnd)
  const fromValue = fromDate.toISOString().slice(0, 10)
  const toValue = toDate.toISOString().slice(0, 10)
  const fromIso = fromDate.toISOString()
  const toIso = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999).toISOString()

  async function createInsuranceBatch(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("billing.manage")
    const parsed = z
      .object({
        company_id: z.string().uuid(),
        from: z.string().trim().min(10).max(10),
        to: z.string().trim().min(10).max(10),
      })
      .safeParse({
        company_id: ((formData.get("company_id") as string | null) || "").trim(),
        from: ((formData.get("from") as string | null) || "").trim(),
        to: ((formData.get("to") as string | null) || "").trim(),
      })

    if (!parsed.success) {
      redirect("/dashboard/billing/insurance")
    }

    const companyId = parsed.data.company_id
    const from = parsed.data.from
    const to = parsed.data.to
    if (!companyId || !from || !to) {
      redirect("/dashboard/billing/insurance")
    }

    const startIso = new Date(`${from}T00:00:00`).toISOString()
    const endDate = new Date(`${to}T23:59:59.999`)
    const endIso = endDate.toISOString()

    const eligibleInvoices = await fetchEligibleInsuranceInvoices(supabase, companyId, startIso, endIso)
    if (eligibleInvoices.length === 0) {
      redirect(`/dashboard/billing/insurance?company_id=${companyId}&from=${from}&to=${to}`)
    }

    const batchNumber = buildInsuranceBatchNumber()
    const totalAmount = eligibleInvoices.reduce((sum, invoice) => sum + invoice.balance, 0)
    let batchId: string
    try {
      batchId = await createInsuranceBillingBatchTransactional(supabase, {
        batchNumber,
        companyId,
        fromDate: from,
        toDate: to,
        createdBy: user.id,
        invoiceIds: eligibleInvoices.map((invoice) => invoice.id),
      })
    } catch (error) {
      console.error("[insurance-billing] Failed to create batch transactionally:", error)
      redirect(`/dashboard/billing/insurance?company_id=${companyId}&from=${from}&to=${to}`)
    }

    const { error: auditError } = await supabase.from("admin_audit_logs").insert({
      actor_user_id: user.id,
      target_user_id: user.id,
      action: "insurance_batch_create",
      notes: `Batch ${batchNumber} for ${eligibleInvoices.length} invoice(s), total ${totalAmount}`,
    })
    if (auditError) {
      await supabase.from("insurance_billing_batch_items").delete().eq("batch_id", batchId)
      await supabase.from("invoices").update({ insurance_batch_id: null }).eq("insurance_batch_id", batchId)
      await supabase.from("insurance_billing_batches").delete().eq("id", batchId)
      redirect(`/dashboard/billing/insurance?company_id=${companyId}&from=${from}&to=${to}&error=audit_log_failed`)
    }

    redirect(`/dashboard/billing/insurance/${batchId}`)
  }

  const [{ data: companies }, { data: batchesRaw }] = await Promise.all([
    supabase.from("companies").select("id, name").order("name"),
    supabase
      .from("insurance_billing_batches")
      .select("id, batch_number, company_id, from_date, to_date, status, total_amount, paid_amount, created_at, companies(name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ])

  const batches = (batchesRaw || [])
    .filter((batch) => (selectedCompanyId ? (batch.company_id as string | null) === selectedCompanyId : true))
    .filter((batch) => (statusFilter !== "all" ? ((batch.status as string | null) || "").toLowerCase() === statusFilter : true))

  const eligibleInvoices = selectedCompanyId ? await fetchEligibleInsuranceInvoices(supabase, selectedCompanyId, fromIso, toIso) : []
  const previewTotal = eligibleInvoices.reduce((sum, invoice) => sum + invoice.balance, 0)
  const selectedCompanyName = (companies || []).find((company) => company.id === selectedCompanyId)?.name || selectedCompanyId
  const eligiblePatientIds = Array.from(new Set(eligibleInvoices.map((invoice) => invoice.patient_id).filter((id): id is string => Boolean(id))))
  const coverageMap = selectedCompanyId ? await fetchCompanyCoverageMap(supabase, selectedCompanyId, eligiblePatientIds) : new Map()
  const groupedPreview = groupInvoicesForInsurer(eligibleInvoices, coverageMap)
  const unlinkedEligibleCount = eligiblePatientIds.filter((patientId) => {
    const coverage = coverageMap.get(patientId)
    return !coverage || coverage.relationshipLabel === "Unlinked"
  }).length
  const auditHref = selectedCompanyId
    ? `/dashboard/reports/company-billing?${new URLSearchParams({
        company_id: selectedCompanyId,
        from: fromValue,
        to: toValue,
      }).toString()}#linkage-audit`
    : "/dashboard/reports/company-billing"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Insurance billing</h1>
          <p className="text-sm text-muted-foreground">
            Generate insurer-ready monthly billing batches from existing company-paid visit invoices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/billing">Back to Billing</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/billing/insurance/reconciliation">Reconciliation</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/reports/company-billing">Company billing report</Link>
          </Button>
        </div>
      </div>

      <PatientWorkflowPanel
        currentStage="billing"
        title="Insurance billing stage"
        description="This page groups unpaid company services into month-end insurer invoices without duplicating the underlying visit invoices."
      />

      <Card>
        <CardHeader>
          <CardTitle>Generate monthly insurance invoice</CardTitle>
          <CardDescription>Select an insurer and date range. Only unpaid company services not already batched are included.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form method="GET" className="flex flex-wrap items-end gap-3 text-sm">
            <div className="space-y-1">
              <label htmlFor="company_id" className="text-xs font-medium text-muted-foreground">Insurance provider</label>
              <select id="company_id" name="company_id" defaultValue={selectedCompanyId || ""} className="h-9 min-w-[220px] rounded-md border border-input bg-background px-2 text-xs">
                <option value="">Select provider</option>
                {(companies || []).map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="from" className="text-xs font-medium text-muted-foreground">From</label>
              <input id="from" name="from" type="date" defaultValue={fromValue} className="h-9 rounded-md border border-input bg-background px-2 text-xs" />
            </div>
            <div className="space-y-1">
              <label htmlFor="to" className="text-xs font-medium text-muted-foreground">To</label>
              <input id="to" name="to" type="date" defaultValue={toValue} className="h-9 rounded-md border border-input bg-background px-2 text-xs" />
            </div>
            <Button type="submit" size="sm">Preview eligible services</Button>
          </form>

          <ReportFilterSummary
            items={[
              { label: "Provider", value: selectedCompanyName || null },
              { label: "From", value: fromValue },
              { label: "To", value: toValue },
            ]}
          />

          {selectedCompanyId && unlinkedEligibleCount > 0 ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {unlinkedEligibleCount} eligible beneficiar{unlinkedEligibleCount === 1 ? "y is" : "ies are"} not yet linked to the employee or dependent roster.
              Review and fix those records before creating the insurer batch so the statement shows employee, spouse, or child correctly.{" "}
              <Link href={auditHref} className="font-medium underline-offset-2 hover:underline">
                Open roster linkage audit
              </Link>
              .
            </div>
          ) : null}

          {selectedCompanyId ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Eligible service invoices</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{eligibleInvoices.length}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Employee households</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{groupedPreview.length}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Grand total</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{formatCurrency(previewTotal, settings)}</p></CardContent>
              </Card>
            </div>
          ) : null}

          {selectedCompanyId ? (
            eligibleInvoices.length > 0 ? (
              <>
                <form action={createInsuranceBatch}>
                  <input type="hidden" name="company_id" value={selectedCompanyId} />
                  <input type="hidden" name="from" value={fromValue} />
                  <input type="hidden" name="to" value={toValue} />
                  <Button type="submit">Create draft insurance invoice</Button>
                </form>
                <div className="space-y-3 rounded-md border bg-muted/20 p-4">
                  {groupedPreview.map((group) => (
                    <div key={group.patientId || group.patientNumber} className="rounded-md border bg-background px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{group.patientName}</p>
                          <p className="text-xs text-muted-foreground">{group.patientNumber}</p>
                        </div>
                        <p className="text-sm font-semibold">{formatCurrency(group.total, settings)}</p>
                      </div>
                      {group.hasUnlinked ? (
                        <p className="mt-2 text-xs text-amber-700">
                          Beneficiary relationship is not linked to the employee roster yet.
                        </p>
                      ) : null}
                      {group.memberCount > 1 ? (
                        <p className="mt-1 text-xs text-muted-foreground">Household members in this period: {group.memberCount}</p>
                      ) : null}
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        {group.invoices.map((invoice) => (
                          <div key={invoice.id} className="flex items-center justify-between gap-3">
                            <span>{invoice.invoice_number || invoice.id}</span>
                            <span>{formatCurrency(invoice.balance, settings)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
                No unpaid insurance services are eligible for this provider and period. Existing paid services and already batched invoices are excluded automatically.
              </div>
            )
          ) : (
            <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
              Select an insurance provider to preview eligible monthly services.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generated insurance invoices</CardTitle>
          <CardDescription>Draft, submitted, and paid insurer billing batches generated from visit-level invoices.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form method="GET" className="flex flex-wrap items-end gap-3 text-sm">
            {selectedCompanyId ? <input type="hidden" name="company_id" value={selectedCompanyId} /> : null}
            <input type="hidden" name="from" value={fromValue} />
            <input type="hidden" name="to" value={toValue} />
            <div className="space-y-1">
              <label htmlFor="status" className="text-xs font-medium text-muted-foreground">Invoice status</label>
              <select id="status" name="status" defaultValue={statusFilter} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <Button type="submit" size="sm" variant="outline">Apply</Button>
          </form>

          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No insurance invoices match the current filters.</p>
          ) : (
            <div className="space-y-3">
              {batches.map((batch) => {
                const balance = Math.max(Number(batch.total_amount || 0) - Number(batch.paid_amount || 0), 0)
                const company = Array.isArray(batch.companies) ? (batch.companies[0] ?? null) : batch.companies ?? null
                return (
                  <div key={batch.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
                    <div>
                      <p className="font-medium">{batch.batch_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {company?.name || "Unknown provider"} · {batch.from_date} to {batch.to_date}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant={batch.status === "paid" ? "secondary" : "outline"}>{batch.status}</Badge>
                      <span>Total: {formatCurrency(Number(batch.total_amount || 0), settings)}</span>
                      <span>Balance: {formatCurrency(balance, settings)}</span>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/billing/insurance/${batch.id}`}>Open</Link>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
