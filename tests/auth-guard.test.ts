import { beforeEach, describe, expect, it, vi } from "vitest"
import { PermissionError, ROLES } from "../lib/utils"

const createServerClientMock = vi.fn()

vi.mock("../lib/supabase/server", () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}))

import { requireAuth, requireFacilityAccess, requireRole, RequestValidationError, parseUuidParam } from "../lib/auth-guard"

function mockSupabase({
  user,
  profile,
  profileError = null,
}: {
  user: { id: string; role?: string | null; app_metadata?: { role?: string | null }; user_metadata?: { role?: string | null } } | null
  profile?: { id: string; role?: string | null; facility_id?: string | null; status?: string | null } | null
  profileError?: { message?: string } | null
}) {
  return {
    auth: {
      async getUser() {
        return { data: { user } }
      },
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: profile ?? null, error: profileError }
                },
              }
            },
          }
        },
      }
    },
  }
}

describe("auth guard", () => {
  beforeEach(() => {
    createServerClientMock.mockReset()
  })

  it("requireAuth rejects when no authenticated user exists", async () => {
    createServerClientMock.mockResolvedValue(mockSupabase({ user: null }))
    await expect(requireAuth()).rejects.toBeInstanceOf(PermissionError)
  })

  it("requireAuth rejects blocked accounts", async () => {
    createServerClientMock.mockResolvedValue(
      mockSupabase({
        user: { id: "u1", role: "doctor" },
        profile: { id: "u1", role: "doctor", facility_id: "f1", status: "blocked" },
      }),
    )
    await expect(requireAuth()).rejects.toBeInstanceOf(PermissionError)
  })

  it("requireRole enforces exact role membership", async () => {
    createServerClientMock.mockResolvedValue(
      mockSupabase({
        user: { id: "u2", role: "nurse" },
        profile: { id: "u2", role: "nurse", facility_id: "f1", status: "active" },
      }),
    )
    await expect(requireRole(ROLES.ADMIN)).rejects.toBeInstanceOf(PermissionError)
  })

  it("requireFacilityAccess denies cross-facility access", async () => {
    createServerClientMock.mockResolvedValue(
      mockSupabase({
        user: { id: "u3", role: "doctor" },
        profile: { id: "u3", role: "doctor", facility_id: "f1", status: "active" },
      }),
    )
    const ctx = await requireAuth()
    expect(() => requireFacilityAccess(ctx, "f2")).toThrow(PermissionError)
  })

  it("parseUuidParam validates IDs", () => {
    expect(parseUuidParam("11111111-1111-4111-8111-111111111111")).toBe("11111111-1111-4111-8111-111111111111")
    expect(() => parseUuidParam("bad")).toThrow(RequestValidationError)
  })
})
