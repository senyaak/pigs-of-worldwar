// FEText glyph tables (docs/formats.md). A `.tab` is 8 bytes per glyph —
// u16 x, y, w, h — describing where that glyph sits in the sibling `.BMP`.
//
// The boxes are stored in PSX VRAM coordinates, so they all start a long way
// to the right (960, 90 for most fonts). The exe takes the atlas origin from
// the box of glyph 2 — the '!' — and so does this: subtract it and the boxes
// tile the bitmap exactly. Pure, like every reader here.

export interface Glyph {
  /** Atlas position, already origin-corrected. */
  x: number
  y: number
  width: number
  height: number
}

export interface GlyphTable {
  glyphs: Glyph[]
  /** The VRAM origin the boxes were measured from. */
  origin: { x: number; y: number }
  /** Every glyph in a font is the same height. */
  height: number
  /** What a space advances by. NOT in the file — see spaceWidth below. */
  space: number
}

const ENTRY = 8
/** Glyph 0 is the 0x1F code: text indexes the table with `code - 0x1F`. */
export const GLYPH_SHIFT = 0x1f
/** The '!' — the first glyph with a box, and so the atlas origin. */
const FIRST_DRAWN = 2
/** The '0', whose width stands in for the space (see notes). */
const DIGIT_ZERO = '0'.charCodeAt(0) - GLYPH_SHIFT

/** The table slot a character is drawn from; -1 when the font has none. */
export function glyphIndex(table: GlyphTable, charCode: number): number {
  const index = charCode - GLYPH_SHIFT
  return index >= 0 && index < table.glyphs.length ? index : -1
}

export function parseTab(data: Uint8Array): GlyphTable {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const count = Math.floor(data.byteLength / ENTRY)
  if (count <= FIRST_DRAWN) throw new Error('not a glyph table: too few entries')

  const raw: Glyph[] = []
  for (let i = 0; i < count; i++) {
    raw.push({
      x: view.getUint16(i * ENTRY, true),
      y: view.getUint16(i * ENTRY + 2, true),
      width: view.getUint16(i * ENTRY + 4, true),
      height: view.getUint16(i * ENTRY + 6, true)
    })
  }

  const origin = { x: raw[FIRST_DRAWN].x, y: raw[FIRST_DRAWN].y }
  const glyphs = raw.map((glyph) =>
    glyph.width === 0
      ? { x: 0, y: 0, width: 0, height: 0 }
      : { ...glyph, x: glyph.x - origin.x, y: glyph.y - origin.y }
  )
  return {
    glyphs,
    origin,
    height: raw[FIRST_DRAWN].height,
    space: glyphs[DIGIT_ZERO]?.width || raw[FIRST_DRAWN].height / 2
  }
}
