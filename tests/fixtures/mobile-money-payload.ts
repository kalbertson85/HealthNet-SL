export interface MobileMoneyPayload {
  event_id: string
  event_type: string
  transaction_id: string
  reference: string
  invoice_id: string
  status: string
  amount: string
  currency: string
  provider: string
  customer_msisdn: string
}

export function buildMobileMoneyPayload(overrides: Partial<MobileMoneyPayload> = {}): MobileMoneyPayload {
  return {
    event_id: "mm_evt_provider_1001",
    event_type: "payment.completed",
    transaction_id: "trx_99887766",
    reference: "INV-2026-0042",
    invoice_id: "inv_0042",
    status: "success",
    amount: "125000.50",
    currency: "SLE",
    provider: "mobile_money_partner_x",
    customer_msisdn: "+23270000000",
    ...overrides,
  }
}

export function toMobileMoneyRawBody(overrides: Partial<MobileMoneyPayload> = {}): string {
  return JSON.stringify(buildMobileMoneyPayload(overrides))
}
