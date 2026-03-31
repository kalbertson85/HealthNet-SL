import { describe, expect, it } from "vitest"
import { detectImageMimeType } from "../lib/files/image-signature"

describe("detectImageMimeType", () => {
  it("detects jpeg signatures", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x11])
    expect(detectImageMimeType(bytes)).toBe("image/jpeg")
  })

  it("detects png signatures", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
    expect(detectImageMimeType(bytes)).toBe("image/png")
  })

  it("detects webp signatures", () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x24, 0x00, 0x00, 0x00, // size placeholder
      0x57, 0x45, 0x42, 0x50, // WEBP
      0x56, 0x50, 0x38, 0x20,
    ])
    expect(detectImageMimeType(bytes)).toBe("image/webp")
  })

  it("returns null for unknown signatures", () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]) // PDF
    expect(detectImageMimeType(bytes)).toBeNull()
  })
})
