export type VisitStatus =
  | "doctor_pending"
  | "lab_pending"
  | "doctor_review"
  | "billing_pending"
  | "pharmacy_pending"
  | "admitted"
  | "completed"
  | "discharged"

const ALLOWED_TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  doctor_pending: ["lab_pending", "billing_pending", "admitted"],
  lab_pending: ["doctor_review"],
  doctor_review: ["billing_pending", "admitted"],
  billing_pending: ["pharmacy_pending", "admitted", "completed"],
  pharmacy_pending: ["completed"],
  admitted: ["completed"],
  completed: [],
  discharged: [],
}

const KNOWN_VISIT_STATUSES = new Set<VisitStatus>(Object.keys(ALLOWED_TRANSITIONS) as VisitStatus[])

export function parseVisitStatus(value: unknown): VisitStatus | null {
  const normalized = String(value ?? "").trim().toLowerCase()
  if (!normalized) return null
  return KNOWN_VISIT_STATUSES.has(normalized as VisitStatus) ? (normalized as VisitStatus) : null
}

export function canTransitionVisitStatus(from: VisitStatus, to: VisitStatus): boolean {
  if (from === to) return true
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertVisitTransition(from: VisitStatus, to: VisitStatus): void {
  if (!canTransitionVisitStatus(from, to)) {
    throw new Error(`Invalid visit status transition: ${from} -> ${to}`)
  }
}
