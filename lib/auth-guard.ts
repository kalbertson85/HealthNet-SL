import type { NextRequest } from "next/server"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { PermissionError, ROLES, type Role, normalizeRole } from "@/lib/utils"

const uuidSchema = z.string().uuid()

export interface GuardedUser {
  id: string
  role: Role | null
  facility_id: string | null
  status: string
}

export interface GuardedContext {
  supabase: Awaited<ReturnType<typeof createServerClient>>
  user: GuardedUser
}

export class RequestValidationError extends Error {
  status = 400

  constructor(message: string) {
    super(message)
    this.name = "RequestValidationError"
  }
}

export async function requireAuth(): Promise<GuardedContext> {
  const supabase = await createServerClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    throw new PermissionError(401, "Unauthorized")
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, facility_id, status")
    .eq("id", authUser.id)
    .maybeSingle()

  if (profileError) {
    throw new PermissionError(403, "Forbidden")
  }

  const authMetadata = (authUser as { app_metadata?: { role?: string | null } }).app_metadata
  const userMetadata = (authUser as { user_metadata?: { role?: string | null } }).user_metadata
  const role = normalizeRole(profile?.role ?? authMetadata?.role ?? userMetadata?.role ?? authUser.role ?? null)
  const status = String(profile?.status ?? "active").toLowerCase()

  if (status !== "active") {
    throw new PermissionError(403, "Forbidden: account is not active")
  }

  return {
    supabase,
    user: {
      id: authUser.id,
      role,
      facility_id: profile?.facility_id ?? null,
      status,
    },
  }
}

export async function requireRole(requiredRole: Role | Role[]): Promise<GuardedContext> {
  const ctx = await requireAuth()
  const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
  if (!ctx.user.role || !requiredRoles.includes(ctx.user.role)) {
    throw new PermissionError(403, "Forbidden")
  }
  return ctx
}

export function requireFacilityAccess(ctx: GuardedContext, facilityId: string | null | undefined): void {
  if (!facilityId) return
  if (ctx.user.role === ROLES.ADMIN) return
  if (!ctx.user.facility_id) {
    throw new PermissionError(403, "Forbidden")
  }
  if (ctx.user.facility_id !== facilityId) {
    throw new PermissionError(403, "Forbidden")
  }
}

export function parseUuidParam(value: string, field = "id"): string {
  const parsed = uuidSchema.safeParse(value)
  if (!parsed.success) {
    throw new RequestValidationError(`Invalid ${field}`)
  }
  return parsed.data
}

export function resolveAuthError(error: unknown, request: NextRequest, fallback: (status: number, code: string, message: string, req: NextRequest) => Response): Response | null {
  if (error instanceof RequestValidationError) {
    return fallback(400, "invalid_request", error.message, request)
  }
  if (!(error instanceof PermissionError)) return null
  const status = error.status === 401 ? 401 : 403
  const code = status === 401 ? "unauthorized" : "forbidden"
  return fallback(status, code, error.message, request)
}
