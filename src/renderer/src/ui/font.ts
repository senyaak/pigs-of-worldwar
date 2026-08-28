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
 * (0x4318dd), and its constructor writes **3** into that field when
 * `[0x51F120]` is set and **0** when it is not (0x430c28). A SPACE is the
 * other half of the same reading: its box is 0×0 in every `.tab`, and the
 * number the exe adds is **8** (0x4316b2, the arm taken when the same object
 * says its glyphs are proportional) — and that one has no flag on it.
 *
 * **The name is right and an earlier note here was not.** This file used to
 * say the shipped build always has that flag, so the 3 was the game's spacing
 * everywhere. It is the FRONTEND's: the same `[0x51F120]` is what turns on the
 * 1024→640 squeeze of every coordinate (0x41ADB0), and the pause menu — which
 * is drawn during a mission — writes its panel in plain 640-space pixels
 * (±0x82 by ±0x96 of the screen centre, 0x454876). Both cannot be true at
 * once, so the flag is CLEAR in a mission: the battle's letters carry no
 * tracking, and `loadFont` with no metrics at all is exactly what they are.
 */
export interface Metrics {
  /** Added after every glyph. */
  tracking: number
  /** What a space advances, the `.tab` having no width for it. */
  space: number
}

export const FRONTEND_METRICS: Metrics = { tracking: 3, space: 8 }

/**
 * The BATTLE's vertical stretch — the library's own glyph quad: width 1:1,
 * height `min(2 × the font's height, 45)` (`afDrawText`, dll 0x1000DFB6 —
 * read 2026-08-28, text/notes.md in the disasm repo). SMALL's 12 draws 24
 * tall on screen; BIG's 32 clamps to 45. The frontend path never stretches.
 */
export const BATTLE_STRETCH = 2
const STRETCH_CAP = 45

function makeFont(
  name: string,
  atlas: CanvasImageSource,
  table: GlyphTable,
  metrics?: Metrics,
  stretch = 1
): Font {
  const drawnHeight = Math.min(table.height * stretch, STRETCH_CAP)
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
    height: drawnHeight,
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
          // Width 1:1, height the font's stretched one — the library's own
          // quad shape (BATTLE_STRETCH above).
          context.drawImage(atlas, box.x, box.y, box.width, box.height, at, y, box.width, drawnHeight)
        }
        at += advance(code)
      }
    }
  }
}

/**
 * PAINT an atlas one colour — by MULTIPLY, so the glyph's own shading
 * survives.
 *
 * This was `source-in` — a flat fill of the glyph shape — and that is what
 * made the name plates read fat: the game's letters carry their own dark
 * EDGING inside the art (SMALL's atlas holds MORE near-black edge pixels,
 * 2837 of (32,32,32), than bright body ones, 1470 of (248,248,248) —
 * measured 2026-08-27, after play's own hunch: "обводка должна быть внутри
 * букв"). A flat fill erased that edge, a stamped outline was invented to
 * replace it, and the two together were a slab. Multiplying instead leaves
 * the near-black edge near-black and hands the bright body the colour —
 * which is exactly the original's look, coloured letters with their own
 * dark rim. Black in, black out, so the outline font still works where it
 * is still wanted.
 */
async function painted(
  atlas: ImageData,
  colour: [number, number, number]
): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(atlas.width, atlas.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('no 2d context to paint the letters with')
  const shapes = await createImageBitmap(atlas)
  context.drawImage(shapes, 0, 0)
  context.globalCompositeOperation = 'multiply'
  context.fillStyle = `rgb(${colour[0]}, ${colour[1]}, ${colour[2]})`
  context.fillRect(0, 0, atlas.width, atlas.height)
  // The multiply painted the transparent field too; the glyphs' own alpha
  // cuts it back out.
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(shapes, 0, 0)
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
  options?: { colour?: [number, number, number]; metrics?: Metrics; stretch?: number }
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
  return makeFont(result.font.name, bitmap, table, options?.metrics, options?.stretch)
}
