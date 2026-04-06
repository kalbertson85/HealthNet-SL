import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { fetchInsuranceBatchDetails } from "@/lib/billing/insurance-batches"

export default async function InsuranceBillingBatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { user } = await getSessionUserAndProfile()
  if (!user) redirect("/auth/login")
  if (!can(user, "billing.manage")) redirect("/dashboard")

  const { id } = await params

  async function markSubmitted() {
    "use server"
    const supabase = await createServerClient()
    const { user } = await getSessionUserAndProfile()
    if (!user) redirect("/auth/login")
    if (!can(user, "billing.manage")) redirect("/dashboard")
    await supabase
      .from("insurance_billing_batches")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", id)
    redirect(`/dashboard/billing/insurance/${id}`)
  }

  async function markPaid() {
    "use server"
    const supabase = await createServerClient()
    const { user } = await getSessionUserAndProfile()
    if (!user) redirect("/auth/login")
    if (!can(user, "billing.manage")) redirect("/dashboard")

    const { data: currentBatch } = await supabase
      .from("insurance_billing_batches")
      .select("id, total_amount")
      .eq("id", id)
      .maybeSingle()

    const { data: batchItems } = await supabase
      .from("insurance_billing_batch_items")
      .select("invoice_id")
      .eq("batch_id", id)

    const invoiceIds = (batchItems || []).map((row) => row.invoice_id as string).filter(Boolean)
    if (invoiceIds.length > 0) {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, total_amount")
        .in("id", invoiceIds)

      for (const invoice of invoices || []) {
        await supabase
          .from("invoices")
          .update({
            paid_amount: Number(invoice.total_amount || 0),
            status: "paid",
            payment_date: new Date().toISOString(),
            payment_method: "insurance_batch",
          })
          .eq("id", invoice.id as string)
      }
    }

    await supabase
      .from("insurance_billing_batches")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_amount: Number(currentBatch?.total_amount || 0),
      })
      .eq("id", id)

    redirect(`/dashboard/billing/insurance/${id}`)
  }

  const batchDetails = await fetchInsuranceBatchDetails(supabase, id)
  if (!batchDetails) notFound()

  const { batch, groupedPatients } = batchDetails
  const balance = Math.max(batch.total_amount - batch.paid_amount, 0)
  const unlinkedBeneficiaries = groupedPatients.filter((group) => !group.relationship || group.relationship === "Unlinked")
  const auditHref = batch.company_id
    ? `/dashboard/reports/company-billing?${new URLSearchParams({
        company_id: batch.company_id,
        ...(batch.from_date ? { from: batch.from_date } : {}),
        ...(batch.to_date ? { to: batch.to_date } : {}),
      }).toString()}#linkage-audit`
    : "/dashboard/reports/company-billing"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Insurance invoice</h1>
          <p className="text-sm text-muted-foreground">
            {batch.batch_number} · {batch.companyName || "Unknown provider"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/billing/insurance">Back to Insurance Billing</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/api/billing/insurance/${id}/pdf`} target="_blank">Download PDF</Link>
          </Button>
          {batch.status === "draft" ? (
            <form action={markSubmitted}>
              <Button type="submit" size="sm">Mark submitted</Button>
            </form>
          ) : null}
          {batch.status !== "paid" ? (
            <form action={markPaid}>
              <Button type="submit" size="sm" variant="outline">Mark paid</Button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Status</CardTitle></CardHeader><CardContent><Badge variant={batch.status === "paid" ? "secondary" : "outline"}>{batch.status}</Badge></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Period</CardTitle></CardHeader><CardContent><p className="text-sm">{batch.from_date} to {batch.to_date}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Grand total</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">Le {batch.total_amount.toLocaleString()}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Balance</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">Le {balance.toLocaleString()}</p></CardContent></Card>
      </div>

      {unlinkedBeneficiaries.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {unlinkedBeneficiaries.length} beneficiar{unlinkedBeneficiaries.length === 1 ? "y is" : "ies are"} still unlinked to the employee/dependent roster in this batch.
          The payer-facing statement will work, but relationship labels will remain incomplete until those records are linked.{" "}
          <Link href={auditHref} className="font-medium underline-offset-2 hover:underline">
            Open roster linkage audit
          </Link>
          .
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Beneficiaries and services</CardTitle>
          <CardDescription>
            Each beneficiary keeps the original visit invoice lines, with totals rolled up into one payer-facing insurer invoice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {groupedPatients.map((group) => (
            <div key={`${group.patientId || group.patientNumber}-${group.patientName}`} className="rounded-md border px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{group.patientName}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.patientNumber}
                    {group.relationship ? ` · ${group.relationship}` : ""}
                    {group.principalEmployeeName ? ` · Principal: ${group.principalEmployeeName}` : ""}
                  </p>
                </div>
                <p className="text-sm font-semibold">Le {group.total.toLocaleString()}</p>
              </div>
              <div className="mt-4 space-y-3">
                {group.invoices.map((invoice) => (
                  <div key={invoice.invoiceId} className="rounded-md border bg-muted/20 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{invoice.invoiceNumber}</p>
                      <p className="text-sm font-semibold">Le {invoice.amount.toLocaleString()}</p>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{invoice.visitReference}</span>
                      <span>{invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString("en-GB") : ""}</span>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {invoice.lineItems.length > 0 ? invoice.lineItems.map((item, index) => (
                        <div key={`${invoice.invoiceId}-${index}`} className="flex items-center justify-between gap-3">
                          <span>{item.description}</span>
                          <span>{item.quantity} × Le {item.unit_price.toLocaleString()} = Le {item.amount.toLocaleString()}</span>
                        </div>
                      )) : (
                        <p>No invoice line items recorded.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
