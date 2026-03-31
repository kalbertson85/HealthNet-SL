import { updateSession } from "@/lib/supabase/middleware"
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/http/request-id"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const requestId = resolveRequestId(request)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(REQUEST_ID_HEADER, requestId)

  const response = pathname.startsWith("/api/webhooks/mobile-money")
    ? NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      })
    : await updateSession(request, requestHeaders)

  response.headers.set(REQUEST_ID_HEADER, requestId)
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
