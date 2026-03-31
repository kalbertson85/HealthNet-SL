import { describe, expect, it } from "vitest"
import { ensureCan, PermissionError } from "../lib/utils"

describe("permission errors", () => {
  it("throws 401 when user is missing", () => {
    try {
      ensureCan(null, "admin.export")
      throw new Error("Expected ensureCan to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(PermissionError)
      expect((error as PermissionError).status).toBe(401)
    }
  })

  it("throws 403 for users without required permission", () => {
    try {
      ensureCan({ id: "u1", role: "receptionist" }, "admin.export")
      throw new Error("Expected ensureCan to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(PermissionError)
      expect((error as PermissionError).status).toBe(403)
      expect((error as Error).message).toContain("Forbidden")
    }
  })

  it("fails closed for unknown roles", () => {
    try {
      ensureCan({ id: "u2", role: "totally_unknown_role" }, "admin.export")
      throw new Error("Expected ensureCan to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(PermissionError)
      expect((error as PermissionError).status).toBe(403)
    }
  })
})
