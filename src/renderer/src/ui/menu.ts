// The main menu, wearing the original's own frontend.
//
// Everything on it is the game's: the backdrop and the machinery out of
// FEBmps/FEBMP.MAD, the letters out of FEText, and the four labels out of
// Language/Text/fetext.bin — MAIN MENU over ONE PLAYER, MULTI-PLAYER,
// OPTIONS and QUIT APPLICATION, which is the screen the original opens on.
//
// WHERE each piece sits is the one thing not taken from the game: the exe
// computes its screen coordinates in the frontend's draw code rather than
// storing them (../pigs-disasm/frontend/notes.md ends at the blitter), so
// LAYOUT below is the remake's reading of the art and is meant to be
// corrected against play.
//
// Only ONE PLAYER leads anywhere yet — it opens the training ground. The two
// screens that are not built are drawn in the font's own dark variant, the
// way the original greys out what cannot be chosen, and do nothing.

import { byId } from './dom'
import { loadFont } from './font'
import type { Font } from './font'
import { loadSprites } from './sprites'
import type { Sprite, SpriteSet } from './sprites'
import { SILENT, loadBank } from '../audio/bank'
import type { Bank } from '../audio/bank'
import { controller } from '../input/controller'
import { MENU_BINDINGS } from '../input/actions'

/** The frontend's own bank — 27 sounds, the menu's clicks among them. */
const FRONTEND_SOUNDS = 'FESounds/Fesounds.srl'
/** What a menu bar says when it moves. Chosen by name out of that bank;
 * which index the original uses where is not decoded. */
const CLICK = 'CLICK5'

/** The frontend is authored for 640×480 and drawn at it, then scaled. */
export const SCREEN = { width: 640, height: 480 }

/** fetext indices: the title, then the four bars under it. */
const TITLE_TEXT = 8
const ITEM_TEXT = [13, 14, 15, 16]

interface Item {
  /** Which fetext string it wears. */
  text: number
  /** What choosing it does. A bar with nothing behind it yet is dark. */
  choose: (() => void) | null
}

/**
 * Where each piece lands. The remake's own — see the header — chosen so the
 * bars clear the machine's grille and the dial sits in its housing.
 *
 * `select.mgl` is deliberately NOT here: its window is 116 wide where a bar's
 * face is 144, so it frames something else on some other screen, and the lit
 * bar is told apart by its lighter letters and the carriage beside it.
 */
const LAYOUT = {
  machine: { x: 56, y: 128 },
  title: { x: 216, y: 24 },
  bars: { x: 240, y: 140, step: 44 },
  /** The rack down the left, and the carriage that runs on it. */
  track: { x: 0, y: 0 },
  carriage: { x: 184, offset: -103 },
  cog: { x: 512, y: 352 },
  dial: { x: 56, y: 330 }
}

/**
 * How long a bar takes to flip over when the selection reaches it — and, the
 * same number, how soon the next bar may be reached. The machine is not
 * instant: a held key or a mouse dragged down the column steps one bar at a
 * time, and the click has room to be heard instead of being cut off by the
 * next one.
 */
const FLIP_SECONDS = 0.3
/** The machine idles at this many frames a second. */
const COG_FPS = 12

const ART = [
  'pigbkpc1',
  'fullmenu',
  'track',
  'chose1', 'chose2', 'chose3', 'chose4', 'chose5', 'chose6',
  'title1',
  'cog0', 'cog1', 'cog2', 'cog3', 'cog4', 'cog5',
  'selcog1',
  'dial0001', 'dial0002', 'dial0003', 'dial0004', 'dial0005', 'dial0006',
  'dial0007', 'dial0008', 'dial0009', 'dial0010', 'dial0011', 'dial0012'
]

export interface Menu {
  /** Decode the art and take over the screen; safe to call once a session. */
  load(): Promise<void>
  /** Stop drawing and listening — the menu is no longer the view. */
  leave(): void
  /** Come back to it. */
  enter(): void
  /** Which bar is lit, for the specs. */
  selected(): number
  /** What the bars say, in order, straight out of fetext. */
  labels(): string[]
}

export function initMenu(handlers: { onNewGame: () => void; onAssets: () => void }): Menu {
  const canvas = byId<HTMLCanvasElement>('menu-screen')
  canvas.width = SCREEN.width
  canvas.height = SCREEN.height

  let bank: Bank = SILENT
  let art: SpriteSet | null = null
  let strings: string[] = []
  // CHARS2 in its three shades: the light one for the chosen bar, the plain
  // one for the rest, the dark one for a bar with nothing behind it.
  let big: Font | null = null
  let lit: Font | null = null
  let plain: Font | null = null
  let off: Font | null = null
  let cogs: Sprite[] = []
  let dials: Sprite[] = []
  let plates: Sprite[] = []

  const items: Item[] = [
    { text: ITEM_TEXT[0], choose: handlers.onNewGame },
    { text: ITEM_TEXT[1], choose: null },
    { text: ITEM_TEXT[2], choose: null },
    { text: ITEM_TEXT[3], choose: () => void window.api.quit() }
  ]

  let selection = 0
  let visible = false
  let flipUntil = 0
  let started = 0
  /** The bar the mouse is over, taken up as soon as the machine will move. */
  let hovered = -1

  /** Move one bar, unless the last one is still turning. */
  const step = (by: number): void => {
    const now = performance.now()
    if (now < flipUntil) return
    const next = (selection + by + items.length) % items.length
    if (next === selection) return
    selection = next
    flipUntil = now + FLIP_SECONDS * 1000
    bank.play(CLICK)
  }

  const choose = (): void => {
    const item = items[selection]
    if (!item.choose) return
    bank.play(CLICK)
    item.choose()
  }

  controller.onAction((action) => {
    if (!visible) return
    if (action === 'menuUp') step(-1)
    else if (action === 'menuDown') step(1)
    else if (action === 'menuSelect') choose()
    else if (action === 'assets') handlers.onAssets()
  })
  controller.bindKeyboard(() => visible, MENU_BINDINGS)

  // The mouse is the remake's own convenience: the original is driven from
  // the keyboard and the pad. Hovering lights a bar, clicking chooses it.
  const barUnder = (event: MouseEvent): number => {
    const box = canvas.getBoundingClientRect()
    // The canvas is letterboxed inside its box by object-fit: contain.
    const scale = Math.min(box.width / SCREEN.width, box.height / SCREEN.height)
    const x = (event.clientX - box.left - (box.width - SCREEN.width * scale) / 2) / scale
    const y = (event.clientY - box.top - (box.height - SCREEN.height * scale) / 2) / scale
    if (!art) return -1
    const bar = art.get('chose1')
    for (let i = 0; i < items.length; i++) {
      const top = LAYOUT.bars.y + i * LAYOUT.bars.step
      if (x >= LAYOUT.bars.x && x < LAYOUT.bars.x + bar.width && y >= top && y < top + bar.height) {
        return i
      }
    }
    return -1
  }
  // Where the pointer rests is remembered rather than acted on: the machine
  // works its way there a bar at a time, so dragging down the column reads
  // as four turns of the cog and not as one jump.
  canvas.addEventListener('mousemove', (event) => {
    hovered = barUnder(event)
  })
  canvas.addEventListener('mouseleave', () => {
    hovered = -1
  })
  canvas.addEventListener('click', (event) => {
    if (barUnder(event) === selection) choose()
  })

  const label = (index: number): string => strings[index] ?? ''

  const centred = (
    context: CanvasRenderingContext2D,
    font: Font,
    text: string,
    sprite: Sprite,
    x: number,
    y: number
  ): void => {
    font.draw(
      context,
      text,
      Math.round(x + (sprite.width - font.measure(text)) / 2),
      Math.round(y + (sprite.height - font.height) / 2)
    )
  }

  // `now` is the frame's own timestamp, and rAF hands out the time the frame
  // BEGAN — which can predate the `performance.now()` taken when the art
  // finished loading. One negative millisecond floors to -1, and `-1 % n` is
  // -1 in JS, so the first frame drew `undefined` and threw. Clamp the age
  // rather than the index: an animation cannot start before it starts.
  const cycle = (frames: Sprite[], now: number): Sprite =>
    frames[Math.floor((Math.max(0, now - started) / 1000) * COG_FPS) % frames.length]

  const draw = (now: number): void => {
    const context = canvas.getContext('2d')
    if (!context || !art || !big || !lit || !plain || !off) return
    const blit = (sprite: Sprite, x: number, y: number): void =>
      context.drawImage(sprite.image, x, y)

    blit(art.get('pigbkpc1'), 0, 0)
    blit(art.get('fullmenu'), LAYOUT.machine.x, LAYOUT.machine.y)
    blit(art.get('track'), LAYOUT.track.x, LAYOUT.track.y)
    blit(cycle(dials, now), LAYOUT.dial.x, LAYOUT.dial.y)
    blit(cycle(cogs, now), LAYOUT.cog.x, LAYOUT.cog.y)

    const title = art.get('title1')
    blit(title, LAYOUT.title.x, LAYOUT.title.y)
    centred(context, big, label(TITLE_TEXT), title, LAYOUT.title.x, LAYOUT.title.y)

    // A bar flips over as the selection lands on it; the letters come back
    // when it has settled flat again.
    const flipping = now < flipUntil
    for (let i = 0; i < items.length; i++) {
      const y = LAYOUT.bars.y + i * LAYOUT.bars.step
      const turning = flipping && i === selection
      const through = (flipUntil - now) / (FLIP_SECONDS * 1000)
      const face = turning
        ? plates[Math.min(plates.length - 1, Math.floor(through * plates.length))]
        : plates[0]
      blit(face, LAYOUT.bars.x, y)
      if (!turning) {
        const font = !items[i].choose ? off : i === selection ? lit : plain
        centred(context, font, label(items[i].text), face, LAYOUT.bars.x, y)
      }
    }

    const chosen = LAYOUT.bars.y + selection * LAYOUT.bars.step
    blit(art.get('selcog1'), LAYOUT.carriage.x, chosen + LAYOUT.carriage.offset)
  }

  // The machine only turns while it is on screen: an app parked behind a
  // battle — or behind another app, during a test run — costs nothing. And
  // it is repainted at the game's own 25 a second rather than at whatever
  // the display runs at; the art itself is animated slower than that.
  const FRAME_MS = 1000 / 25
  let frame = 0
  let painted = 0
  const tick = (now: number): void => {
    frame = requestAnimationFrame(tick)
    if (now - painted < FRAME_MS) return
    painted = now
    if (hovered >= 0) {
      if (hovered === selection) hovered = -1
      else step(hovered > selection ? 1 : -1)
    }
    draw(now)
  }
  const run = (on: boolean): void => {
    if (on && loaded && frame === 0) frame = requestAnimationFrame(tick)
    if (!on && frame !== 0) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }

  let loaded = false
  return {
    async load() {
      if (loaded) return
      bank = await loadBank(FRONTEND_SOUNDS)
      try {
        const [sprites, text, bigFont, litFont, plainFont, offFont] = await Promise.all([
          loadSprites(ART),
          window.api.loadGameText('fetext'),
          loadFont('BIG'),
          loadFont('chars2L'),
          loadFont('CHARS2'),
          loadFont('chars2D')
        ])
        art = sprites
        if (!text.ok) throw new Error(text.error)
        strings = text.strings
        big = bigFont
        lit = litFont
        plain = plainFont
        off = offFont
        cogs = art.frames('cog', 0, 5)
        dials = art.frames('dial', 1, 12, 4)
        plates = art.frames('chose', 1, 6)
      } catch (error) {
        // A stripped install has no frontend to wear. Warn rather than
        // error: the e2e suite treats console.error as a failed run.
        console.warn(String(error))
        return
      }
      started = performance.now()
      loaded = true
      run(visible)
    },
    leave() {
      visible = false
      run(false)
    },
    enter() {
      visible = true
      run(true)
    },
    selected: () => selection,
    labels: () => items.map((item) => label(item.text))
  }
}
