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
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"

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

export default async function InvoiceDetailPage(props: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { id } = await props.params

  if (id === "new") {
    redirect("/dashboard/billing/new")
  }

  const [{ data: invoice }, { data: items }, { data: auditRows }, { data: claim }] = await Promise.all([
    supabase
      .from("invoices")
      .select(`
        *,
        patients(full_name, patient_number, phone_number)
      `)
      .eq("id", id)
      .single(),
    supabase.from("invoice_items").select("*").eq("invoice_id", id),
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

  // If this invoice is linked to a visit, look up an active admission for that visit
  let admissionForVisit: { id: string; status: string } | null = null
  if (invoice.visit_id) {
    const { data: admission } = await supabase
      .from("admissions")
      .select("id, status")
      .eq("visit_id", invoice.visit_id as string)
      .in("status", ["admitted"])
      .maybeSingle()

    if (admission) {
      admissionForVisit = {
        id: admission.id as string,
        status: (admission.status as string) || "admitted",
      }
    }
  }

  const balance = Number(invoice.total_amount) - Number(invoice.paid_amount || 0)

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

  const formatDateTime = (value: string) => {
    try {
      return new Date(value).toLocaleString()
    } catch {
      return value
    }
  }

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

    const supabase = await createServerClient()
    const { user, profile } = await getSessionUserAndProfile()

    if (!user) {
      redirect("/auth/login")
    }

    const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
    if (!can(rbacUser, "billing.manage")) {
      redirect("/dashboard")
    }

    const paymentAmount = Number.parseFloat(formData.get("amount") as string)
    const paymentMethod = formData.get("payment_method") as string

    const newPaidAmount = Number(invoice.paid_amount || 0) + paymentAmount
    const newStatus = newPaidAmount >= Number(invoice.total_amount) ? "paid" : newPaidAmount > 0 ? "partial" : "pending"

    await supabase
      .from("invoices")
      .update({
        paid_amount: newPaidAmount,
        status: newStatus,
        payment_date: newStatus === "paid" ? new Date().toISOString() : invoice.payment_date,
        payment_method: paymentMethod,
      })
      .eq("id", id)

    try {
      await supabase.from("billing_audit_logs").insert({
        invoice_id: id,
        actor_user_id: user.id,
        action: "payment_recorded",
        old_status: invoice.status,
        new_status: newStatus,
        amount: paymentAmount,
        metadata: { payment_method: paymentMethod },
      })
    } catch (auditError) {
      console.error("[v0] Error logging invoice payment:", auditError)
    }

    redirect(`/dashboard/billing/${id}`)
  }

  async function updateClaimStatus(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const { user, profile } = await getSessionUserAndProfile()

    if (!user) {
      redirect("/auth/login")
    }

    const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
    if (!can(rbacUser, "billing.manage")) {
      redirect("/dashboard")
    }

    const invoiceId = formData.get("invoice_id") as string
    const newStatus = (formData.get("new_status") as string | null)?.toLowerCase().trim() || null

    if (!invoiceId || !newStatus) {
      redirect(`/dashboard/billing/${id}`)
    }

    const { data: currentInvoice } = await supabase
      .from("invoices")
      .select("id, payer_type, company_id, total_amount, claim_id")
      .eq("id", invoiceId)
      .maybeSingle()

    if (!currentInvoice) {
      redirect(`/dashboard/billing/${id}`)
    }

    if ((currentInvoice.payer_type as string | null) !== "company" || !currentInvoice.company_id) {
      // Only company-paid invoices can have insurance claims
      redirect(`/dashboard/billing/${id}`)
    }

    const claimedAmount = Number(currentInvoice.total_amount || 0)

    const { data: existing } = await supabase
      .from("insurance_claims")
      .select("id")
      .eq("invoice_id", invoiceId)
      .maybeSingle()

    let claimId: string | null = (existing?.id as string | null) ?? null

    if (!claimId) {
      const { data: inserted, error: insertError } = await supabase
        .from("insurance_claims")
        .insert({
          invoice_id: invoiceId,
          company_id: currentInvoice.company_id as string,
          claimed_amount: claimedAmount,
          status: newStatus,
        })
        .select("id")
        .maybeSingle()

      if (insertError || !inserted) {
        console.error("[billing] Error creating insurance claim:", insertError?.message || insertError)
        redirect(`/dashboard/billing/${id}`)
      }

      claimId = inserted.id as string
    } else {
      const { error: updateError } = await supabase
        .from("insurance_claims")
        .update({ status: newStatus })
        .eq("id", claimId)

      if (updateError) {
        console.error("[billing] Error updating insurance claim status:", updateError.message || updateError)
      }
    }

    await supabase
      .from("invoices")
      .update({ claim_status: newStatus, claim_id: claimId })
      .eq("id", invoiceId)

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
            <p className="text-3xl font-bold">Le {Number(invoice.total_amount).toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">Le {Number(invoice.paid_amount || 0).toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Balance Due</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">Le {balance.toLocaleString()}</p>
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
                    Claimed: Le {Number(existingClaim.claimed_amount || invoice.total_amount || 0).toLocaleString()}
                  </p>
                  {existingClaim.approved_amount != null && (
                    <p>Approved: Le {Number(existingClaim.approved_amount).toLocaleString()}</p>
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
                        <p>Amount: Le {Number(log.amount).toLocaleString()}</p>
                      )}
                      <p>By: {renderActor(log.actor_user_id)}</p>
                    </div>
                    <div className="whitespace-nowrap text-right">{formatDateTime(log.created_at)}</div>
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
              <p className="text-lg font-medium">{invoice.patients?.full_name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Patient Number</p>
              <p>{invoice.patients?.patient_number}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Phone</p>
              <p>{invoice.patients?.phone_number || "N/A"}</p>
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
              <p>{new Date(invoice.created_at).toLocaleDateString()}</p>
            </div>
            {invoice.payment_date && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Payment Date</p>
                <p>{new Date(invoice.payment_date).toLocaleDateString()}</p>
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
                  <TableCell className="text-right">Le {Number(item.unit_price).toLocaleString()}</TableCell>
                  <TableCell className="text-right">Le {Number(item.amount).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={3} className="text-right font-medium">
                  Total
                </TableCell>
                <TableCell className="text-right font-bold">
                  Le {Number(invoice.total_amount).toLocaleString()}
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
                  <Label htmlFor="amount">Payment Amount (Le) *</Label>
                  <Input id="amount" name="amount" type="number" min="0" max={balance} step="0.01" required />
                  <p className="text-sm text-muted-foreground">Maximum: Le {balance.toLocaleString()}</p>
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
