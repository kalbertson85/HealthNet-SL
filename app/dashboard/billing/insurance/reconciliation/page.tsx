import Link from "next/link"
import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getGlobalSettings } from "@/lib/global-settings"
import { formatCurrency, formatDateTime } from "@/lib/locale-format"
import { logAuditEvent } from "@/lib/audit"
import { requireServerActionPermission } from "@/lib/server-action-security"
import { z } from "zod"

interface ReconciliationPageProps {
  searchParams: Promise<{ batch_id?: string; error?: string }>
}

function derivePaymentStatus(expectedAmount: number, paidAmount: number, denialCodes: string[]) {
  if (denialCodes.length > 0 && paidAmount <= 0) return "denied"
  if (paidAmount === expectedAmount) return "matched"
  if (paidAmount <= 0) return "partial"
  if (paidAmount < expectedAmount) return "underpaid"
  if (paidAmount > expectedAmount) return "overpaid"
  return "partial"
}

export default async function InsuranceReconciliationPage({ searchParams }: ReconciliationPageProps) {
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()
  const { user } = await getSessionUserAndProfile()

  if (!user) redirect("/auth/login")
  if (!can(user, "billing.manage")) redirect("/dashboard")

  const sp = await searchParams
  const selectedBatchId = (sp.batch_id || "").trim() || null
  const reconcileError = (sp.error || "").trim().toLowerCase()

  const reconcileErrorMessage =
    reconcileError === "invalid_payload"
      ? "Reconciliation payload is invalid. Please review all fields and retry."
      : reconcileError === "batch_not_found"
        ? "The selected insurance batch could not be found."
        : reconcileError === "payment_insert_failed"
          ? "Could not save the reconciliation payment entry. No changes were applied."
          : reconcileError === "batch_update_failed"
            ? "Could not update the insurance batch status. The payment entry was rolled back."
            : reconcileError === "invoice_update_failed"
              ? "Could not update linked invoices. The payment entry was rolled back."
              : reconcileError === "invoice_lookup_failed"
                ? "Could not load linked invoices for this batch. The payment entry was rolled back."
                : reconcileError === "batch_items_lookup_failed"
                  ? "Could not load batch items for this batch. The payment entry was rolled back."
                : reconcileError === "batch_lookup_failed"
                  ? "Could not load batch state before reconciliation."
                  : reconcileError === "reconciliation_failed"
                    ? "Insurance reconciliation could not be completed atomically. No partial changes were applied."
                    : reconcileError === "transactional_dependency_unavailable"
                      ? "Insurance reconciliation requires transactional database RPCs that are not available yet. Please apply the latest SQL scripts."
                  : reconcileError === "audit_log_failed"
                    ? "Reconciliation audit logging failed. All reconciliation changes were rolled back."
                  : reconcileError === "payment_rollback_failed"
                      ? "A reconciliation step failed and the rollback also failed. Please review admin audit logs immediately."
                      : null

  async function recordInsurancePayment(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("billing.manage")
    const parsed = z
      .object({
        batch_id: z.string().uuid(),
        expected_amount: z.coerce.number().finite().nonnegative(),
        paid_amount: z.coerce.number().finite().nonnegative(),
        denial_reason_codes: z.string().optional(),
        notes: z.string().max(5000).optional(),
      })
      .safeParse({
        batch_id: ((formData.get("batch_id") as string | null) || "").trim(),
        expected_amount: formData.get("expected_amount"),
        paid_amount: formData.get("paid_amount"),
        denial_reason_codes: String(formData.get("denial_reason_codes") || ""),
        notes: ((formData.get("notes") as string | null) || "").trim() || "",
      })

    if (!parsed.success) {
      redirect("/dashboard/billing/insurance/reconciliation?error=invalid_payload")
    }

    const batchId = parsed.data.batch_id
    const expectedAmount = parsed.data.expected_amount
    const paidAmount = parsed.data.paid_amount
    const reasonCodes = String(formData.get("denial_reason_codes") || "")
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean)
    const notes = parsed.data.notes?.trim() || null

    const variance = paidAmount - expectedAmount
    const status = derivePaymentStatus(expectedAmount, paidAmount, reasonCodes)

    const { data: existingBatch, error: existingBatchError } = await supabase
      .from("insurance_billing_batches")
      .select("id, status, total_amount, paid_amount, submitted_at, paid_at")
      .eq("id", batchId)
      .maybeSingle()

    if (existingBatchError) {
      redirect(`/dashboard/billing/insurance/reconciliation?batch_id=${batchId}&error=batch_lookup_failed`)
    }
    if (!existingBatch?.id) {
      redirect(`/dashboard/billing/insurance/reconciliation?batch_id=${batchId}&error=batch_not_found`)
    }

    const rpcResult = await supabase.rpc("reconcile_insurance_batch_payment", {
      p_batch_id: batchId,
      p_expected_amount: expectedAmount,
      p_paid_amount: paidAmount,
      p_denial_reason_codes: reasonCodes,
      p_notes: notes,
      p_created_by: user.id,
      p_admin_audit_note: `Batch ${batchId} reconciled as ${status}. Paid ${paidAmount} against expected ${expectedAmount}.`,
    })

    if (!rpcResult.error) {
      const rpcData = (rpcResult.data || null) as
        | { ok?: boolean; code?: string; message?: string; payment_id?: string | null; batch_status?: string | null }
        | null
        | undefined

      if (rpcData?.ok) {
        await logAuditEvent({
          action: "insurance.batch_reconciled",
          entityType: "insurance_batch",
          entityId: batchId,
          user,
          metadata: {
            batch_id: batchId,
            expected_amount: expectedAmount,
            paid_amount: paidAmount,
            variance,
            denial_reason_codes: reasonCodes,
            payment_id: rpcData.payment_id ?? null,
          },
          before: {
            status: (existingBatch as { status?: string | null }).status ?? null,
            paid_amount: Number((existingBatch as { paid_amount?: number | null }).paid_amount ?? 0),
            total_amount: Number((existingBatch as { total_amount?: number | null }).total_amount ?? 0),
            submitted_at: (existingBatch as { submitted_at?: string | null }).submitted_at ?? null,
            paid_at: (existingBatch as { paid_at?: string | null }).paid_at ?? null,
          },
          after: {
            status: (rpcData.batch_status as string | null) ?? (status === "matched" ? "paid" : "submitted"),
            paid_amount: paidAmount,
          },
        })

        redirect(`/dashboard/billing/insurance/reconciliation?batch_id=${batchId}`)
      }

      if (rpcData && rpcData.ok === false) {
        const errorCode = (rpcData.code || "reconciliation_failed").toLowerCase()
        if (errorCode === "batch_not_found") {
          redirect(`/dashboard/billing/insurance/reconciliation?batch_id=${batchId}&error=batch_not_found`)
        }
        redirect(`/dashboard/billing/insurance/reconciliation?batch_id=${batchId}&error=reconciliation_failed`)
      }
    } else {
      const rpcErrorCode = String((rpcResult.error as { code?: string } | null)?.code || "")
      if (rpcErrorCode === "42883") {
        redirect(`/dashboard/billing/insurance/reconciliation?batch_id=${batchId}&error=transactional_dependency_unavailable`)
      }
      redirect(`/dashboard/billing/insurance/reconciliation?batch_id=${batchId}&error=reconciliation_failed`)
    }
  }

  const [{ data: batchesRaw }, { data: paymentsRaw }] = await Promise.all([
    supabase
      .from("insurance_billing_batches")
      .select("id, batch_number, company_id, from_date, to_date, status, total_amount, paid_amount, companies(name)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("insurance_payments")
      .select("id, batch_id, expected_amount, paid_amount, variance, status, denial_reason_codes, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ])

  const batches = (batchesRaw || []) as Array<{
    id: string
    batch_number?: string | null
    company_id?: string | null
    from_date?: string | null
    to_date?: string | null
    status?: string | null
    total_amount?: number | null
    paid_amount?: number | null
    companies?: { name?: string | null } | Array<{ name?: string | null }> | null
  }>

  const payments = (paymentsRaw || []) as Array<{
    id: string
    batch_id?: string | null
    expected_amount?: number | null
    paid_amount?: number | null
    variance?: number | null
    status?: string | null
    denial_reason_codes?: string[] | null
    notes?: string | null
    created_at?: string | null
  }>

  const latestPaymentByBatchId = new Map<string, (typeof payments)[number]>()
  for (const payment of payments) {
    if (payment.batch_id && !latestPaymentByBatchId.has(payment.batch_id)) {
      latestPaymentByBatchId.set(payment.batch_id, payment)
    }
  }

  const selectedBatch = selectedBatchId ? batches.find((batch) => batch.id === selectedBatchId) || null : null
  const selectedLatestPayment = selectedBatch ? latestPaymentByBatchId.get(selectedBatch.id) || null : null
  const expectedAmount = Number(selectedBatch?.total_amount || 0)
  const paidAmount = Number(selectedLatestPayment?.paid_amount ?? selectedBatch?.paid_amount ?? 0)
  const variance = selectedLatestPayment ? Number(selectedLatestPayment.variance || 0) : paidAmount - expectedAmount

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Insurance reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Compare expected insurer batch totals with actual payment receipts and track denials or variance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/billing/insurance">Back to Insurance Billing</Link>
          </Button>
        </div>
      </div>

      {reconcileErrorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{reconcileErrorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Select batch</CardTitle>
          <CardDescription>Choose a submitted or paid insurance batch to reconcile.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor="batch_id" className="text-xs font-medium text-muted-foreground">Insurance batch</label>
              <select id="batch_id" name="batch_id" defaultValue={selectedBatchId || ""} className="h-9 min-w-[320px] rounded-md border border-input bg-background px-2 text-xs">
                <option value="">Select batch</option>
                {batches.map((batch) => {
                  const company = Array.isArray(batch.companies) ? batch.companies[0] : batch.companies
                  return (
                    <option key={batch.id} value={batch.id}>
                      {(batch.batch_number || batch.id)} · {company?.name || "Unknown provider"}
                    </option>
                  )
                })}
              </select>
            </div>
            <Button type="submit" size="sm">Load reconciliation</Button>
          </form>
        </CardContent>
      </Card>

      {selectedBatch ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Expected</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(expectedAmount, settings)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Paid</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(paidAmount, settings)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Variance</CardTitle></CardHeader><CardContent><p className={`text-2xl font-bold ${variance === 0 ? "text-emerald-600" : variance < 0 ? "text-amber-600" : "text-red-600"}`}>{formatCurrency(variance, settings)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Latest status</CardTitle></CardHeader><CardContent><Badge variant={selectedLatestPayment?.status === "matched" ? "secondary" : "outline"}>{selectedLatestPayment?.status || "pending"}</Badge></CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Record insurer payment</CardTitle>
              <CardDescription>Store the received amount, variance, and denial reason codes against this batch.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={recordInsurancePayment} className="grid gap-4 lg:grid-cols-2">
                <input type="hidden" name="batch_id" value={selectedBatch.id} />
                <input type="hidden" name="expected_amount" value={expectedAmount} />
                <div className="space-y-1">
                  <label htmlFor="paid_amount" className="text-sm font-medium">Paid amount</label>
                  <input id="paid_amount" name="paid_amount" type="number" min="0" step="0.01" defaultValue={paidAmount || expectedAmount} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="denial_reason_codes" className="text-sm font-medium">Denial reason codes</label>
                  <input id="denial_reason_codes" name="denial_reason_codes" defaultValue={selectedLatestPayment?.denial_reason_codes?.join(", ") || ""} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" placeholder="COB, MISSING_DOCS, LIMIT_EXCEEDED" />
                </div>
                <div className="space-y-1 lg:col-span-2">
                  <label htmlFor="notes" className="text-sm font-medium">Notes</label>
                  <textarea id="notes" name="notes" defaultValue={selectedLatestPayment?.notes || ""} className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Capture remittance notes, denial context, or payer comments." />
                </div>
                <div className="lg:col-span-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Exact payment marks the batch paid. Variance keeps the batch submitted and records the reconciliation gap.
                  </p>
                  <Button type="submit">Save reconciliation</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reconciliation history</CardTitle>
              <CardDescription>Most recent payment captures for this batch.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {payments.filter((payment) => payment.batch_id === selectedBatch.id).length > 0 ? (
                payments
                  .filter((payment) => payment.batch_id === selectedBatch.id)
                  .map((payment) => (
                    <div key={payment.id} className="rounded-md border px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{payment.status || "pending"}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(payment.created_at, settings)}</p>
                        </div>
                        <div className="text-right text-sm">
                          <p>Expected: {formatCurrency(Number(payment.expected_amount || 0), settings)}</p>
                          <p>Paid: {formatCurrency(Number(payment.paid_amount || 0), settings)}</p>
                          <p className={Number(payment.variance || 0) === 0 ? "text-emerald-600" : Number(payment.variance || 0) < 0 ? "text-amber-600" : "text-red-600"}>
                            Variance: {formatCurrency(Number(payment.variance || 0), settings)}
                          </p>
                        </div>
                      </div>
                      {payment.denial_reason_codes && payment.denial_reason_codes.length > 0 ? (
                        <p className="mt-2 text-xs text-amber-700">Reason codes: {payment.denial_reason_codes.join(", ")}</p>
                      ) : null}
                      {payment.notes ? <p className="mt-2 text-xs text-muted-foreground">{payment.notes}</p> : null}
                    </div>
                  ))
              ) : (
                <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
                  No reconciliation entries recorded for this batch yet.
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
