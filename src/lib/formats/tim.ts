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
  /**
   * The CLUT exactly as stored, one 16-bit word a colour, and the palette
   * INDEX of every texel — kept because the top bit of a colour is meaning,
   * not colour: the PSX's semi-transparency flag. Ground art paints water
   * in translucent colours and land in opaque ones, and that is what the
   * game reads to decide where a pig swims (lib/game/watermask). The
   * decoded rgba above cannot answer for it — it drops the bit.
   */
  palette: Uint16Array
  indices: Uint8Array
}

const MAGIC = 0x10

/**
 * How many of a sprite TIM's trailing columns are ALIGNMENT PADDING, not
 * picture.
 *
 * A TIM stores its width in 16-BIT UNITS, so an 8-bit image of odd width (or
 * a 4-bit one off a multiple of four) carries filler columns the artist never
 * painted — and the shipped art really does: four of the world map's
 * territory masks (`hog2`, `sau3`, `sau4`, `trot2`) and all ten of the
 * dashboard's clock digits end in a full column of one opaque grey the
 * picture never otherwise uses. Bright garbage, drawn as a white hairline.
 *
 * The PC ORIGINAL DRAWS IT — the exe hands the 2D record a −1 size sentinel
 * (0x483B83) and the library substitutes the padded width and its UVs off the
 * page-fitted entry (dll 0x1000F1DA, 0x10012737; read 2026-08-19,
 * `library/notes.md`) — which is the port being careless with its own art.
 * Play's memory of the original carries no such stripes, and play wins
 * (`[play]`, CLAUDE.md): the sprite loader trims what this measures off.
 *
 * What counts as padding is deliberately NARROW, checked over every shipped
 * sprite archive: a trailing column inside the format's own rounding
 * allowance, filled edge to edge with ONE opaque index that the rest of the
 * picture uses only as stray noise (under height/8 texels). That keeps every
 * real edge — `fpole` is solid columns of one index used everywhere,
 * `pause5`'s dark rim is an index its body leans on, and the region pages'
 * filler is their own parchment background — all left alone, pinned in
 * `e2e/000/timpadding.spec.ts`.
 */
export function spritePadding(tim: Tim): number {
  const { width, height, palette, indices } = tim
  // 4-bit art packs four texels a unit and can round up by three columns;
  // 8-bit packs two and can round by one. Which it was survives in the CLUT.
  const allowance = palette.length <= 16 ? 3 : 1
  // Padding is written by one tool in one stroke, so the whole run wears the
  // top-right texel's index; the run is measured FIRST, and only then is the
  // rest of the picture asked whether it uses that index for anything real.
  const filler = indices[width - 1]
  let run = 0
  for (let x = width - 1; x >= width - allowance && x > 0; x--) {
    let uniform = true
    for (let y = 0; y < height; y++) {
      if (indices[y * width + x] !== filler) {
        uniform = false
        break
      }
    }
    if (!uniform) break
    run++
  }
  if (run === 0) return 0
  // A transparent column is invisible however it got there.
  if (palette[filler] === 0) return 0
  const noise = height / 8
  let stray = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - run; x++) {
      if (indices[y * width + x] === filler && ++stray >= noise) return 0
    }
  }
  return run
}

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
  const clut = new Uint16Array(clutColors)
  for (let i = 0; i < clutColors; i++) {
    const color = view.getUint16(offset + 12 + i * 2, true)
    clut[i] = color
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
  const indices = new Uint8Array(width * height)
  const pixels = offset + 12
  for (let i = 0; i < width * height; i++) {
    const byte = data[pixels + (mode === 0 ? i >> 1 : i)]
    const index = mode === 0 ? (i % 2 === 0 ? byte & 0xf : byte >> 4) : byte
    indices[i] = index
    rgba.set(palette.subarray(index * 4, index * 4 + 4), i * 4)
  }
  return { width, height, rgba, palette: clut, indices }
}
