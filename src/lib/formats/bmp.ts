// Minimal 8-bit BMP reader — just enough for the game's frontend images
// (every decoded MGL is an 8-bit palettized BMP). Pure, like the others.

export interface Bmp {
  width: number
  height: number
  /** RGBA, rows top to bottom. */
  rgba: Uint8Array
}

export function parseBmp(data: Uint8Array): Bmp {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (data[0] !== 0x42 || data[1] !== 0x4d) throw new Error('not a BMP')
  const pixelOffset = view.getUint32(10, true)
  const headerSize = view.getUint32(14, true)
  const width = view.getInt32(18, true)
  const rawHeight = view.getInt32(22, true)
  const bpp = view.getUint16(28, true)
  if (bpp !== 8) throw new Error(`unsupported BMP bpp ${bpp} (only 8)`)
  const height = Math.abs(rawHeight)
  const topDown = rawHeight < 0

  const paletteOffset = 14 + headerSize
  const colors = Math.min(256, (pixelOffset - paletteOffset) / 4)
  const rowSize = (width + 3) & ~3

  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const srcRow = topDown ? y : height - 1 - y
    for (let x = 0; x < width; x++) {
      const index = data[pixelOffset + srcRow * rowSize + x]
      const p = paletteOffset + Math.min(index, colors - 1) * 4
      const o = (y * width + x) * 4
      rgba[o] = data[p + 2]
      rgba[o + 1] = data[p + 1]
      rgba[o + 2] = data[p]
      rgba[o + 3] = 255
    }
  }
  return { width, height, rgba }
}
