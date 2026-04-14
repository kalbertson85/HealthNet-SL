import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { PermissionError } from "../lib/utils"

const createServerClientMock = vi.fn()

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}))

import { requirePermission } from "../lib/supabase/middleware"

function buildRequest() {
  return new NextRequest("http://localhost/api/example", {
    headers: {
      cookie: "sb-auth-token=test",
    },
  })
}

function makeSupabase(options: { status?: string | null; role?: string | null }) {
  return {
    auth: {
      async getUser() {
        return { data: { user: { id: "user-1", role: null } } }
      },
    },
    from(table: string) {
      if (table !== "profiles") {
        throw new Error(`Unexpected table: ${table}`)
      }
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return {
                    data: {
                      id: "user-1",
                      role: options.role ?? "admin",
                      facility_id: "facility-a",
                      status: options.status ?? "active",
                    },
                    error: null,
                  }
                },
              }
            },
          }
        },
      }
    },
  }
}

describe("requirePermission account status checks", () => {
  it("rejects inactive users", async () => {
    createServerClientMock.mockReturnValueOnce(makeSupabase({ status: "blocked", role: "admin" }))

    const request = buildRequest()
    await expect(requirePermission(request, "admin.export")).rejects.toBeInstanceOf(PermissionError)
  })

  it("allows active users", async () => {
    createServerClientMock.mockReturnValueOnce(makeSupabase({ status: "active", role: "admin" }))

    const request = buildRequest()
    const ctx = await requirePermission(request, "admin.export")
    expect(ctx.user?.id).toBe("user-1")
    expect(ctx.user?.role).toBe("admin")
  })
})
