export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_price: number
}

export function calculateInvoiceTotals(items: InvoiceLineItem[]) {
  const validItems = items.filter((item) => item.description && item.quantity > 0 && item.unit_price >= 0)

  const subtotal = validItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const tax = 0
  const total = subtotal + tax

  return { subtotal, tax, total, items: validItems }
}
