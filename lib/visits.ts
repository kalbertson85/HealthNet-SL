export type VisitStatus =
  | "doctor_pending"
  | "lab_pending"
  | "doctor_review"
  | "billing_pending"
  | "pharmacy_pending"
  | "admitted"
  | "completed"

const ALLOWED_TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  doctor_pending: ["lab_pending", "billing_pending", "admitted"],
  lab_pending: ["doctor_review"],
  doctor_review: ["billing_pending", "admitted"],
  billing_pending: ["pharmacy_pending", "admitted"],
  pharmacy_pending: ["completed"],
  admitted: ["completed"],
  completed: [],
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
