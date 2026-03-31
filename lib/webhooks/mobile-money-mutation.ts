import { getSupabaseAdminClient } from "@/lib/storage"
import { logSystemAuditEvent } from "@/lib/audit"

const ENABLE_MOBILE_MONEY_INVOICE_MUTATION_ENV = "ENABLE_MOBILE_MONEY_INVOICE_MUTATION"

interface InvoiceRow {
  id: string
  total_amount: number | null
  paid_amount: number | null
  status: string | null
  payment_date: string | null
}

export interface InvoicePaymentComputation {
  paidAmount: number
  status: "pending" | "partial" | "paid"
  paymentDate: string | null
}

export function isInvoiceMutationNoOp(
  invoice: Pick<InvoiceRow, "paid_amount" | "status" | "payment_date">,
  computed: InvoicePaymentComputation,
): boolean {
  const currentPaid = Math.max(Number(invoice.paid_amount ?? 0), 0)
  const currentStatus = (invoice.status || "").trim().toLowerCase()
  const computedStatus = computed.status.toLowerCase()
  const currentPaymentDate = invoice.payment_date ?? null
  const computedPaymentDate = computed.paymentDate ?? null

  return currentPaid === computed.paidAmount && currentStatus === computedStatus && currentPaymentDate === computedPaymentDate
}

export function isMobileMoneyInvoiceMutationEnabled(): boolean {
  const raw = (process.env[ENABLE_MOBILE_MONEY_INVOICE_MUTATION_ENV] || "").trim().toLowerCase()
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
}

export function computeInvoicePaymentUpdate(
  invoice: Pick<InvoiceRow, "total_amount" | "paid_amount">,
  paymentAmount: number,
  nowIso: string,
): InvoicePaymentComputation {
  const total = Math.max(Number(invoice.total_amount ?? 0), 0)
  const currentPaid = Math.max(Number(invoice.paid_amount ?? 0), 0)
  const normalizedPayment = Math.max(Number(paymentAmount || 0), 0)
  const paidAmount = Math.min(total, currentPaid + normalizedPayment)
  const status: InvoicePaymentComputation["status"] = paidAmount >= total ? "paid" : paidAmount > 0 ? "partial" : "pending"
  return {
    paidAmount,
    status,
    paymentDate: status === "paid" ? nowIso : null,
  }
}

function toNumericAmount(amount: string | number): number | null {
  const numeric = typeof amount === "number" ? amount : Number.parseFloat(amount)
  if (!Number.isFinite(numeric) || numeric < 0) return null
  return numeric
}

function isSuccessfulPaymentStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase()
  return normalized === "success" || normalized === "paid" || normalized === "completed"
}

export async function maybeApplyMobileMoneyInvoicePayment(input: {
  eventId: string
  invoiceId: string | null | undefined
  amount: string | number
  status: string
  transactionId?: string | null
  reference?: string | null
}): Promise<void> {
  if (!isMobileMoneyInvoiceMutationEnabled()) return
  if (!isSuccessfulPaymentStatus(input.status)) return

  const invoiceId = (input.invoiceId || "").trim()
  if (!invoiceId) return

  const paymentAmount = toNumericAmount(input.amount)
  if (paymentAmount === null || paymentAmount <= 0) return

  try {
    const supabase = getSupabaseAdminClient()
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("id, total_amount, paid_amount, status, payment_date")
      .eq("id", invoiceId)
      .maybeSingle()

    if (error || !invoice) {
      console.error("[v0] Mobile money webhook mutation failed to load invoice", error?.message || error || invoiceId)
      return
    }

    const typedInvoice = invoice as InvoiceRow
    const computed = computeInvoicePaymentUpdate(typedInvoice, paymentAmount, new Date().toISOString())
    if (isInvoiceMutationNoOp(typedInvoice, computed)) {
      return
    }

    const updatePayload = {
      paid_amount: computed.paidAmount,
      status: computed.status,
      payment_date: computed.paymentDate ?? typedInvoice.payment_date,
      payment_method: "mobile_money",
    }

    const { error: updateError } = await supabase.from("invoices").update(updatePayload).eq("id", invoiceId)
    if (updateError) {
      console.error("[v0] Mobile money webhook mutation failed to update invoice", updateError.message || updateError)
      return
    }

    await logSystemAuditEvent({
      action: "webhook.mobile_money.invoice_mutated",
      resourceType: "invoice",
      resourceId: invoiceId,
      metadata: {
        event_id: input.eventId,
        source: "mobile_money_webhook",
        amount: paymentAmount,
        old_status: typedInvoice.status,
        new_status: computed.status,
        old_paid_amount: typedInvoice.paid_amount ?? 0,
        new_paid_amount: computed.paidAmount,
        transaction_id: input.transactionId ?? null,
        reference: input.reference ?? null,
      },
    })
  } catch (error) {
    console.error("[v0] Mobile money webhook mutation exception", error)
  }
}
