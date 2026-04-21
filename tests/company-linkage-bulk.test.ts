import { describe, expect, it, vi } from "vitest"
import { applySuggestedLinkageWithRollback, summarizeLinkageSuggestions } from "../lib/billing/linkage-bulk"

describe("company linkage bulk helpers", () => {
  it("skips dependent suggestion without principal employee", async () => {
    const apply = vi.fn(async () => {})
    const rollback = vi.fn(async () => {})
    const onSkipped = vi.fn(async () => {})

    const result = await applySuggestedLinkageWithRollback({
      suggestion: {
        linkageType: "dependent",
        principalEmployeeId: "",
        dependentRelationship: "Dependent",
        reason: "missing principal",
      },
      apply,
      rollback,
      onSkipped,
    })

    expect(result.outcome).toBe("skipped")
    expect(apply).not.toHaveBeenCalled()
    expect(rollback).not.toHaveBeenCalled()
    expect(onSkipped).toHaveBeenCalledTimes(1)
  })

  it("rolls back on apply failure", async () => {
    const apply = vi.fn(async () => {
      throw new Error("db failed")
    })
    const rollback = vi.fn(async () => {})
    const onFailed = vi.fn(async () => {})

    const result = await applySuggestedLinkageWithRollback({
      suggestion: {
        linkageType: "employee",
        principalEmployeeId: "",
        dependentRelationship: "Spouse",
        reason: "default",
      },
      apply,
      rollback,
      onFailed,
    })

    expect(result.outcome).toBe("failed")
    expect(rollback).toHaveBeenCalledTimes(1)
    expect(onFailed).toHaveBeenCalledTimes(1)
  })

  it("applies successfully when suggestion is valid", async () => {
    const apply = vi.fn(async () => {})
    const rollback = vi.fn(async () => {})
    const onApplied = vi.fn(async () => {})

    const result = await applySuggestedLinkageWithRollback({
      suggestion: {
        linkageType: "employee",
        principalEmployeeId: "",
        dependentRelationship: "Spouse",
        reason: "default",
      },
      apply,
      rollback,
      onApplied,
    })

    expect(result.outcome).toBe("applied")
    expect(apply).toHaveBeenCalledTimes(1)
    expect(rollback).not.toHaveBeenCalled()
    expect(onApplied).toHaveBeenCalledTimes(1)
  })

  it("summarizes actionable and blocked suggestions", () => {
    const summary = summarizeLinkageSuggestions([
      {
        linkageType: "employee",
        principalEmployeeId: "",
        dependentRelationship: "Spouse",
        reason: "employee",
      },
      {
        linkageType: "dependent",
        principalEmployeeId: "emp_1",
        dependentRelationship: "Child",
        reason: "dependent",
      },
      {
        linkageType: "dependent",
        principalEmployeeId: "",
        dependentRelationship: "Dependent",
        reason: "blocked",
      },
      null,
    ])

    expect(summary).toEqual({
      actionable: 2,
      blocked: 2,
      employee: 1,
      dependent: 2,
    })
  })
})

