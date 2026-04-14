import { describe, expect, it, vi } from "vitest"
import { advanceVisitToDoctorReviewIfDiagnosticsComplete } from "../lib/visit-flow"

type Row = { status?: string | null }

function makeSupabaseForAdvance(params: {
  visitStatus: string
  investigations?: Row[]
  labTests?: Row[]
  radiology?: Row[]
}) {
  const updateEq = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn(() => ({ eq: updateEq }))

  const visitsMaybeSingle = vi.fn().mockResolvedValue({ data: { visit_status: params.visitStatus }, error: null })

  const visitsSelect = vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: visitsMaybeSingle,
    })),
  }))

  const tableRows: Record<string, Row[]> = {
    investigations: params.investigations || [],
    lab_tests: params.labTests || [],
    radiology_requests: params.radiology || [],
  }

  const from = vi.fn((table: string) => {
    if (table === "visits") {
      return { select: visitsSelect, update }
    }

    if (tableRows[table]) {
      return {
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: tableRows[table], error: null }),
        })),
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    client: { from, rpc: vi.fn() },
    update,
    updateEq,
  }
}

describe("visit-flow diagnostics completion", () => {
  it("does not transition when visit is not lab_pending", async () => {
    const mocks = makeSupabaseForAdvance({ visitStatus: "doctor_pending" })

    await advanceVisitToDoctorReviewIfDiagnosticsComplete(mocks.client as never, "visit-1")

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.updateEq).not.toHaveBeenCalled()
  })

  it("does not transition when diagnostics are still outstanding", async () => {
    const mocks = makeSupabaseForAdvance({
      visitStatus: "lab_pending",
      investigations: [{ status: "in_progress" }],
      labTests: [{ status: "completed" }],
      radiology: [{ status: "cancelled" }],
    })

    await advanceVisitToDoctorReviewIfDiagnosticsComplete(mocks.client as never, "visit-2")

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.updateEq).not.toHaveBeenCalled()
  })

  it("transitions to doctor_review only when all diagnostics are complete/cancelled", async () => {
    const mocks = makeSupabaseForAdvance({
      visitStatus: "lab_pending",
      investigations: [{ status: "completed" }],
      labTests: [{ status: "cancelled" }],
      radiology: [{ status: "completed" }],
    })

    await advanceVisitToDoctorReviewIfDiagnosticsComplete(mocks.client as never, "visit-3")

    expect(mocks.update).toHaveBeenCalledWith({ visit_status: "doctor_review" })
    expect(mocks.updateEq).toHaveBeenCalledWith("id", "visit-3")
  })
})
