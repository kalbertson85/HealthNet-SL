import { createBrowserClient } from "@supabase/ssr"

/**
 * Creates a Supabase browser client for use in Client Components.
 * Client components are only executed in the browser, so we can
 * directly construct the browser client here.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    // During static prerender in CI, client components may be evaluated on the server.
    // Return a lazy-failing stub so build-time render does not crash.
    if (typeof window === "undefined") {
      const fail = () => {
        throw new Error("Supabase browser client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.")
      }
      return new Proxy(
        {},
        {
          get() {
            return fail
          },
        },
      ) as ReturnType<typeof createBrowserClient>
    }

    throw new Error("Supabase browser client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.")
  }

  return createBrowserClient(url, anonKey)
}

// Export alias for compatibility
export { createClient as createBrowserClient }
