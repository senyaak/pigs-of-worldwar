// The game's strings: `Language/Text/fetext.bin` (frontend) and `gtext.bin`
// (in-game), each with a sibling `.ofs`.
//
// `.ofs` is a flat array of u16 offsets into the `.bin`, one per string, and
// a string runs from its offset to a NUL. The bytes are GLYPH INDICES into
// the fonts' tables rather than ASCII, so reading one back is `+ 0x1F` — a
// space is stored as 0x01. Pure: it takes bytes.

import { GLYPH_SHIFT } from './tab'

const OFFSET_SIZE = 2

/**
 * Read a `.bin`/`.ofs` pair. The result is indexed exactly as the game
 * indexes it, so `fetext[8]` is `MAIN MENU`.
 *
 * The strings keep their own markup — `/N` a line break, `/Z(x,y)` a
 * position, `/3` a button glyph — because who honours which depends on the
 * screen drawing it.
 */
export function parseText(bin: Uint8Array, ofs: Uint8Array): string[] {
  const view = new DataView(ofs.buffer, ofs.byteOffset, ofs.byteLength)
  const count = Math.floor(ofs.byteLength / OFFSET_SIZE)
  const strings: string[] = []
  for (let i = 0; i < count; i++) {
    const start = view.getUint16(i * OFFSET_SIZE, true)
    let text = ''
    for (let at = start; at < bin.byteLength && bin[at] !== 0; at++) {
      text += String.fromCharCode(bin[at] + GLYPH_SHIFT)
    }
    strings.push(text)
  }
  return strings
}
