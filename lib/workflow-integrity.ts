import { ROLES } from "@/lib/utils"

const TERMINAL_VISIT_STATUSES = new Set(["completed", "discharged"])
const CLOSED_PRESCRIPTION_STATUSES = new Set(["dispensed", "cancelled"])

export function normalizeVisitStatus(status: string | null | undefined): string {
  return String(status || "").trim().toLowerCase()
}

export function isVisitTerminal(status: string | null | undefined): boolean {
  return TERMINAL_VISIT_STATUSES.has(normalizeVisitStatus(status))
}

export function isCrossFacilityAccessDenied(params: {
  userRole: string | null | undefined
  userFacilityId: string | null | undefined
  resourceFacilityId: string | null | undefined
}): boolean {
  const userRole = String(params.userRole || "").toLowerCase()
  const userFacilityId = params.userFacilityId ?? null
  const resourceFacilityId = params.resourceFacilityId ?? null

  if (userRole === ROLES.ADMIN) return false
  if (!userFacilityId || !resourceFacilityId) return false
  return userFacilityId !== resourceFacilityId
}

export function doesVisitBelongToPatient(params: {
  visitPatientId: string | null | undefined
  patientId: string | null | undefined
}): boolean {
  const visitPatientId = params.visitPatientId ?? null
  const patientId = params.patientId ?? null
  return Boolean(visitPatientId && patientId && visitPatientId === patientId)
}

export function canCreateVisitForPatient(params: { patientExists: boolean }): boolean {
  return params.patientExists
}

export function canCreateVisitScopedAction(params: {
  patientExists: boolean
  visitExists: boolean
  visitStatus: string | null | undefined
}): boolean {
  if (!params.patientExists) return false
  if (!params.visitExists) return false
  return !isVisitTerminal(params.visitStatus)
}

export function canCreateBillingForVisit(params: {
  patientExists: boolean
  visitExists: boolean
  visitStatus: string | null | undefined
}): boolean {
  return canCreateVisitScopedAction(params)
}

export function canCreatePrescriptionForVisit(params: {
  patientExists: boolean
  visitExists: boolean
  visitStatus: string | null | undefined
}): boolean {
  return canCreateVisitScopedAction(params)
}

export function canDispensePrescription(params: {
  visitExists: boolean
  visitStatus: string | null | undefined
  prescriptionExists: boolean
  prescriptionStatus: string | null | undefined
}): boolean {
  if (!params.visitExists || isVisitTerminal(params.visitStatus)) return false
  if (!params.prescriptionExists) return false
  const prescriptionStatus = String(params.prescriptionStatus || "").trim().toLowerCase()
  if (!prescriptionStatus) return false
  return !CLOSED_PRESCRIPTION_STATUSES.has(prescriptionStatus)
}
