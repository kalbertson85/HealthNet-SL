import { describe, expect, it, vi } from "vitest"
import { createInsuranceBillingBatchTransactional } from "../lib/billing/insurance-batches"

describe("createInsuranceBillingBatchTransactional", () => {
  const args = {
    batchNumber: "INS-202604091200",
    companyId: "11111111-1111-4111-8111-111111111111",
    fromDate: "2026-04-01",
    toDate: "2026-04-30",
    createdBy: "22222222-2222-4222-8222-222222222222",
    invoiceIds: ["33333333-3333-4333-8333-333333333333"],
  }

  it("returns rpc batch id when transactional rpc is available", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: "batch-rpc-1", error: null }),
      from: vi.fn(),
    }

    const batchId = await createInsuranceBillingBatchTransactional(supabase, args)
    expect(batchId).toBe("batch-rpc-1")
    expect(supabase.rpc).toHaveBeenCalledWith("create_insurance_billing_batch", expect.any(Object))
  })

  it("falls back to table operations when rpc function is missing", async () => {
    const batchDeleteEqMock = vi.fn().mockResolvedValue({ error: null })
    const invoiceUpdateInMock = vi.fn().mockResolvedValue({ error: null })

    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42883", message: "function does not exist" } }),
      from: vi.fn((table: string) => {
        if (table === "invoices") {
          return {
            select: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "33333333-3333-4333-8333-333333333333",
                    patient_id: "44444444-4444-4444-8444-444444444444",
                    visit_id: "55555555-5555-4555-8555-555555555555",
                    total_amount: 250,
                    paid_amount: 100,
                  },
                ],
                error: null,
              }),
            })),
            update: vi.fn(() => ({
              in: invoiceUpdateInMock,
              eq: vi.fn(),
            })),
          }
        }

        if (table === "insurance_billing_batches") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { id: "batch-fallback-1" }, error: null }),
              })),
            })),
            delete: vi.fn(() => ({
              eq: batchDeleteEqMock,
            })),
          }
        }

        if (table === "insurance_billing_batch_items") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
            delete: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    const batchId = await createInsuranceBillingBatchTransactional(supabase, args)
    expect(batchId).toBe("batch-fallback-1")
    expect(invoiceUpdateInMock).toHaveBeenCalled()
    expect(batchDeleteEqMock).not.toHaveBeenCalled()
  })
})
