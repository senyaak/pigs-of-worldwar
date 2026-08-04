// PSX TIM image reader (docs/formats.md). Pure, like the others.
//
// Every texture in this game's MTD archives is a 4-bit CLUT TIM (verified:
// all 120 entries of british.mtd), but 8-bit CLUT decoding is here too since
// it is the same code path with a wider index.

export interface Tim {
  width: number
  height: number
  /** RGBA, 4 bytes per pixel, rows top to bottom as stored in the file. */
  rgba: Uint8Array
}

const MAGIC = 0x10

export function parseTim(data: Uint8Array): Tim {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (view.getUint32(0, true) !== MAGIC) throw new Error('not a TIM: bad magic')
  const flags = view.getUint32(4, true)
  const mode = flags & 7
  if (mode !== 0 && mode !== 1) throw new Error(`unsupported TIM mode ${mode} (only 4/8-bit CLUT)`)
  if ((flags & 8) === 0) throw new Error('CLUT-mode TIM without a CLUT block')

  // CLUT block: u32 block length, u16 vram x/y, u16 colors, u16 clut count,
  // then the colors. Only the first CLUT is used.
  let offset = 8
  const clutLength = view.getUint32(offset, true)
  const clutColors = view.getUint16(offset + 8, true)
  const palette = new Uint8Array(clutColors * 4)
  for (let i = 0; i < clutColors; i++) {
    const color = view.getUint16(offset + 12 + i * 2, true)
    // A1B5G5R5; pure zero is fully transparent.
    const r = color & 0x1f
    const g = (color >> 5) & 0x1f
    const b = (color >> 10) & 0x1f
    palette[i * 4] = (r << 3) | (r >> 2)
    palette[i * 4 + 1] = (g << 3) | (g >> 2)
    palette[i * 4 + 2] = (b << 3) | (b >> 2)
    palette[i * 4 + 3] = color === 0 ? 0 : 255
  }
  offset += clutLength

  // Pixel block: u32 block length, u16 vram x/y, u16 width in 16-bit units,
  // u16 height. 4-bit mode packs 4 pixels per unit, low nibble first.
  const width16 = view.getUint16(offset + 8, true)
  const height = view.getUint16(offset + 10, true)
  const width = mode === 0 ? width16 * 4 : width16 * 2
  const rgba = new Uint8Array(width * height * 4)
  const pixels = offset + 12
  for (let i = 0; i < width * height; i++) {
    const byte = data[pixels + (mode === 0 ? i >> 1 : i)]
    const index = mode === 0 ? (i % 2 === 0 ? byte & 0xf : byte >> 4) : byte
    rgba.set(palette.subarray(index * 4, index * 4 + 4), i * 4)
  }
  return { width, height, rgba }
}
