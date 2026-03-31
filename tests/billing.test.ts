import { describe, it, expect } from "vitest"
import { calculateInvoiceTotals, type InvoiceLineItem } from "../lib/billing"

describe("calculateInvoiceTotals", () => {
  it("calculates subtotal, tax and total for valid items", () => {
    const items: InvoiceLineItem[] = [
      { description: "Consultation", quantity: 1, unit_price: 100 },
      { description: "Lab test", quantity: 2, unit_price: 50 },
    ]

    const result = calculateInvoiceTotals(items)

    expect(result.subtotal).toBe(200)
    expect(result.tax).toBe(0)
    expect(result.total).toBe(200)
  })

  it("filters out invalid items (zero quantity or negative price)", () => {
    const items: InvoiceLineItem[] = [
      { description: "Consultation", quantity: 1, unit_price: 100 },
      { description: "Bad qty", quantity: 0, unit_price: 999 },
      { description: "Bad price", quantity: 1, unit_price: -10 },
    ]

    const result = calculateInvoiceTotals(items)

    expect(result.items).toHaveLength(1)
    expect(result.subtotal).toBe(100)
    expect(result.total).toBe(100)
  })

  it("handles zero items gracefully", () => {
    const items: InvoiceLineItem[] = []

    const result = calculateInvoiceTotals(items)

    expect(result.items).toHaveLength(0)
    expect(result.subtotal).toBe(0)
    expect(result.tax).toBe(0)
    expect(result.total).toBe(0)
  })

  it("handles very large invoice totals without precision loss", () => {
    const items: InvoiceLineItem[] = [
      { description: "High cost item", quantity: 1, unit_price: 1_000_000_000 },
      { description: "Another high cost", quantity: 2, unit_price: 500_000_000 },
    ]

    const result = calculateInvoiceTotals(items)

    expect(result.subtotal).toBe(2_000_000_000)
    expect(result.total).toBe(2_000_000_000)
  })
})
