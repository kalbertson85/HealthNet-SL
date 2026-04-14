import { createServerClient } from "@/lib/supabase/server"
import { notFound, redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getGlobalSettings } from "@/lib/global-settings"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/locale-format"
import { logAuditEvent } from "@/lib/audit"
import { requireServerActionPermission } from "@/lib/server-action-security"
import { z } from "zod"

interface BillingAuditRow {
  id: string
  created_at: string
  action: string
  old_status: string | null
  new_status: string | null
  amount: number | null
  actor_user_id: string
}

interface InsuranceClaimRow {
  id: string
  status: string
  claim_number: string | null
  claimed_amount: number | null
  approved_amount: number | null
}

function normalizeSingle<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null
  return Array.isArray(relation) ? (relation[0] ?? null) : relation
}

export default async function InvoiceDetailPage(props: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()
  const { id } = await props.params

  if (id === "new") {
    redirect("/dashboard/billing/new")
  }

  const [{ data: invoice }, { data: items }, { data: auditRows }, { data: claim }] = await Promise.all([
    supabase
      .from("invoices")
      .select(`
        id, invoice_number, status, total_amount, paid_amount, created_at, payment_date, payment_method,
        payer_type, patient_id, visit_id, notes,
        patients(full_name, patient_number, phone_number)
      `)
      .eq("id", id)
      .single(),
    supabase.from("invoice_items").select("id, description, quantity, unit_price, amount").eq("invoice_id", id),
    supabase
      .from("billing_audit_logs")
      .select("id, created_at, action, old_status, new_status, amount, actor_user_id")
      .eq("invoice_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("insurance_claims")
      .select("id, status, claim_number, claimed_amount, approved_amount")
      .eq("invoice_id", id)
      .maybeSingle(),
  ])

  if (!invoice) {
    notFound()
  }
  const invoiceRecord = invoice
  const invoicePatient = normalizeSingle(
    invoiceRecord.patients as { full_name?: string | null; patient_number?: string | null; phone_number?: string | null } | Array<{
      full_name?: string | null
      patient_number?: string | null
      phone_number?: string | null
    }> | null,
  )

  // If this invoice is linked to a visit, look up an active admission for that visit
  let admissionForVisit: { id: string; status: string } | null = null
  if (invoiceRecord.visit_id) {
    const { data: admission } = await supabase
      .from("admissions")
      .select("id, status")
      .eq("visit_id", invoiceRecord.visit_id as string)
      .in("status", ["admitted"])
      .maybeSingle()

    if (admission) {
      admissionForVisit = {
        id: admission.id as string,
        status: (admission.status as string) || "admitted",
      }
    }
  }

  const balance = Number(invoiceRecord.total_amount) - Number(invoiceRecord.paid_amount || 0)

  const rows = (auditRows || []) as BillingAuditRow[]
  const existingClaim = (claim || null) as InsuranceClaimRow | null

  const actorIds = Array.from(new Set(rows.map((r) => r.actor_user_id).filter(Boolean))) as string[]

  const actorProfilesById = new Map<string, { full_name: string | null; role: string | null }>()

  if (actorIds.length > 0) {
    const { data: actorProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("id", actorIds)

    for (const p of actorProfiles || []) {
      actorProfilesById.set(p.id as string, {
        full_name: (p.full_name as string | null) ?? null,
        role: (p.role as string | null) ?? null,
      })
    }
  }

  const formatAuditTimestamp = (value: string) => formatDateTime(value, settings)

  const renderActor = (actorId: string) => {
    const actor = actorProfilesById.get(actorId)
    if (!actor) return actorId
    if (actor.role) {
      return `${actor.full_name ?? "Unknown"} (${actor.role})`
    }
    return actor.full_name ?? actorId
  }

  async function recordPayment(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("billing.manage")
    const parsed = z
      .object({
        amount: z.coerce.number().positive(),
        payment_method: z.string().trim().min(1).max(100),
      })
      .safeParse({
        amount: formData.get("amount"),
        payment_method: formData.get("payment_method"),
      })
    if (!parsed.success) {
      redirect(`/dashboard/billing/${id}`)
    }
    const paymentAmount = parsed.data.amount
    const paymentMethod = parsed.data.payment_method

    const rpcResult = await supabase.rpc("record_invoice_payment_transactional", {
      p_invoice_id: id,
      p_payment_amount: paymentAmount,
      p_payment_method: paymentMethod,
      p_actor_user_id: user.id,
    })

    if (rpcResult.error) {
      const rpcErrorCode = String((rpcResult.error as { code?: string } | null)?.code || "")
      if (rpcErrorCode === "42883") {
        redirect(`/dashboard/billing/${id}`)
      }
      redirect(`/dashboard/billing/${id}`)
    }

    const rpcData = (rpcResult.data || null) as
      | {
          ok?: boolean
          code?: string
          old_status?: string | null
          new_status?: string | null
          old_paid_amount?: number | null
          new_paid_amount?: number | null
          old_payment_method?: string | null
          new_payment_method?: string | null
        }
      | null
    if (!rpcData?.ok) {
      redirect(`/dashboard/billing/${id}`)
    }

    await logAuditEvent({
      action: "billing.payment_recorded",
      entityType: "invoice",
      entityId: id,
      user,
      metadata: {
        invoice_id: id,
        patient_id: invoiceRecord.patient_id ?? null,
        visit_id: invoiceRecord.visit_id ?? null,
        payment_method: paymentMethod,
        payment_amount: paymentAmount,
      },
      before: {
        status: rpcData.old_status ?? null,
        paid_amount: Number(rpcData.old_paid_amount ?? 0),
        payment_method: rpcData.old_payment_method ?? null,
      },
      after: {
        status: rpcData.new_status ?? null,
        paid_amount: Number(rpcData.new_paid_amount ?? 0),
        payment_method: rpcData.new_payment_method ?? paymentMethod,
      },
    })

    redirect(`/dashboard/billing/${id}`)
  }

  async function updateClaimStatus(formData: FormData) {
    "use server"

    const { supabase, user } = await requireServerActionPermission("billing.manage")
    const parsed = z
      .object({
        invoice_id: z.string().uuid(),
        new_status: z.enum(["prepared", "submitted", "paid", "rejected"]),
      })
      .safeParse({
        invoice_id: formData.get("invoice_id"),
        new_status: formData.get("new_status"),
      })
    if (!parsed.success) {
      redirect(`/dashboard/billing/${id}`)
    }
    const invoiceId = parsed.data.invoice_id
    const newStatus = parsed.data.new_status

    const rpcResult = await supabase.rpc("update_invoice_claim_status_transactional", {
      p_invoice_id: invoiceId,
      p_new_status: newStatus,
      p_actor_user_id: user.id,
    })

    if (rpcResult.error) {
      console.error("[billing] claim status RPC failed:", rpcResult.error)
      redirect(`/dashboard/billing/${id}`)
    }

    const rpcData = (rpcResult.data || null) as
      | {
          ok?: boolean
          code?: string
          claim_id?: string | null
          old_status?: string | null
          new_status?: string | null
          claimed_amount?: number | null
          patient_id?: string | null
          visit_id?: string | null
          company_id?: string | null
        }
      | null
    if (!rpcData?.ok || !rpcData.claim_id) {
      redirect(`/dashboard/billing/${id}`)
    }

    await logAuditEvent({
      action: "insurance.claim_status_changed",
      entityType: "insurance_claim",
      entityId: rpcData.claim_id,
      user,
      metadata: {
        invoice_id: invoiceId,
        patient_id: rpcData.patient_id ?? invoiceRecord.patient_id ?? null,
        visit_id: rpcData.visit_id ?? invoiceRecord.visit_id ?? null,
        company_id: rpcData.company_id ?? null,
      },
      before: {
        status: rpcData.old_status ?? null,
      },
      after: {
        status: rpcData.new_status ?? newStatus,
      },
    })

    redirect(`/dashboard/billing/${id}`)
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/billing">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Invoices
            </Link>
          </Button>
          {invoice.visit_id && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/billing/visit/${invoice.visit_id}`} title="Back to visit billing">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Visit billing
              </Link>
            </Button>
          )}
          {invoice.payer_type === "company" && (
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/billing/insurance">Insurance billing</Link>
            </Button>
          )}
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">Invoice Details</h1>
            <p className="text-pretty text-muted-foreground">Invoice #{invoice.invoice_number}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={invoice.status === "paid" ? "secondary" : "default"}>{invoice.status}</Badge>
          {admissionForVisit && (
            <Link
              href={`/dashboard/inpatient/${admissionForVisit.id}`}
              className="text-[11px] text-emerald-700 underline-offset-2 hover:underline"
            >
              Admitted – view admission
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(Number(invoice.total_amount), settings)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{formatCurrency(Number(invoice.paid_amount || 0), settings)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Balance Due</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">{formatCurrency(balance, settings)}</p>
          </CardContent>
        </Card>

        {invoice.payer_type === "company" && (
          <Card>
            <CardHeader>
              <CardTitle>Insurance Claim</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {existingClaim ? (
                <>
                  <p>
                    Status: <span className="font-medium capitalize">{existingClaim.status}</span>
                  </p>
                  <p>
                    Claimed: {formatCurrency(Number(existingClaim.claimed_amount || invoice.total_amount || 0), settings)}
                  </p>
                  {existingClaim.approved_amount != null && (
                    <p>Approved: {formatCurrency(Number(existingClaim.approved_amount), settings)}</p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1 text-xs">
                    <form action={updateClaimStatus}>
                      <input type="hidden" name="invoice_id" value={id} />
                      <input type="hidden" name="new_status" value="prepared" />
                      <Button type="submit" size="sm" variant="outline">
                        Mark prepared
                      </Button>
                    </form>
                    <form action={updateClaimStatus}>
                      <input type="hidden" name="invoice_id" value={id} />
                      <input type="hidden" name="new_status" value="submitted" />
                      <Button type="submit" size="sm" variant="outline">
                        Mark submitted
                      </Button>
                    </form>
                    <form action={updateClaimStatus}>
                      <input type="hidden" name="invoice_id" value={id} />
                      <input type="hidden" name="new_status" value="paid" />
                      <Button type="submit" size="sm" variant="outline">
                        Mark paid
                      </Button>
                    </form>
                    <form action={updateClaimStatus}>
                      <input type="hidden" name="invoice_id" value={id} />
                      <input type="hidden" name="new_status" value="rejected" />
                      <Button type="submit" size="sm" variant="outline">
                        Mark rejected
                      </Button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    No insurance claim has been created for this company invoice yet.
                  </p>
                  <form action={updateClaimStatus}>
                    <input type="hidden" name="invoice_id" value={id} />
                    <input type="hidden" name="new_status" value="prepared" />
                    <Button type="submit" size="sm" variant="outline">
                      Prepare claim
                    </Button>
                  </form>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Billing activity</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No billing activity has been recorded for this invoice yet.</p>
            ) : (
              <div className="space-y-3 text-xs text-muted-foreground">
                {rows.map((log) => (
                  <div key={log.id} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">
                        {log.action === "created"
                          ? "Invoice created"
                          : log.action === "payment_recorded"
                            ? "Payment recorded"
                            : "Invoice updated"}
                      </p>
                      {(log.old_status || log.new_status) && (
                        <p>
                          Status: {log.old_status ?? "(none)"} → {log.new_status ?? "(unchanged)"}
                        </p>
                      )}
                      {log.amount != null && (
                        <p>Amount: {formatCurrency(Number(log.amount), settings)}</p>
                      )}
                      <p>By: {renderActor(log.actor_user_id)}</p>
                    </div>
                    <div className="whitespace-nowrap text-right">{formatAuditTimestamp(log.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Name</p>
              <p className="text-lg font-medium">{invoicePatient?.full_name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Patient Number</p>
              <p>{invoicePatient?.patient_number}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Phone</p>
              <p>{invoicePatient?.phone_number || "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Invoice Date</p>
              <p>{formatDate(invoice.created_at, settings, { style: "numeric" })}</p>
            </div>
            {invoice.payment_date && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Payment Date</p>
                <p>{formatDate(invoice.payment_date, settings, { style: "numeric" })}</p>
              </div>
            )}
            {invoice.payment_method && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Payment Method</p>
                <p className="capitalize">{invoice.payment_method}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(item.unit_price), settings)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(item.amount), settings)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={3} className="text-right font-medium">
                  Total
                </TableCell>
                <TableCell className="text-right font-bold">
                  {formatCurrency(Number(invoice.total_amount), settings)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {invoice.notes && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Notes</p>
                <p className="text-sm">{invoice.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {balance > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Record Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={recordPayment} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="amount">Payment Amount ({settings.currencyCode}) *</Label>
                  <Input id="amount" name="amount" type="number" min="0" max={balance} step="0.01" required />
                  <p className="text-sm text-muted-foreground">Maximum: {formatCurrency(balance, settings)}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment_method">Payment Method *</Label>
                  <Select name="payment_method" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button type="submit">Record Payment</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
