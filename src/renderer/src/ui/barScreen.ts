// The frontend's MACHINE: a backdrop, a turning cog and dial, and a column of
// bars that flip over as the selection lands on them.
//
// It is one screen in the original's art and more than one screen in the
// game — MAIN MENU and MULTI-PLAYER are the same furniture wearing different
// labels — so the machine lives here and each screen is only its list of
// bars. Everything on it is the game's: the backdrop and the machinery out of
// FEBmps/FEBMP.MAD, the letters out of FEText, the labels out of
// Language/Text/fetext.bin.
//
// WHERE each piece sits is the one thing not taken from the game: the exe
// computes its screen coordinates in the frontend's draw code rather than
// storing them (../pigs-disasm/frontend/notes.md ends at the blitter), so
// LAYOUT below is the remake's reading of the art and is meant to be
// corrected against play — `pow.screen.layout` nudges it live and
// `pow.screen.print()` writes it back out, the same way `pow.hud` does.

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

/**
 * Where each piece lands. The remake's own — see the header — chosen so the
 * bars clear the machine's grille and the dial sits in its housing.
 *
 * `select.mgl` is deliberately NOT here: its window is 116 wide where a bar's
 * face is 144, so it frames something else on some other screen, and the lit
 * bar is told apart by its lighter letters and the carriage beside it.
 */
export const LAYOUT = {
  machine: { x: 56, y: 128 },
  title: { x: 216, y: 24 },
  /**
   * The column. **The STEP is 40 and that is read, not chosen** — the exe's
   * frontend draw arm places item `i` at `i*40` (0x41bfb9, and it bands its
   * source rect the same way), and the ART agrees without any disassembly:
   * `light1` decodes to exactly four lamp bands 36 tall with their tops at 6,
   * 46, 87, 128. It was 44 by eye. Where the column SITS is still the
   * remake's: the exe places it against the screen CENTRE and which screen id
   * that arm draws is not pinned yet (`../pigs-disasm/frontend/notes.md`).
   */
  bars: { x: 240, y: 140, step: 40 },
  /** One lamp per item, beside its bar — play: "круглые, на каждом пункте, но
   * мигает только 1 активная". Where it sits is eyework; that it is one per
   * item at the bars' own pitch is the art's own (see `bars.step`). */
  lamp: { dx: -34, dy: 0 },
  /** The rack down the left, and the carriage that runs on it. */
  track: { x: 0, y: 0 },
  carriage: { x: 184, offset: -103 },
  cog: { x: 512, y: 352 },
  dial: { x: 56, y: 330 },
  /** A bar that carries a SETTING splits: the label sits in from the left
   * edge and the value in from the right, rather than one centred line. */
  setting: { labelInset: 12, valueInset: 12 }
}

/**
 * How long the plates take to turn over when a screen ARRIVES.
 *
 * That is what the flip is for, and it is play's word: the bars turn when the
 * menu's CONTENTS change — MAIN MENU becoming ONE PLAYER — not when the lit
 * bar moves. This screen's contents never change once it is built, so its
 * arrival IS the change.
 */
const ARRIVE_SECONDS = 0.3
/**
 * How long the carriage takes to travel one bar — and, the same number, how
 * soon the next bar may be reached. The machine is not instant: a held key or
 * a mouse dragged down the column steps one bar at a time, and the click has
 * room to be heard instead of being cut off by the next one.
 */
const TRAVEL_SECONDS = 0.3
/** The machine idles at this many frames a second. */
const COG_FPS = 12
/** …and the carriage's own cog turns at this rate while it travels. Play:
 * "крутится при движении виджета". */
const CARRIAGE_FPS = 20
/** How fast the active item's lamp blinks, in full cycles a second. */
const LAMP_FPS = 8

const ART = [
  'pigbkpc1',
  'fullmenu',
  'track',
  'chose1', 'chose2', 'chose3', 'chose4', 'chose5', 'chose6',
  'title1', 'title2', 'title3', 'title4', 'title5', 'title6',
  'cog0', 'cog1', 'cog2', 'cog3', 'cog4', 'cog5',
  'selcog1', 'selcog2', 'selcog3', 'selcog4', 'selcog5', 'selcog6',
  'lit1', 'lit2', 'lit3',
  'dial0001', 'dial0002', 'dial0003', 'dial0004', 'dial0005', 'dial0006',
  'dial0007', 'dial0008', 'dial0009', 'dial0010', 'dial0011', 'dial0012'
]

/** One row of the column. A bar with nothing behind it yet is drawn in the
 * font's dark shade and refuses to be chosen, the way the original greys out
 * what cannot be picked. */
export interface Bar {
  /** What it says, straight out of fetext. */
  label(): string
  /** What it says on the RIGHT — a bar that carries a setting rather than a
   * destination. Absent, or null, and the label is centred as usual. */
  value?(): string | null
  /** Whether it leads anywhere. */
  enabled(): boolean
  /** The select key. */
  choose?(): void
}

/** Where one screen's pieces sit. Cloned per screen off `LAYOUT`, so a
 * console nudge moves the screen being looked at and not every screen. */
export type ScreenLayout = typeof LAYOUT

function cloneLayout(): ScreenLayout {
  return {
    machine: { ...LAYOUT.machine },
    title: { ...LAYOUT.title },
    bars: { ...LAYOUT.bars },
    lamp: { ...LAYOUT.lamp },
    track: { ...LAYOUT.track },
    carriage: { ...LAYOUT.carriage },
    cog: { ...LAYOUT.cog },
    dial: { ...LAYOUT.dial },
    setting: { ...LAYOUT.setting }
  }
}

export interface BarScreen {
  /** Decode the art and take over the canvas; safe to call once a session. */
  load(): Promise<void>
  /** Stop drawing and listening — this is no longer the view. */
  leave(): void
  /** Come back to it, with the selection back at the top. */
  enter(): void
  /** Which bar is lit, for the specs. */
  selected(): number
  /** Whether a bar is still turning over — the machine refuses to move again
   * until it has settled, so a spec that presses through a flip is pressing
   * into a refusal (`e2e/menu.ts`). */
  flipping(): boolean
  /** What the bars say, in order, for the specs. */
  labels(): string[]
  /** What the bars say on the right, in order — null where a bar carries no
   * setting. The specs read a screen's STATE through this. */
  values(): (string | null)[]
  /** This screen's live layout, for the console. */
  layout: ScreenLayout
}

/**
 * The frontend's own strings, indexed exactly as the game indexes them — so
 * `feText(8)` is MAIN MENU and `feText(59)` is MULTI-PLAYER. A screen names
 * its labels by index and reads them through here, because the bars are built
 * before the archive has been opened.
 */
let strings: string[] = []
export const feText = (index: number): string => strings[index] ?? ''

/**
 * The art, the fonts, the bank and the strings, decoded ONCE for every screen
 * that wears them. The backdrop alone is a 640×480 image out of a compressed
 * archive; paying for it per screen would be paying for the same pixels twice.
 */
let shared: Promise<{
  bank: Bank
  art: SpriteSet
  big: Font
  lit: Font
  plain: Font
  off: Font
}> | null = null

function loadShared(): NonNullable<typeof shared> {
  shared ??= (async () => {
    const [bank, sprites, text, bigFont, litFont, plainFont, offFont] = await Promise.all([
      loadBank(FRONTEND_SOUNDS),
      loadSprites(ART),
      window.api.loadGameText('fetext'),
      loadFont('BIG'),
      // CHARS2 in its three shades: the light one for the chosen bar, the
      // plain one for the rest, the dark one for a bar with nothing behind it.
      loadFont('chars2L'),
      loadFont('CHARS2'),
      loadFont('chars2D')
    ])
    if (!text.ok) throw new Error(text.error)
    strings = text.strings
    return { bank, art: sprites, big: bigFont, lit: litFont, plain: plainFont, off: offFont }
  })()
  return shared
}

export function initBarScreen(config: {
  canvas: HTMLCanvasElement
  /** The plate at the top — the screen's own fetext string. */
  title: () => string
  bars: Bar[]
  /** The back key, where the screen has somewhere to go back to. */
  onBack?: () => void
  /** F1, the remake's own asset browsers. */
  onAssets?: () => void
}): BarScreen {
  const { canvas, bars } = config
  const layout = cloneLayout()
  canvas.width = SCREEN.width
  canvas.height = SCREEN.height

  let bank: Bank = SILENT
  let art: SpriteSet | null = null
  let big: Font | null = null
  let lit: Font | null = null
  let plain: Font | null = null
  let off: Font | null = null
  let cogs: Sprite[] = []
  let dials: Sprite[] = []
  let plates: Sprite[] = []
  let titles: Sprite[] = []
  let carriages: Sprite[] = []
  let lamps: Sprite[] = []

  let selection = 0
  let visible = false
  let started = 0
  /** When the screen last arrived — the plates and the title plate turn over
   * for `ARRIVE_SECONDS` from here. */
  let arrivedAt = -Infinity
  /** The carriage on its way from one bar to the next. It is what refuses a
   * second press, and its cog turns only while it is running. */
  let travel: { from: number; until: number } | null = null
  /** The bar the mouse is over, taken up as soon as the machine will move. */
  let hovered = -1

  const travelling = (now: number): boolean => travel !== null && now < travel.until

  /** Move one bar, unless the carriage is still on its way. */
  const step = (by: number): void => {
    const now = performance.now()
    if (travelling(now)) return
    const next = (selection + by + bars.length) % bars.length
    if (next === selection) return
    travel = { from: selection, until: now + TRAVEL_SECONDS * 1000 }
    selection = next
    bank.play(CLICK)
  }

  /**
   * Leave this screen for another.
   *
   * Every screen listens to the SAME controller and tells itself apart by
   * `visible` — so a handler that swaps the view synchronously flips that
   * flag while the press is still being delivered, and the screen it just
   * opened receives the very same press. That is not hypothetical: choosing
   * MULTI-PLAYER off the menu carried straight through to whatever bar the
   * MULTI-PLAYER screen happened to have lit, two screens deep in one key.
   *
   * So a navigation is queued and runs once the press has finished being
   * delivered. Nothing else about the handler changes.
   */
  const navigate = (go: () => void): void => queueMicrotask(go)

  const choose = (): void => {
    const bar = bars[selection]
    if (!bar.enabled() || !bar.choose) return
    bank.play(CLICK)
    navigate(bar.choose)
  }

  controller.onAction((action) => {
    if (!visible) return
    if (action === 'menuUp') step(-1)
    else if (action === 'menuDown') step(1)
    else if (action === 'menuSelect') choose()
    else if (action === 'menuBack') {
      if (config.onBack) navigate(config.onBack)
    } else if (action === 'assets') {
      if (config.onAssets) navigate(config.onAssets)
    }
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
    for (let i = 0; i < bars.length; i++) {
      const top = layout.bars.y + i * layout.bars.step
      if (x >= layout.bars.x && x < layout.bars.x + bar.width && y >= top && y < top + bar.height) {
        return i
      }
    }
    return -1
  }
  // Where the pointer rests is remembered rather than acted on: the machine
  // works its way there a bar at a time, so dragging down the column reads
  // as several turns of the cog and not as one jump.
  canvas.addEventListener('mousemove', (event) => {
    hovered = barUnder(event)
  })
  canvas.addEventListener('mouseleave', () => {
    hovered = -1
  })
  canvas.addEventListener('click', (event) => {
    if (barUnder(event) === selection) choose()
  })

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
  const frameAt = (frames: Sprite[], now: number): Sprite =>
    frames[Math.floor((Math.max(0, now - started) / 1000) * COG_FPS) % frames.length]

  const draw = (now: number): void => {
    const context = canvas.getContext('2d')
    if (!context || !art || !big || !lit || !plain || !off) return
    const blit = (sprite: Sprite, x: number, y: number): void =>
      context.drawImage(sprite.image, x, y)

    blit(art.get('pigbkpc1'), 0, 0)
    blit(art.get('fullmenu'), layout.machine.x, layout.machine.y)
    blit(art.get('track'), layout.track.x, layout.track.y)
    blit(frameAt(dials, now), layout.dial.x, layout.dial.y)
    blit(frameAt(cogs, now), layout.cog.x, layout.cog.y)

    // How far into the arrival the screen is, 0..1, or null once it has
    // settled. The plates and the title plate both turn on it, together,
    // because they are turning over to say the same new thing.
    const arriving = (now - arrivedAt) / (ARRIVE_SECONDS * 1000)
    const turning = arriving >= 0 && arriving < 1 ? arriving : null
    const oneShot = (frames: Sprite[], through: number): Sprite =>
      frames[Math.min(frames.length - 1, Math.floor(through * frames.length))]

    const title = turning === null ? titles[0] : oneShot(titles, turning)
    blit(title, layout.title.x, layout.title.y)
    // Mid-turn a plate is edge-on to what it used to say, so it says nothing.
    if (turning === null) {
      centred(context, big, config.title(), title, layout.title.x, layout.title.y)
    }

    for (let i = 0; i < bars.length; i++) {
      const y = layout.bars.y + i * layout.bars.step
      const face = turning === null ? plates[0] : oneShot(plates, turning)
      blit(face, layout.bars.x, y)

      // One lamp per item; only the lit one blinks, the rest sit at the
      // dimmest frame the set has.
      if (lamps.length > 0) {
        const lamp =
          i === selection
            ? lamps[Math.floor((Math.max(0, now - started) / 1000) * LAMP_FPS) % lamps.length]
            : lamps[0]
        blit(lamp, layout.bars.x + layout.lamp.dx, y + layout.lamp.dy)
      }

      if (turning !== null) continue

      const bar = bars[i]
      const font = !bar.enabled() ? off : i === selection ? lit : plain
      const value = bar.value?.() ?? null
      if (value === null) {
        centred(context, font, bar.label(), face, layout.bars.x, y)
        continue
      }
      // A setting reads left to right: what it is, then what it is set to.
      const top = Math.round(y + (face.height - font.height) / 2)
      font.draw(context, bar.label(), layout.bars.x + layout.setting.labelInset, top)
      font.draw(
        context,
        value,
        Math.round(
          layout.bars.x + face.width - layout.setting.valueInset - font.measure(value)
        ),
        top
      )
    }

    // The carriage RUNS to the bar rather than jumping to it, and its own cog
    // turns while it is running — play: "крутится при движении виджета".
    let row = selection
    let cog = carriages[0]
    if (travel !== null && now < travel.until) {
      const through = 1 - (travel.until - now) / (TRAVEL_SECONDS * 1000)
      row = travel.from + (selection - travel.from) * through
      cog = carriages[Math.floor((Math.max(0, now - started) / 1000) * CARRIAGE_FPS) % carriages.length]
    }
    const chosen = layout.bars.y + row * layout.bars.step
    blit(cog, layout.carriage.x, Math.round(chosen + layout.carriage.offset))
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
      try {
        const pieces = await loadShared()
        bank = pieces.bank
        art = pieces.art
        big = pieces.big
        lit = pieces.lit
        plain = pieces.plain
        off = pieces.off
        cogs = art.frames('cog', 0, 5)
        dials = art.frames('dial', 1, 12, 4)
        plates = art.frames('chose', 1, 6)
        titles = art.frames('title', 1, 6)
        carriages = art.frames('selcog', 1, 6)
        lamps = art.frames('lit', 1, 3)
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
      // Arriving IS the content change, so the plates turn over for it.
      arrivedAt = performance.now()
      travel = null
      run(true)
    },
    selected: () => selection,
    // "Busy": the carriage is on its way, or the screen is still turning
    // over. Either refuses a press, so either is what a spec must wait out.
    flipping() {
      const now = performance.now()
      return travelling(now) || now - arrivedAt < ARRIVE_SECONDS * 1000
    },
    labels: () => bars.map((bar) => bar.label()),
    values: () => bars.map((bar) => bar.value?.() ?? null),
    layout
  }
}
