import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requirePermissionMock = vi.fn()
const toAuthErrorResponseMock = vi.fn(() => null)
const uploadPatientPhotoWithClientMock = vi.fn()

vi.mock("../lib/supabase/middleware", () => ({
  requirePermission: (...args: unknown[]) => requirePermissionMock(...args),
  toAuthErrorResponse: (...args: unknown[]) => toAuthErrorResponseMock(...args),
}))

vi.mock("../lib/storage", () => ({
  uploadPatientPhotoWithClient: (...args: unknown[]) => uploadPatientPhotoWithClientMock(...args),
}))

import { POST } from "../app/api/patients/photo/route"

const VALID_PATIENT_ID = "11111111-1111-4111-8111-111111111111"

function makeSupabase(patientFacilityId: string | null = "facility-a") {
  return {
    from(table: string) {
      if (table === "patients") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: { id: VALID_PATIENT_ID, facility_id: patientFacilityId },
                      error: null,
                    }
                  },
                }
              },
            }
          },
          update() {
            return {
              async eq() {
                return { error: null }
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

function buildForm(file: File) {
  const form = new FormData()
  form.set("patientId", VALID_PATIENT_ID)
  form.set("file", file)
  return form
}

function makeRequest(form: FormData, requestId = "req_photo_test_001") {
  return new NextRequest("http://localhost/api/patients/photo", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      host: "localhost",
      "x-request-id": requestId,
      "x-forwarded-for": "10.0.0.31",
    },
    body: form,
  })
}

afterEach(() => {
  requirePermissionMock.mockReset()
  toAuthErrorResponseMock.mockReset()
  toAuthErrorResponseMock.mockReturnValue(null)
  uploadPatientPhotoWithClientMock.mockReset()
})

describe("POST /api/patients/photo", () => {
  it("rejects disallowed file extension", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase(),
      user: { id: "user-1", facility_id: "facility-a" },
    })

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "avatar.gif", { type: "image/jpeg" })
    const response = await POST(makeRequest(buildForm(file), "req_ext_1"))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe("invalid_file_extension")
    expect(payload.error.request_id).toBe("req_ext_1")
  })

  it("rejects when image signature does not match declared mime type", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase(),
      user: { id: "user-1", facility_id: "facility-a" },
    })

    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00])
    const file = new File([jpegBytes], "avatar.png", { type: "image/png" })
    const response = await POST(makeRequest(buildForm(file), "req_sig_1"))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe("mismatched_file_signature")
    expect(payload.error.request_id).toBe("req_sig_1")
  })

  it("rejects cross-facility patient photo updates", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase("facility-b"),
      user: { id: "user-1", facility_id: "facility-a" },
    })

    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00])
    const file = new File([jpegBytes], "avatar.jpg", { type: "image/jpeg" })
    const response = await POST(makeRequest(buildForm(file), "req_facility_1"))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error.code).toBe("patient_facility_mismatch")
    expect(payload.error.request_id).toBe("req_facility_1")
  })

  it("uploads when validation passes and forwards validated mime type", async () => {
    requirePermissionMock.mockResolvedValue({
      supabase: makeSupabase("facility-a"),
      user: { id: "user-1", facility_id: "facility-a" },
    })
    uploadPatientPhotoWithClientMock.mockResolvedValue("https://cdn.example.com/patient/photo.jpg")

    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00])
    const file = new File([jpegBytes], "avatar.jpg", { type: "image/jpeg" })
    const response = await POST(makeRequest(buildForm(file), "req_ok_1"))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      photoUrl: "https://cdn.example.com/patient/photo.jpg",
      request_id: "req_ok_1",
    })
    expect(uploadPatientPhotoWithClientMock).toHaveBeenCalledWith(
      expect.anything(),
      VALID_PATIENT_ID,
      expect.any(File),
      { validatedMimeType: "image/jpeg" },
    )
  })
})
