import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { SessionUserLike } from "@/lib/utils"
import { normalizeRole, ensureCan, PermissionError, type PermissionKey } from "@/lib/utils"
import { apiError } from "@/lib/http/api"

const IDLE_TIMEOUT_COOKIE = "hms_idle_last_seen"

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

  const idleTimeoutMinutes = Number.parseInt(process.env.HMS_IDLE_TIMEOUT_MINUTES || "0", 10)
  const idleTimeoutMs = Number.isFinite(idleTimeoutMinutes) && idleTimeoutMinutes > 0 ? idleTimeoutMinutes * 60_000 : 0

  if (isProtectedPath && user && idleTimeoutMs > 0) {
    const now = Date.now()
    const lastSeenRaw = request.cookies.get(IDLE_TIMEOUT_COOKIE)?.value ?? ""
    const lastSeen = Number.parseInt(lastSeenRaw, 10)

    if (Number.isFinite(lastSeen) && now - lastSeen > idleTimeoutMs) {
      const url = request.nextUrl.clone()
      url.pathname = "/auth/login"
      url.searchParams.set("reason", "timeout")
      const timeoutResponse = NextResponse.redirect(url)
      timeoutResponse.cookies.delete(IDLE_TIMEOUT_COOKIE)
      request.cookies
        .getAll()
        .filter((cookie) => cookie.name.includes("-auth-token"))
        .forEach((cookie) => timeoutResponse.cookies.delete(cookie.name))
      return timeoutResponse
    }

    supabaseResponse.cookies.set(IDLE_TIMEOUT_COOKIE, String(now), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: idleTimeoutMinutes * 60,
    })
  }

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

type AuthProfileRow = {
  id?: string
  role?: string | null
  facility_id?: string | null
  status?: string | null
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

  let profile: AuthProfileRow | null = null
  const profileWithStatus = await supabase
    .from("profiles")
    .select("id, role, facility_id, status")
    .eq("id", user.id)
    .maybeSingle()

  if (profileWithStatus.error) {
    const fallbackProfile = await supabase
      .from("profiles")
      .select("id, role, facility_id")
      .eq("id", user.id)
      .maybeSingle()
    profile = (fallbackProfile.data as AuthProfileRow | null) ?? null
  } else {
    profile = (profileWithStatus.data as AuthProfileRow | null) ?? null
  }

  const authMetadata = (user as { app_metadata?: { role?: string | null }; user_metadata?: { role?: string | null } }).app_metadata
  const userMetadata = (user as { user_metadata?: { role?: string | null } }).user_metadata
  const role = normalizeRole(profile?.role ?? authMetadata?.role ?? userMetadata?.role ?? user.role ?? null)
  const status = String(profile?.status ?? "active").toLowerCase()

  if (status !== "active") {
    throw new PermissionError(403, "Forbidden: account is not active")
  }

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
