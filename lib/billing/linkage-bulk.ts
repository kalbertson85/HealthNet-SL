export type LinkageSuggestion = {
  linkageType: "employee" | "dependent"
  principalEmployeeId: string
  dependentRelationship: string
  reason: string
}

export async function applySuggestedLinkageWithRollback(args: {
  suggestion: LinkageSuggestion
  apply: () => Promise<void>
  rollback: () => Promise<void>
  onApplied?: () => Promise<void>
  onSkipped?: () => Promise<void>
  onFailed?: (error: unknown) => Promise<void>
}) {
  if (args.suggestion.linkageType === "dependent" && !args.suggestion.principalEmployeeId) {
    if (args.onSkipped) await args.onSkipped()
    return { outcome: "skipped" as const, reason: "missing_principal_employee" }
  }

  try {
    await args.apply()
    if (args.onApplied) await args.onApplied()
    return { outcome: "applied" as const }
  } catch (error) {
    await args.rollback()
    if (args.onFailed) await args.onFailed(error)
    return { outcome: "failed" as const, error }
  }
}

export function summarizeLinkageSuggestions(
  suggestions: Array<LinkageSuggestion | null | undefined>,
) {
  return suggestions.reduce(
    (acc, suggestion) => {
      if (!suggestion) {
        acc.blocked += 1
        return acc
      }

      if (suggestion.linkageType === "dependent" && !suggestion.principalEmployeeId) {
        acc.blocked += 1
      } else {
        acc.actionable += 1
      }

      if (suggestion.linkageType === "employee") acc.employee += 1
      if (suggestion.linkageType === "dependent") acc.dependent += 1
      return acc
    },
    { actionable: 0, blocked: 0, employee: 0, dependent: 0 },
  )
}
