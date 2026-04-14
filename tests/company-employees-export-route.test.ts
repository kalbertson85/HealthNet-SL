import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requirePermissionMock = vi.fn()
const toAuthErrorResponseMock = vi.fn(() => null)
const inDependentsMock = vi.fn()

vi.mock("../lib/supabase/middleware", () => ({
  requirePermission: (...args: unknown[]) => requirePermissionMock(...args),
  toAuthErrorResponse: (...args: unknown[]) => toAuthErrorResponseMock(...args),
}))

import { GET } from "../app/dashboard/settings/companies/[id]/employees/export/route"

afterEach(() => {
  requirePermissionMock.mockReset()
  toAuthErrorResponseMock.mockReset()
  toAuthErrorResponseMock.mockReturnValue(null)
  inDependentsMock.mockReset()
})

describe("GET /dashboard/settings/companies/[id]/employees/export", () => {
  it("returns 403 for non-admin users", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: {},
      user: { role: "facility_admin" },
    })

    const request = new NextRequest("http://localhost/dashboard/settings/companies/company-1/employees/export")
    const response = await GET(request, { params: Promise.resolve({ id: "company-1" }) })
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error.code).toBe("forbidden")
  })

  it("filters dependents by fetched employee ids", async () => {
    const supabase = {
      from(table: string) {
        if (table === "companies") {
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return { data: { id: "company-1", name: "Example Co" }, error: null }
                    },
                  }
                },
              }
            },
          }
        }

        if (table === "company_employees") {
          return {
            select() {
              return {
                eq() {
                  return Promise.resolve({
                    data: [{ id: "emp-1", full_name: "John Doe", status: "active" }],
                    error: null,
                  })
                },
              }
            },
          }
        }

        if (table === "employee_dependents") {
          return {
            select() {
              return {
                in: (...args: unknown[]) => inDependentsMock(...args),
              }
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    }

    inDependentsMock.mockResolvedValue({ data: [], error: null })
    requirePermissionMock.mockResolvedValue({
      supabase,
      user: { role: "admin" },
    })

    const request = new NextRequest("http://localhost/dashboard/settings/companies/company-1/employees/export")
    const response = await GET(request, { params: Promise.resolve({ id: "company-1" }) })

    expect(response.status).toBe(200)
    expect(inDependentsMock).toHaveBeenCalledWith("employee_id", ["emp-1"])
  })
})
