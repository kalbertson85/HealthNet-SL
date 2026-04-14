export function parseAllergyTerms(input: string | null | undefined): string[] {
  if (!input) return []
  return input
    .split(/[\n,;/]+/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 3)
}

function normalizeMedicationName(value: string): string {
  return value.trim().toLowerCase()
}

export function findMedicationAllergyMatches(allergies: string | null | undefined, medicationNames: string[]): string[] {
  const allergyTerms = parseAllergyTerms(allergies)
  if (allergyTerms.length === 0) return []

  const matches = new Set<string>()
  for (const medication of medicationNames) {
    const normalizedMedication = normalizeMedicationName(medication)
    if (!normalizedMedication) continue

    for (const term of allergyTerms) {
      if (normalizedMedication.includes(term) || term.includes(normalizedMedication)) {
        matches.add(term)
      }
    }
  }
  return Array.from(matches)
}
