import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { SessionUserLike } from "@/lib/utils"
import { normalizeRole, ensureCan, PermissionError, type PermissionKey } from "@/lib/utils"
import { apiError } from "@/lib/http/api"

/**
 * Updates the user session in proxy by refreshing tokens and handling auth state.
 * This function should be called in your proxy.ts file.
 */
export async function updateSession(request: NextRequest, requestHeaders?: Headers) {
  const createPassThroughResponse = () =>
    requestHeaders
      ? NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        })
      : NextResponse.next({ request })

  let supabaseResponse = createPassThroughResponse()

  // With Fluid compute, don't put this client in a global environment variable.
  // Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = createPassThroughResponse()
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  const isProtectedPath =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    (request.nextUrl.pathname.startsWith("/api") && !request.nextUrl.pathname.startsWith("/api/webhooks/mobile-money"))

  const hasSupabaseAuthCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.includes("-auth-token"))

  // Fast-path redirect for protected routes with no auth cookie.
  if (isProtectedPath && !hasSupabaseAuthCookie) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  // In proxy we only need session presence for routing decisions.
  // Strict user validation still happens in page/API handlers.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user ?? null

  // Redirect unauthenticated users to login page
  if (
    request.nextUrl.pathname !== "/" &&
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/setup")
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  return supabaseResponse
}

// ---- Server-side auth helpers --------------------------------------------

export interface AuthContext {
  supabase: ReturnType<typeof createServerClient>
  user: SessionUserLike | null
}

export async function getAuthContext(request: NextRequest): Promise<AuthContext> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {
          // no-op here; middleware updateSession manages cookies for routing
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { supabase, user: null }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, facility_id")
    .eq("id", user.id)
    .maybeSingle()

  // Derive a normalized role for RBAC.
  // Keep unknown/missing roles as null so permission checks fail closed.
  const role = normalizeRole(profile?.role ?? null)

  return {
    supabase,
    user: {
      id: user.id,
      role,
      facility_id: profile?.facility_id ?? null,
    },
  }
}

export async function requirePermission(request: NextRequest, permission: PermissionKey): Promise<AuthContext> {
  const ctx = await getAuthContext(request)
  if (!ctx.user) {
    throw new PermissionError(401, "Unauthorized")
  }
  ensureCan(ctx.user, permission)
  return ctx
}

export function toAuthErrorResponse(error: unknown, request?: NextRequest): NextResponse | null {
  if (error instanceof PermissionError) {
    const code = error.status === 401 ? "unauthorized" : "forbidden"
    return apiError(error.status, code, error.message, request)
  }
  return null
}
