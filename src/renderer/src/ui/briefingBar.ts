// The briefing bar: the black scroll that drops out of the top of the screen
// and runs a line of text across it — what the tutorial talks THROUGH.
//
// Every number here is the exe's, out of `tutorial/notes.md`:
//
// - the art is `Language/Tims/TBOXTIMS.MAD` — `npro4` is the 32×64 brass end
//   cap and `npro3` the 64×64 scroll tile, which is what the draw at 0x45E930
//   reaches for (the taller `npro1`/`npro2` pair belongs to a variant the
//   tutorial never asks for);
// - the bar spans the screen centre −120..+122 and the text window inside it
//   is exactly 206 wide, centre −102..+104;
// - it drops in over TEN frames along a percentage curve that overshoots and
//   settles, and every piece's y is `curve * 45 / 100 - K`;
// - a line WIDER than the window scrolls at 5 px a frame after driving in
//   from the right edge; a line that fits is centred and held instead.
//
// The font is the game's own, and it is BIG. The bar's atlas is
// `Language/Tims/macfont.bmp` — which is `FEText/BIG.BMP` pixel for pixel,
// two blank rows taller — and the glyph boxes come from the text manager's
// own table, read out of `FETEXT\BIG.TAB` when it is built (0x430D9D,
// `lea edi,[esi+3D7Ch]`), which is the same table `loadFont('BIG')` reads.
//
// The pen is the exe's too: a glyph advances by its width MINUS ONE
// (0x45EDD3), so every pair kerns by a pixel; a space advances by the
// table's own space and does not kern.
//
// And BIG is drawn SQUEEZED. Its glyphs are 32 rows deep — the renderer
// reads that height out of the table itself (`movsx eax,[ebx+16h]`, entry 2's
// height) and uses it as the SOURCE rect, while the destination rect is a
// fixed 0x16: 22 rows, the depth of the strip. Same width, so the line in
// the bar is the game's big letters at eleven sixteenths of their height.

import { loadFont } from './font'
import type { Font } from './font'
import { loadTims } from './sprites'
import type { Sprite, SpriteSet } from './sprites'

const MESSAGE_BOX = 'Language/Tims/TBOXTIMS.MAD'
const BAR_FONT = 'BIG'

/** Where the bar and its text window sit, measured from the screen centre. */
const BAR = { left: -120, right: 122 }
/** The window, and the depth the exe's blit squeezes every glyph into. */
const TEXT = { left: -102, width: 206, height: 22 }

/** The drop-in curve at 0x4D0190: ten frames of percentage, with a bounce. */
const SLIDE = [0, 10, 15, 30, 40, 90, 100, 95, 100, 100]
/** The curve steps once per frame, and the original's frame is a 30th. */
const SLIDE_FPS = 30
/** What every piece's y is scaled by before its own offset comes off. */
const DROP = 45
/** The offsets themselves: caps, scroll tiles, and the line of text. */
const CAP_Y = 50
const TILE_Y = 39
/** The exe's own is 17; two more sit the line where play wants it. */
const TEXT_Y = 19

/** The end caps hang off each end of the bar; the tiles overlap by 16. */
const CAP = { width: 32, height: 64, left: -14, right: -18 }
const TILE = { width: 64, height: 64, first: 18, step: 48, count: 4 }

/** 5 px per frame, at the same 30 the curve counts in. */
const SCROLL_SPEED = 5 * SLIDE_FPS
/**
 * How long a line that FITS the window is held for. The exe overwrites the
 * caller's dwell with 300 at 0x45EDFE and compares against a clock in
 * milliseconds — which reads faster than a line can be read, so it is the
 * one number here to check against play before trusting.
 */
const DWELL = 0.3

/** What the bar is doing. */
type Phase = 'idle' | 'in' | 'showing' | 'out'

/** How many lines can be waiting: the exe's own ring of 8. */
const QUEUE_LIMIT = 8

export interface BriefingBar {
  /** Decode the box art and the font. Safe to call repeatedly. */
  load(): Promise<void>
  /** Queue a line. It opens the bar if it is down. */
  say(text: string): void
  /** One frame of the slide and the scroll. */
  update(delta: number): void
  /** Draw it, in the 640×480 units the screen is laid out in. */
  draw(context: CanvasRenderingContext2D, viewWidth: number): void
  /** Whether a line is up or waiting — the tutorial script's cue to wait. */
  busy(): boolean
  /** Drop everything: the battle is no longer the view. */
  clear(): void
}

/** How far one character moves the pen: its own width less the kern, and a
 * space simply the font's space. */
const advance = (font: Font, character: string): number =>
  character === ' ' ? font.measure(' ') : font.measure(character) - 1

const measureLine = (font: Font, text: string): number => {
  let width = 0
  for (const character of text) width += advance(font, character)
  return width
}

const drawLine = (
  context: CanvasRenderingContext2D,
  font: Font,
  text: string,
  x: number,
  y: number
): void => {
  let at = x
  for (const character of text) {
    font.draw(context, character, Math.round(at), y)
    at += advance(font, character)
  }
}

export function createBriefingBar(): BriefingBar {
  let art: SpriteSet | null = null
  let font: Font | null = null
  let loaded = false

  const queue: string[] = []
  let phase: Phase = 'idle'
  /** The curve's frame, 0..9, counted in real time rather than in frames. */
  let slide = 0
  /** The line being shown, and how wide it is drawn. */
  let line = ''
  let width = 0
  let scrolls = false
  /** How far the line has still to drive in, and how far it has scrolled. */
  let offset = 0
  let progress = 0
  let dwell = 0

  /** Take the next line off the queue and start the bar coming down. */
  const begin = (): void => {
    const next = queue.shift()
    if (next === undefined || !font) return
    line = next
    width = measureLine(font, line)
    scrolls = width > TEXT.width
    // Wide lines drive in from the right edge of the window; ones that fit
    // are centred, exactly as 0x45EEFE does once its progress is reset.
    offset = scrolls ? TEXT.width : Math.round((TEXT.width - width) / 2)
    progress = 0
    dwell = DWELL
    phase = 'in'
  }

  return {
    async load() {
      if (loaded) return
      try {
        const [box, letters] = await Promise.all([loadTims(MESSAGE_BOX), loadFont(BAR_FONT)])
        art = box
        font = letters
        loaded = true
      } catch (error) {
        // A stripped install has no message box; the battle plays on without
        // one. Warn rather than error — the e2e suite fails on console.error.
        console.warn(String(error))
      }
    },

    say(text) {
      if (text.length === 0) return
      queue.push(text)
      // The exe's queue is a ring of 8: the ninth line lands on the oldest.
      if (queue.length > QUEUE_LIMIT) queue.shift()
    },

    update(delta) {
      if (!font) return
      if (phase === 'idle') {
        if (queue.length > 0) begin()
        return
      }
      if (phase === 'in') {
        slide = Math.min(SLIDE.length - 1, slide + delta * SLIDE_FPS)
        if (slide >= SLIDE.length - 1) phase = 'showing'
        return
      }
      if (phase === 'showing') {
        // The line drives in first and scrolls only once it is home.
        if (offset > 0 && scrolls) offset = Math.max(0, offset - SCROLL_SPEED * delta)
        else if (scrolls) progress += SCROLL_SPEED * delta
        else dwell -= delta
        if (scrolls ? progress >= width : dwell <= 0) phase = 'out'
        return
      }
      slide = Math.max(0, slide - delta * SLIDE_FPS)
      if (slide > 0) return
      // Down again: straight into the next line if one is waiting, which is
      // what keeps a run of them feeling like one briefing.
      phase = 'idle'
      line = ''
      if (queue.length > 0) begin()
    },

    draw(context, viewWidth) {
      if (!art || !font || phase === 'idle' || line === '') return
      const centre = viewWidth / 2
      // The curve is stepped, not smoothed: the exe advances a frame counter.
      const percent = SLIDE[Math.min(SLIDE.length - 1, Math.max(0, Math.round(slide)))]
      const dropped = (percent * DROP) / 100
      const left = centre + BAR.left
      const right = centre + BAR.right

      const blit = (sprite: Sprite, x: number, y: number, mirrored = false): void => {
        if (!mirrored) {
          context.drawImage(sprite.image, Math.round(x), Math.round(y))
          return
        }
        context.save()
        context.translate(Math.round(x) + sprite.width, Math.round(y))
        context.scale(-1, 1)
        context.drawImage(sprite.image, 0, 0)
        context.restore()
      }

      // The scroll first, then a cap over each end of it. The left cap is
      // the mirrored blit (flags 0x105 against the right one's 0x101).
      const cap = art.get('npro4')
      const tile = art.get('npro3')
      for (let i = 0; i < TILE.count; i++) {
        blit(tile, left + TILE.first + i * TILE.step, dropped - TILE_Y)
      }
      blit(cap, left + CAP.left, dropped - CAP_Y, true)
      blit(cap, right + CAP.right, dropped - CAP_Y)

      // The line, clipped to the window it runs in — which is what makes the
      // text appear from under the bar's own edge on the way down — and
      // squeezed into the strip's 22 rows on the way through.
      const textX = centre + TEXT.left
      const textY = dropped - TEXT_Y
      context.save()
      context.beginPath()
      context.rect(textX, textY, TEXT.width, TEXT.height)
      context.clip()
      context.translate(textX, Math.round(textY))
      context.scale(1, TEXT.height / font.height)
      drawLine(context, font, line, offset - progress, 0)
      context.restore()
    },

    busy: () => phase !== 'idle' || queue.length > 0,

    clear() {
      queue.length = 0
      phase = 'idle'
      line = ''
      slide = 0
      offset = 0
      progress = 0
    }
  }
}
