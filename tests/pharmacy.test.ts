import { describe, it, expect } from "vitest"
import { applyDispenseToStock, type StockRow, type DispenseItem } from "../lib/pharmacy"

describe("applyDispenseToStock", () => {
  it("deducts quantities for dispensed items", () => {
    const stock: StockRow[] = [
      { medication_id: "med1", quantity_on_hand: 10 },
      { medication_id: "med2", quantity_on_hand: 5 },
    ]

    const items: DispenseItem[] = [
      { medication_id: "med1", quantity: 3 },
      { medication_id: "med2", quantity: 2 },
    ]

    const result = applyDispenseToStock(stock, items)

    expect(result.find((r) => r.medication_id === "med1")?.quantity_on_hand).toBe(7)
    expect(result.find((r) => r.medication_id === "med2")?.quantity_on_hand).toBe(3)
  })

  it("throws if there is insufficient stock", () => {
    const stock: StockRow[] = [{ medication_id: "med1", quantity_on_hand: 2 }]
    const items: DispenseItem[] = [{ medication_id: "med1", quantity: 3 }]

    expect(() => applyDispenseToStock(stock, items)).toThrow(/Insufficient stock/)
  })
})
