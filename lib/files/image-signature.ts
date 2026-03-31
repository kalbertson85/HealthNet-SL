const JPEG_SOI_0 = 0xff
const JPEG_SOI_1 = 0xd8
const JPEG_SOI_2 = 0xff

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46] // RIFF
const WEBP_MARK = [0x57, 0x45, 0x42, 0x50] // WEBP

function hasPrefix(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false
  for (let i = 0; i < prefix.length; i += 1) {
    if (bytes[offset + i] !== prefix[i]) return false
  }
  return true
}

export function detectImageMimeType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === JPEG_SOI_0 && bytes[1] === JPEG_SOI_1 && bytes[2] === JPEG_SOI_2) {
    return "image/jpeg"
  }

  if (hasPrefix(bytes, PNG_SIG)) {
    return "image/png"
  }

  if (hasPrefix(bytes, WEBP_RIFF, 0) && hasPrefix(bytes, WEBP_MARK, 8)) {
    return "image/webp"
  }

  return null
}
