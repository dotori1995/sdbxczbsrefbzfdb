export type DecodedBmp = {
  width: number
  height: number
  rgba: Uint8ClampedArray
}

export function decodeBmp(bytes: Uint8Array): DecodedBmp | null {
  if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const pixelOffset = view.getUint32(10, true)
  const width = view.getInt32(18, true)
  const heightRaw = view.getInt32(22, true)
  const bits = view.getUint16(28, true)
  const compression = view.getUint32(30, true)
  if (width <= 0 || bits !== 32 || compression !== 0) return null
  const height = Math.abs(heightRaw)
  const bottomUp = heightRaw > 0
  const rgba = new Uint8ClampedArray(width * height * 4)
  const stride = width * 4
  if (pixelOffset + stride * height > bytes.length) return null
  for (let y = 0; y < height; y += 1) {
    const sourceY = bottomUp ? height - 1 - y : y
    const source = pixelOffset + sourceY * stride
    for (let x = 0; x < width; x += 1) {
      const index = source + x * 4
      const target = (y * width + x) * 4
      rgba[target] = bytes[index + 2]
      rgba[target + 1] = bytes[index + 1]
      rgba[target + 2] = bytes[index]
      rgba[target + 3] = 255
    }
  }
  return { width, height, rgba }
}
