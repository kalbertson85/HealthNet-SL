export interface StockRow {
  medication_id: string
  quantity_on_hand: number
}

export interface DispenseItem {
  medication_id: string
  quantity: number
}

export function applyDispenseToStock(stock: StockRow[], items: DispenseItem[]): StockRow[] {
  const stockMap = new Map<string, number>()
  for (const row of stock) {
    stockMap.set(row.medication_id, row.quantity_on_hand)
  }

  for (const item of items) {
    if (item.quantity <= 0) continue

    const current = stockMap.get(item.medication_id) ?? 0
    if (item.quantity > current) {
      throw new Error(`Insufficient stock for medication ${item.medication_id}`)
    }

    stockMap.set(item.medication_id, current - item.quantity)
  }

  return stock.map((row) => ({
    ...row,
    quantity_on_hand: stockMap.get(row.medication_id) ?? row.quantity_on_hand,
  }))
}
