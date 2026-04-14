import { ROLES } from "@/lib/utils"

const TERMINAL_VISIT_STATUSES = new Set(["completed", "discharged"])

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
