import { describe, expect, it } from "vitest"
import { computeInvoicePaymentUpdate, isInvoiceMutationNoOp } from "../lib/webhooks/mobile-money-mutation"

describe("computeInvoicePaymentUpdate", () => {
  it("marks invoice partial when payment does not cover total", () => {
    const result = computeInvoicePaymentUpdate(
      { total_amount: 1000, paid_amount: 200 },
      300,
      "2026-03-31T16:00:00.000Z",
    )

    expect(result).toEqual({
      paidAmount: 500,
      status: "partial",
      paymentDate: null,
    })
  })

  it("marks invoice paid and sets payment date when payment reaches total", () => {
    const result = computeInvoicePaymentUpdate(
      { total_amount: 1000, paid_amount: 900 },
      200,
      "2026-03-31T16:00:00.000Z",
    )

    expect(result).toEqual({
      paidAmount: 1000,
      status: "paid",
      paymentDate: "2026-03-31T16:00:00.000Z",
    })
  })

  it("detects no-op mutation when invoice state is unchanged", () => {
    const computed = {
      paidAmount: 1000,
      status: "paid" as const,
      paymentDate: "2026-03-31T16:00:00.000Z",
    }

    const noOp = isInvoiceMutationNoOp(
      {
        paid_amount: 1000,
        status: "paid",
        payment_date: "2026-03-31T16:00:00.000Z",
      },
      computed,
    )

    expect(noOp).toBe(true)
  })

  it("detects non no-op mutation when paid amount changes", () => {
    const computed = {
      paidAmount: 1000,
      status: "paid" as const,
      paymentDate: "2026-03-31T16:00:00.000Z",
    }

    const noOp = isInvoiceMutationNoOp(
      {
        paid_amount: 900,
        status: "partial",
        payment_date: null,
      },
      computed,
    )

    expect(noOp).toBe(false)
  })
})
