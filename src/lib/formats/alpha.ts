// Which texel of a frontend bitmap is see-through. Two rules, both measured
// off the shipped art (../pigs-disasm/frontend/notes.md):
//
// - The `.mgl` sprites key on the COLOUR magenta — 248,0,248, the PSX's
//   5-bit magenta. The palette entry holding it moves about (2 in `fullmenu`
//   and `track`, 255 in `chose1` and `title1`, five entries at once in
//   `fullmenu`), so an index test would be wrong on half the art.
// - The font atlases key on palette INDEX 0, which is magenta in some fonts
//   and black in others — there the colour test would be the wrong one.
//
// Pure: each takes a parsed Bmp and returns its rgba with the alpha punched.

import type { Bmp } from './bmp'

/** PSX magenta: 5 bits a channel, so 0xF8 rather than 0xFF. */
const KEY = { r: 0xf8, g: 0x00, b: 0xf8 }
/** How far off the key a colour may sit and still count as it. */
const SLACK = 8

function isKey(palette: Uint8Array, index: number): boolean {
  const p = index * 4
  return (
    palette[p] >= KEY.r - SLACK &&
    palette[p + 1] <= KEY.g + SLACK &&
    palette[p + 2] >= KEY.b - SLACK
  )
}

/** A frontend sprite: every magenta texel becomes transparent. */
export function punchMagenta(bmp: Bmp): Uint8Array {
  const rgba = new Uint8Array(bmp.rgba)
  const colors = bmp.palette.byteLength / 4
  const clear = new Uint8Array(colors)
  for (let i = 0; i < colors; i++) clear[i] = isKey(bmp.palette, i) ? 1 : 0
  for (let i = 0; i < bmp.indices.length; i++) {
    if (clear[bmp.indices[i]]) rgba[i * 4 + 3] = 0
  }
  return rgba
}

/** A font atlas: palette entry 0 is the background. */
export function punchIndexZero(bmp: Bmp): Uint8Array {
  const rgba = new Uint8Array(bmp.rgba)
  for (let i = 0; i < bmp.indices.length; i++) {
    if (bmp.indices[i] === 0) rgba[i * 4 + 3] = 0
  }
  return rgba
}
