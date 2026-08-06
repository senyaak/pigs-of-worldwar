// Minimal palettized BMP reader — enough for the game's frontend images
// (every decoded MGL is an 8-bit BMP) and its fonts (some are 4-bit). Pure,
// like the others.
//
// The palette and every texel's index come back untouched alongside the
// rgba, because which colour is SEE-THROUGH is not the same question here as
// it is for the terrain: the frontend art keys on magenta, the font atlases
// on index 0. `alpha.ts` is where those two rules live.

export interface Bmp {
  width: number
  height: number
  /** RGBA, rows top to bottom, fully opaque. */
  rgba: Uint8Array
  /** The palette, RGBA, four bytes an entry. */
  palette: Uint8Array
  /** One palette index per pixel, rows top to bottom. */
  indices: Uint8Array
}

export function parseBmp(data: Uint8Array): Bmp {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (data[0] !== 0x42 || data[1] !== 0x4d) throw new Error('not a BMP')
  const pixelOffset = view.getUint32(10, true)
  const headerSize = view.getUint32(14, true)
  const width = view.getInt32(18, true)
  const rawHeight = view.getInt32(22, true)
  const bpp = view.getUint16(28, true)
  if (bpp !== 8 && bpp !== 4) throw new Error(`unsupported BMP bpp ${bpp} (only 4 and 8)`)
  const height = Math.abs(rawHeight)
  const topDown = rawHeight < 0

  const paletteOffset = 14 + headerSize
  const colors = Math.min(1 << bpp, Math.floor((pixelOffset - paletteOffset) / 4))
  const rowSize = ((((width * bpp + 7) >> 3) + 3) & ~3) >>> 0

  const palette = new Uint8Array(colors * 4)
  for (let i = 0; i < colors; i++) {
    const p = paletteOffset + i * 4
    palette[i * 4] = data[p + 2]
    palette[i * 4 + 1] = data[p + 1]
    palette[i * 4 + 2] = data[p]
    palette[i * 4 + 3] = 255
  }

  const indices = new Uint8Array(width * height)
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const srcRow = topDown ? y : height - 1 - y
    const row = pixelOffset + srcRow * rowSize
    for (let x = 0; x < width; x++) {
      const index =
        bpp === 8 ? data[row + x] : (data[row + (x >> 1)] >> (x & 1 ? 0 : 4)) & 0xf
      const at = y * width + x
      indices[at] = index
      const p = Math.min(index, colors - 1) * 4
      rgba[at * 4] = palette[p]
      rgba[at * 4 + 1] = palette[p + 1]
      rgba[at * 4 + 2] = palette[p + 2]
      rgba[at * 4 + 3] = 255
    }
  }
  return { width, height, rgba, palette, indices }
}
