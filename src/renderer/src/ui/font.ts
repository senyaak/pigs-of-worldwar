// Drawing text in the game's own letters.
//
// A font is an atlas bitmap plus the glyph boxes out of its `.tab`
// (lib/formats/tab.ts). Nothing here scales or restyles: a glyph is blitted
// at its own size, which is what makes a line of it look like the original's
// rather than like a web page in a pixel typeface.
//
// The game's fonts have NO LOWERCASE — the slots below 'a' run into accented
// capitals instead — which is why everything the game says is in capitals,
// down to the names a player types. Text arriving here is drawn as it comes:
// pass it in the case it should appear in.

import type { GlyphTable } from '../api'

export interface Font {
  /** The FEText name it was loaded from: `CHARS2`, `BIG`. */
  name: string
  /** Every glyph in a font is this tall. */
  height: number
  /** How wide `text` will be drawn. */
  measure(text: string): number
  /** Draw at (x, y), y being the TOP of the line. */
  draw(context: CanvasRenderingContext2D, text: string, x: number, y: number): void
}

/** Glyph 0 is the 0x1F code, so text indexes the table with `code - 0x1F`. */
const GLYPH_SHIFT = 0x1f

/**
 * How far a line SPREADS, which is not in the `.tab` at all.
 *
 * The exe's text object advances its pen by `[+0x14] + the glyph's width`
 * (0x4318dd) and its constructor sets that field to **3** whenever the
 * frontend's squeeze is on, which the shipped build always has (0x430c28).
 * A SPACE is the other half of the same reading: its box is 0×0 in every
 * `.tab`, and the number the exe adds is **8** (0x4316b2, the arm taken when
 * the same object says its glyphs are proportional).
 *
 * It is a property of the text OBJECT, and the exe builds every one of them
 * the same way — so this is the game's spacing everywhere, not the
 * frontend's. It is applied where it has been checked against the original's
 * own boxes and nowhere else; the battle's text is left as play approved it.
 */
export interface Metrics {
  /** Added after every glyph. */
  tracking: number
  /** What a space advances, the `.tab` having no width for it. */
  space: number
}

export const FRONTEND_METRICS: Metrics = { tracking: 3, space: 8 }

function makeFont(
  name: string,
  atlas: CanvasImageSource,
  table: GlyphTable,
  metrics?: Metrics
): Font {
  const boxOf = (charCode: number): GlyphTable['glyphs'][number] | null => {
    const index = charCode - GLYPH_SHIFT
    return index >= 0 && index < table.glyphs.length ? table.glyphs[index] : null
  }
  const advance = (charCode: number): number => {
    const box = boxOf(charCode)
    if (!box) return 0
    const width = box.width > 0 ? box.width : metrics?.space ?? table.space
    return width + (metrics?.tracking ?? 0)
  }
  return {
    name,
    height: table.height,
    measure(text) {
      let width = 0
      for (let i = 0; i < text.length; i++) width += advance(text.charCodeAt(i))
      return width
    },
    draw(context, text, x, y) {
      let at = x
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i)
        const box = boxOf(code)
        if (box && box.width > 0) {
          context.drawImage(atlas, box.x, box.y, box.width, box.height, at, y, box.width, box.height)
        }
        at += advance(code)
      }
    }
  }
}

/**
 * PAINT an atlas one colour, keeping only the glyph shapes.
 *
 * `source-in` and not a multiply (`ui/sprites.ts`, which is right for the white
 * map markers): a letter arrives with its own colour baked in, and the point
 * here is to override that rather than shade it.
 */
async function painted(
  atlas: ImageData,
  colour: [number, number, number]
): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(atlas.width, atlas.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('no 2d context to paint the letters with')
  context.putImageData(atlas, 0, 0)
  context.globalCompositeOperation = 'source-in'
  context.fillStyle = `rgb(${colour[0]}, ${colour[1]}, ${colour[2]})`
  context.fillRect(0, 0, atlas.width, atlas.height)
  return createImageBitmap(canvas)
}

/**
 * Load one FEText font. Rejects when the install has no such font.
 *
 * `colour` paints every glyph it, which is how the same letters serve a second
 * purpose: the exe's own floating numbers are not letters at all but effect
 * particles with a colour on them, and a heal's is the fixed one
 * (lib/game/damage.ts). Nothing else recolours text.
 */
export async function loadFont(
  name: string,
  options?: { colour?: [number, number, number]; metrics?: Metrics }
): Promise<Font> {
  const result = await window.api.loadFont(name)
  if (!result.ok) throw new Error(result.error)
  const { atlas, table } = result.font
  const pixels = new Uint8ClampedArray(atlas.rgba.byteLength)
  pixels.set(atlas.rgba)
  const image = new ImageData(pixels, atlas.width, atlas.height)
  const bitmap = options?.colour
    ? await painted(image, options.colour)
    : await createImageBitmap(image)
  return makeFont(result.font.name, bitmap, table, options?.metrics)
}
