import { describe, expect, it } from "vitest"
import { fetchDataConsistencyCounts } from "../lib/data-consistency"

describe("fetchDataConsistencyCounts", () => {
  it("uses RPC metrics when available", async () => {
    const supabase = {
      rpc: async (fn: string) => {
        if (fn === "admin_data_consistency_alerts") {
          return {
            data: [
              {
                visits_without_billing: 4,
                open_prescriptions_without_dispense: 7,
                prescriptions_without_items: 2,
                invoices_without_items: 1,
                queue_in_progress_without_visit: 3,
                insurance_batches_without_totals: 2,
                insurance_batches_with_mismatch: 1,
                discharged_admissions_missing_summary: 6,
              },
            ],
            error: null,
          }
        }
        return { data: [], error: null }
      },
      from: () => {
        throw new Error("should not use fallback queries when rpc succeeds")
      },
    }

    const counts = await fetchDataConsistencyCounts(supabase)
    expect(counts).toMatchObject({
      visits_without_billing: 4,
      open_prescriptions_without_dispense: 7,
      prescriptions_without_items: 2,
      invoices_without_items: 1,
      queue_in_progress_without_visit: 3,
      insurance_batches_without_totals: 2,
      insurance_batches_with_mismatch: 1,
      discharged_admissions_missing_summary: 6,
      source: "rpc",
      truncated: false,
    })
  })

  it("falls back safely when RPC is unavailable", async () => {
    const from = (table: string) => ({
      select: () => {
        if (table === "visits") {
          return {
            eq: async () => ({ count: 5, error: null }),
          }
        }
        if (table === "prescriptions") {
          return {
            in: async () => ({ count: 9, error: null }),
            not: async () => ({ count: 2, error: null }),
          }
        }
        if (table === "invoices") {
          return {
            not: async () => ({ count: 1, error: null }),
          }
        }
        if (table === "queues") {
          return {
            eq: () => ({
              is: async () => ({ count: 2, error: null }),
            }),
          }
        }
        if (table === "insurance_billing_batches") {
          return {
            lte: async () => ({ count: 1, error: null }),
          }
        }
        if (table === "admissions") {
          return {
            eq: () => ({
              is: async () => ({ count: 8, error: null }),
            }),
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      },
    })

    const supabase = {
      rpc: async (fn: string) => {
        if (fn === "admin_data_consistency_alerts") {
          return { data: null, error: { message: "function does not exist" } }
        }
        if (fn === "insurance_batch_total_mismatches_fallback") {
          return {
            data: [{ insurance_batches_without_totals: 3, insurance_batches_with_mismatch: 4 }],
            error: null,
          }
        }
        return { data: null, error: null }
      },
      from,
    }

    const counts = await fetchDataConsistencyCounts(supabase as unknown as Parameters<typeof fetchDataConsistencyCounts>[0])
    expect(counts).toMatchObject({
      visits_without_billing: 5,
      open_prescriptions_without_dispense: 9,
      prescriptions_without_items: 2,
      invoices_without_items: 1,
      queue_in_progress_without_visit: 2,
      insurance_batches_without_totals: 3,
      insurance_batches_with_mismatch: 4,
      discharged_admissions_missing_summary: 8,
      source: "fallback",
      truncated: false,
    })
  })
})
