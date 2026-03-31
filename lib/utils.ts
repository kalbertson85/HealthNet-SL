import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---- RBAC helpers --------------------------------------------------------

export const ROLES = {
  ADMIN: "admin",
  FACILITY_ADMIN: "facility_admin",
  DOCTOR: "doctor",
  NURSE: "nurse",
  PHARMACIST: "pharmacist",
  LAB_TECH: "lab_tech",
  CASHIER: "cashier",
  CLERK: "clerk",
  RECEPTIONIST: "receptionist",
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export type PermissionKey =
  | "dashboard.view"
  | "patients.view"
  | "patients.edit"
  | "patients.create"
  | "appointments.manage"
  | "emergency.manage"
  | "queue.manage"
  | "prescriptions.manage"
  | "lab.manage"
  | "pharmacy.manage"
  | "inpatient.manage"
  | "billing.manage"
  | "notifications.manage"
  | "reports.view"
  | "admin.export"
  | "admin.settings.manage"

// Minimal permission matrix for V0; can be expanded or moved to DB later.
const PERMISSIONS: Record<PermissionKey, Role[]> = {
  "dashboard.view": [
    ROLES.ADMIN,
    ROLES.FACILITY_ADMIN,
    ROLES.DOCTOR,
    ROLES.NURSE,
    ROLES.PHARMACIST,
    ROLES.LAB_TECH,
    ROLES.CASHIER,
    ROLES.CLERK,
    ROLES.RECEPTIONIST,
  ],
  "patients.view": [
    ROLES.ADMIN,
    ROLES.FACILITY_ADMIN,
    ROLES.DOCTOR,
    ROLES.NURSE,
    ROLES.PHARMACIST,
    ROLES.LAB_TECH,
    ROLES.CASHIER,
    ROLES.CLERK,
    ROLES.RECEPTIONIST,
  ],
  "patients.edit": [ROLES.ADMIN, ROLES.FACILITY_ADMIN, ROLES.DOCTOR, ROLES.NURSE, ROLES.CLERK],
  "patients.create": [ROLES.ADMIN, ROLES.FACILITY_ADMIN, ROLES.DOCTOR, ROLES.NURSE, ROLES.RECEPTIONIST, ROLES.CLERK],
  "appointments.manage": [ROLES.ADMIN, ROLES.FACILITY_ADMIN, ROLES.DOCTOR, ROLES.NURSE, ROLES.RECEPTIONIST],
  "emergency.manage": [ROLES.ADMIN, ROLES.FACILITY_ADMIN, ROLES.DOCTOR, ROLES.NURSE],
  "queue.manage": [ROLES.ADMIN, ROLES.FACILITY_ADMIN, ROLES.DOCTOR, ROLES.NURSE, ROLES.RECEPTIONIST],
  "prescriptions.manage": [ROLES.ADMIN, ROLES.FACILITY_ADMIN, ROLES.DOCTOR, ROLES.PHARMACIST],
  "lab.manage": [ROLES.ADMIN, ROLES.FACILITY_ADMIN, ROLES.LAB_TECH, ROLES.DOCTOR],
  "pharmacy.manage": [ROLES.ADMIN, ROLES.FACILITY_ADMIN, ROLES.PHARMACIST],
  "inpatient.manage": [ROLES.ADMIN, ROLES.FACILITY_ADMIN, ROLES.DOCTOR, ROLES.NURSE],
  "billing.manage": [ROLES.ADMIN, ROLES.FACILITY_ADMIN, ROLES.CASHIER],
  "notifications.manage": [ROLES.ADMIN, ROLES.FACILITY_ADMIN],
  "reports.view": [
    ROLES.ADMIN,
    ROLES.FACILITY_ADMIN,
    ROLES.DOCTOR,
    ROLES.NURSE,
    ROLES.LAB_TECH,
    ROLES.CASHIER,
  ],
  "admin.export": [ROLES.ADMIN, ROLES.FACILITY_ADMIN],
  "admin.settings.manage": [ROLES.ADMIN, ROLES.FACILITY_ADMIN],
}

export interface SessionUserLike {
  id: string
  role?: string | null
  facility_id?: string | null
}

export class PermissionError extends Error {
  status: 401 | 403

  constructor(status: 401 | 403, message: string) {
    super(message)
    this.name = "PermissionError"
    this.status = status
  }
}

export function normalizeRole(role: string | null | undefined): Role | null {
  if (!role) return null
  const value = role.toLowerCase()
  const values = Object.values(ROLES)
  return (values.includes(value as Role) ? (value as Role) : null)
}

export function hasRole(user: SessionUserLike | null | undefined, role: Role): boolean {
  const normalized = normalizeRole(user?.role ?? null)
  return normalized === role
}

export function can(user: SessionUserLike | null | undefined, permission: PermissionKey): boolean {
  const normalized = normalizeRole(user?.role ?? null)
  if (!normalized) return false
  const allowed = PERMISSIONS[permission]
  return allowed.includes(normalized)
}

export function ensureCan(user: SessionUserLike | null | undefined, permission: PermissionKey) {
  if (!user) {
    throw new PermissionError(401, "Unauthorized")
  }

  if (!can(user, permission)) {
    const role = normalizeRole(user?.role ?? null) ?? "unknown"
    throw new PermissionError(403, `Forbidden: role ${role} cannot perform ${permission}`)
  }
}
