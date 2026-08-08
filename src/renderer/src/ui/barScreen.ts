// The frontend's MACHINE: a backdrop, turning cogs, a dial whose needle points
// at the lit row, and a column of bars that flip over when the screen arrives.
//
// It is one screen in the original's art and more than one screen in the
// game — MAIN MENU and MULTI-PLAYER are the same furniture wearing different
// labels — so the machine lives here and each screen is only its list of
// bars. Everything on it is the game's: the backdrop and the machinery out of
// FEBmps/FEBMP.MAD, the letters out of FEText, the labels out of
// Language/Text/fetext.bin.
//
// WHERE each piece sits is the game's now, not the remake's. The exe computes
// its screen coordinates in the frontend's draw code rather than storing them,
// and the MAIN MENU's arm has been read blit by blit (frontend/notes.md, in
// the disasm repo), so `LAYOUT` below carries the original's own numbers with
// the address each came from. What is still eyework says so: both TRACKS,
// whose blitter's convention is undecoded.
//
// There is NO carriage here. The remake used to run one — `selcog`, the arrow
// with a cog above and below — up and down the column, and play threw it out
// on sight: the original has no such thing on this screen. The disassembly
// says the same, and had said it before the screenshot: screen 1 never loads
// `selcog`. It belongs to SELECT TEAM and ENTER YOUR NAME, which is where it
// goes when those screens are built.
//
// The machine and the plates are STRETCHED — the frontend widens itself by a
// global 50, and it does so in two different ways: a plate repeats a band of
// its own art once, the machine repeats a two-pixel column twenty-five times.
// That is why the grille grows with the column instead of sitting behind it,
// and getting it wrong is what put our plates over the wrong recesses.
//
// `pow.screen.layout` nudges the lot live and `pow.screen.print()` writes it
// back out, the same way `pow.hud` does.

import { loadFont } from './font'
import type { Font } from './font'
import { loadSprites } from './sprites'
import type { Sprite, SpriteSet } from './sprites'
import { SILENT, loadBank } from '../audio/bank'
import type { Bank } from '../audio/bank'
import { controller } from '../input/controller'
import { MENU_BINDINGS } from '../input/actions'
import { entrance } from './entrance'
import { frameWalk } from './frames'

/** The frontend's own bank — 27 sounds, the menu's clicks among them. */
const FRONTEND_SOUNDS = 'FESounds/Fesounds.srl'
/** What a menu bar says when it moves. Chosen by name out of that bank;
 * which index the original uses where is not decoded. */
const CLICK = 'CLICK5'

/** The frontend is authored for 640×480 and drawn at it, then scaled. */
export const SCREEN = { width: 640, height: 480 }

/**
 * Where each piece lands. Read off screen 1's draw arm unless the field says
 * otherwise; every entry carries the address it came from.
 *
 * `select.mgl` is deliberately NOT here, and the disassembly agrees with the
 * art: screen 1 never loads it. The lit bar is told apart by its lighter
 * letters and by its lamp, which is the original's own way.
 */
export const LAYOUT = {
  /**
   * The machine — `fullmenu`, 528×352, and it is STRETCHED by the same 50 the
   * plates are, which is why its grille grows with the column instead of
   * sitting behind it. Three blits: source `0..seam` at `x`, then a
   * `column`-wide slice of the source repeated until the stretch is used up,
   * then `seam..width` after it (exe 0x41c356, the loop at 0x41c404, and
   * 0x41c47d). 25 at 0 was 56 at 128 by eye, and the 128 is exactly why the
   * grille sat below the plates.
   */
  machine: { x: 25, y: 0, seam: 340, column: 2 },
  /** The title plate, `title1..6` 208×64, stretched the plates' way — except
   * that its two halves OVERLAP by ten columns rather than abutting, which is
   * the exe's own doing (0x41c29b at 261 and 0x41c2f0 at 341, seam 40). */
  title: { x: 261, y: 112, seam: 40 },
  /**
   * The column, and **every number in it is READ** off the main menu's own
   * draw arm (screen id 1, exe 0x41bf6c — the loader arm proves the identity:
   * it decompresses `fullmenu`, `chose1..6`, `title1..6`, `light1..3` and the
   * machinery, and none of the other screens' widgets).
   *
   * A row's plate sits at `0x13F + ebx - stretch/2` and is 40 apart from the
   * next, where `ebx` rests at -10; a plate is drawn as TWO blits of one
   * 160-wide `chose` so it comes out `stretch` wider (see `drawPlate`).
   */
  bars: { x: 284, y: 182, step: 40, stretch: 50 },
  /**
   * The four-item arm's own stagger: rows 1 and 2 sit twelve pixels IN
   * (0x41c007/0x41c011) and rows 2 and 3 two pixels DOWN (0x41bf25 seeds it,
   * 0x41c056 sets it). Read off the MAIN MENU and nowhere else — every other
   * screen is drawn by an arm that has not been read — so only that screen
   * asks for it, through `stagger` in the config.
   */
  stagger: { indent: 12, drop: 2 },
  /**
   * One lamp per row, to the RIGHT of its plate, ending flush against it: the
   * exe puts it at `0x1DE + stretch/2 + ebx` = 493 and `0xB0 + 40i` = 176,
   * where the plate runs 284..494. The art is `light1..3`, a rack of FOUR
   * lamps 48×176 that the exe cuts a 38-tall band out of at the column's own
   * pitch — so `band` is which lamp, not which frame. Play: "круглые, на
   * каждом пункте, но мигает только 1 активная".
   */
  lamp: { x: 493, y: 176, band: 38 },
  /**
   * The toothed rack, and it is the ONE piece of furniture still placed by
   * eye. The exe blits `track` twice through `0x41AF70(x, y, sprite, rect,
   * w, h)` — a blitter with an explicit destination size, stretching the
   * 64×480 art to 638 tall — at y -272 and -222, and both of its x values
   * land off the screen when read literally. That function's convention is
   * not decoded, so this stays the remake's until it is.
   */
  track: { x: 0, y: 0 },
  /** The second one, down the RIGHT edge — the rack the pair of cogs runs on,
   * which play pointed at. The exe blits `track` TWICE, which is why there are
   * two of them here; where each lands is eyework for the same reason. */
  rightTrack: { x: 576, y: 0 },
  /** Read: the dial at (105, 192), one `cog` at (9, 192), and `cogb` — 96×208,
   * which is TWO cogs stacked in one sprite — at (539, 160) on the right.
   * Play named the missing pair before the disassembly did. */
  dial: { x: 105, y: 192 },
  cog: { x: 9, y: 192 },
  cogb: { x: 539, y: 160 },
  /** A bar that carries a SETTING splits: the label sits in from the left
   * edge and the value in from the right, rather than one centred line. */
  setting: { labelInset: 12, valueInset: 12 }
}

/**
 * Where a PLATE's two halves meet in the SOURCE image — the exe blits columns
 * `0 .. SEAM + stretch` at the row's x and columns `SEAM .. width` at
 * `x + SEAM + stretch`, so the two abut exactly and the columns just past the
 * seam are the ones repeated (0x41c073, 0x41c0ed).
 */
const SEAM = 24

/**
 * The plates and the title are ONE widget in the original, and turning them
 * over is a frame WALK rather than a timed animation: built on frame 2, asked
 * for frame 6, one frame per engine tick, and 6 of six wraps back to the
 * first. The request is guarded twice — the widget must not already be
 * walking, and the screen's entrance must have climbed past `FLIP_AT` — so
 * the flip lands as the machine finishes driving in. Every number is the
 * exe's (0x423f57..0x423f75); play had said the same thing first.
 */
const PLATE_BUILT_ON = 2
const PLATE_TURNS_TO = 6
const FLIP_AT = -50
/**
 * How long the machine takes to move the light one bar, and so how soon the
 * next bar may be reached. It is not instant: a held key or a mouse dragged
 * down the column steps one bar at a time, and the click has room to be heard
 * instead of being cut off by the next one. The remake's own number.
 */
const TRAVEL_SECONDS = 0.3
/** The machine idles at this many frames a second. */
const COG_FPS = 12
/** How fast the active item's lamp blinks, in full cycles a second. */
const LAMP_FPS = 8

const ART = [
  'pigbkpc1',
  'fullmenu',
  'track',
  'chose1', 'chose2', 'chose3', 'chose4', 'chose5', 'chose6',
  'title1', 'title2', 'title3', 'title4', 'title5', 'title6',
  'cog0', 'cog1', 'cog2', 'cog3', 'cog4', 'cog5',
  'cogb00', 'cogb01', 'cogb02', 'cogb03', 'cogb04', 'cogb05',
  'light1', 'light2', 'light3',
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
    cogb: { ...LAYOUT.cogb },
    bars: { ...LAYOUT.bars },
    stagger: { ...LAYOUT.stagger },
    lamp: { ...LAYOUT.lamp },
    track: { ...LAYOUT.track },
    rightTrack: { ...LAYOUT.rightTrack },
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
  /** Whether the rows carry the MAIN MENU's own stagger (`LAYOUT.stagger`).
   * It is read off that screen's draw arm and belongs to no other. */
  stagger?: boolean
  /** Where the screen DRIVES ON from, in the frontend's own units — the
   * exe's per-screen table, and only the main menu's entry is claimed
   * (`entrance.ts`). Left out, the screen is simply there. */
  entersFrom?: number
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
  /** `cogb00..05` — 96×208, which is TWO cogs stacked in one sprite. */
  let cogbs: Sprite[] = []
  let dials: Sprite[] = []
  let plates: Sprite[] = []
  let titles: Sprite[] = []
  let lamps: Sprite[] = []

  let selection = 0
  let visible = false
  let started = 0
  /** The light on its way from one bar to the next. It is what refuses a
   * second press, and what the dial's needle sweeps along with. */
  let travel: { from: number; until: number } | null = null
  /** The bar the mouse is over, taken up as soon as the machine will move. */
  let hovered = -1
  /** The screen's own arrival: one y displacement added to everything the
   * machine draws. The backdrop is NOT displaced — the exe blits it before
   * the switch that applies this (`entrance.ts`). */
  const driveOn = entrance(config.entersFrom ?? 0)
  /** The plates and the title, which are one widget and turn together. */
  let plate = frameWalk(PLATE_BUILT_ON, 6)
  /** What that displacement is right now. Read once a frame and shared with
   * the mouse, so a click during the arrival hits the bar it looks at. */
  let arrivalOffset = 0

  const travelling = (now: number): boolean => travel !== null && now < travel.until

  /** Move one bar, unless the light is still on its way. */
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
  /** How far row `i` is nudged from the column's own corner. Zero unless the
   * screen carries the main menu's stagger — see `LAYOUT.stagger`. */
  const staggerOf = (i: number): { dx: number; dy: number } => {
    if (!config.stagger) return { dx: 0, dy: 0 }
    return {
      dx: i === 1 || i === 2 ? layout.stagger.indent : 0,
      dy: i >= 2 ? layout.stagger.drop : 0
    }
  }
  /** A row's own corner and the width the stretched plate comes out at. */
  const rowBox = (i: number, plate: Sprite): { x: number; y: number; width: number } => {
    const { dx, dy } = staggerOf(i)
    return {
      x: layout.bars.x + dx,
      y: layout.bars.y + i * layout.bars.step + dy + arrivalOffset,
      width: plate.width + layout.bars.stretch
    }
  }

  const barUnder = (event: MouseEvent): number => {
    const box = canvas.getBoundingClientRect()
    // The canvas is letterboxed inside its box by object-fit: contain.
    const scale = Math.min(box.width / SCREEN.width, box.height / SCREEN.height)
    const x = (event.clientX - box.left - (box.width - SCREEN.width * scale) / 2) / scale
    const y = (event.clientY - box.top - (box.height - SCREEN.height * scale) / 2) / scale
    if (!art) return -1
    const plate = art.get('chose1')
    for (let i = 0; i < bars.length; i++) {
      const row = rowBox(i, plate)
      if (x >= row.x && x < row.x + row.width && y >= row.y && y < row.y + plate.height) {
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
    box: { x: number; y: number; width: number; height: number }
  ): void => {
    font.draw(
      context,
      text,
      Math.round(box.x + (box.width - font.measure(text)) / 2),
      Math.round(box.y + (box.height - font.height) / 2)
    )
  }

  // `now` is the frame's own timestamp, and rAF hands out the time the frame
  // BEGAN — which can predate the `performance.now()` taken when the art
  // finished loading. One negative millisecond floors to -1, and `-1 % n` is
  // -1 in JS, so the first frame drew `undefined` and threw. Clamp the age
  // rather than the index: an animation cannot start before it starts.
  const frameAt = (frames: Sprite[], now: number): Sprite =>
    frames[Math.floor((Math.max(0, now - started) / 1000) * COG_FPS) % frames.length]

  /**
   * The dial's NEEDLE, pointing at the lit row.
   *
   * Play's word — "именно она показывает на активное меню, а не ездит как
   * попало" — and the remake's own mechanism. The exe builds this widget once,
   * on entry, at frame 0 (`0x41F110(screen, 4, 0)`), and nothing found so far
   * moves it after that; what drives it in the original is not decoded. So the
   * twelve frames are spread evenly over the rows and the needle sweeps with
   * the selection, over the same travel the light takes.
   */
  const needle = (row: number): Sprite => {
    if (dials.length === 0) return dials[0]
    const across = bars.length > 1 ? row / (bars.length - 1) : 0
    return dials[Math.round(across * (dials.length - 1))]
  }

  const draw = (now: number): void => {
    const context = canvas.getContext('2d')
    if (!context || !art || !big || !lit || !plain || !off) return
    // Everything the machine draws is displaced by the arrival — everything
    // except the backdrop, which the exe blits before the switch that applies
    // it, so the sky stays put while the machine drives on.
    arrivalOffset = driveOn.offset(now)
    const blit = (sprite: Sprite, x: number, y: number): void =>
      context.drawImage(sprite.image, x, y + arrivalOffset)
    /** A plate — a row's, or the title's — in two halves, so it comes out
     * `stretch` wider than the art by repeating the columns just past the
     * seam. The exe's own way of doing it; see `SEAM`. */
    const drawPlate = (sprite: Sprite, x: number, y: number, seam = SEAM): void => {
      const left = seam + layout.bars.stretch
      context.drawImage(sprite.image, 0, 0, left, sprite.height, x, y, left, sprite.height)
      const right = sprite.width - seam
      context.drawImage(
        sprite.image, seam, 0, right, sprite.height,
        x + left, y, right, sprite.height
      )
    }
    /**
     * The MACHINE, stretched the other way the exe knows: source `0..seam`,
     * then one narrow COLUMN of the source repeated until the stretch is
     * used up, then `seam..width`. Same total width as the plate's trick and
     * a different picture — a grille gains bars rather than a wider bar.
     */
    const drawMachine = (sprite: Sprite, x: number, y: number): void => {
      const { seam, column } = layout.machine
      context.drawImage(sprite.image, 0, 0, seam, sprite.height, x, y, seam, sprite.height)
      let at = x + seam
      for (let done = 0; done < layout.bars.stretch; done += column) {
        context.drawImage(
          sprite.image, seam, 0, column, sprite.height,
          at, y, column, sprite.height
        )
        at += column
      }
      const right = sprite.width - seam
      context.drawImage(sprite.image, seam, 0, right, sprite.height, at, y, right, sprite.height)
    }
    /** One lamp out of the rack of four, chosen by ROW rather than by frame.
     * A screen with more rows than the rack has lamps repeats it — the exe
     * only ever bands four, because the arm this is read off draws four. */
    const drawLamp = (sprite: Sprite, row: number, x: number, y: number): void => {
      const band = layout.lamp.band
      const top = (row % 4) * layout.bars.step
      context.drawImage(sprite.image, 0, top, sprite.width, band, x, y, sprite.width, band)
    }

    // Which row the machine is pointing at — a fraction while the selection
    // is on its way, so the needle SWEEPS rather than jumps. Wanted before the
    // furniture is drawn, because the dial reads it.
    const pointingAt = ((): number => {
      if (travel === null || now >= travel.until) return selection
      const through = 1 - (travel.until - now) / (TRAVEL_SECONDS * 1000)
      return travel.from + (selection - travel.from) * through
    })()

    context.drawImage(art.get('pigbkpc1').image, 0, 0)
    drawMachine(art.get('fullmenu'), layout.machine.x, layout.machine.y + arrivalOffset)
    blit(art.get('track'), layout.track.x, layout.track.y)
    blit(art.get('track'), layout.rightTrack.x, layout.rightTrack.y)
    blit(needle(pointingAt), layout.dial.x, layout.dial.y)
    blit(frameAt(cogs, now), layout.cog.x, layout.cog.y)
    blit(frameAt(cogbs, now), layout.cogb.x, layout.cogb.y)

    // The plates and the title are one widget and turn together. The request
    // to turn is made here, on the exe's own two guards — see PLATE_TURNS_TO.
    if (driveOn.raw() > FLIP_AT) plate.goTo(now, PLATE_TURNS_TO)
    const face = plates[plate.at(now)]
    const turning = plate.walking()

    const title = titles[plate.at(now)]
    drawPlate(title, layout.title.x, layout.title.y + arrivalOffset, layout.title.seam)
    // Mid-turn a plate is edge-on to what it used to say, so it says nothing.
    if (!turning) {
      centred(context, big, config.title(), {
        x: layout.title.x,
        y: layout.title.y + arrivalOffset,
        width: title.width + layout.bars.stretch,
        height: title.height
      })
    }

    for (let i = 0; i < bars.length; i++) {
      const row = rowBox(i, face)
      drawPlate(face, row.x, row.y)

      // One lamp per row, to the right of its plate; only the lit one blinks,
      // the rest sit at the dimmest frame the rack has.
      if (lamps.length > 0) {
        const lamp =
          i === selection
            ? lamps[Math.floor((Math.max(0, now - started) / 1000) * LAMP_FPS) % lamps.length]
            : lamps[0]
        drawLamp(lamp, i, layout.lamp.x, layout.lamp.y + i * layout.bars.step + arrivalOffset)
      }

      if (turning) continue

      const bar = bars[i]
      const font = !bar.enabled() ? off : i === selection ? lit : plain
      const value = bar.value?.() ?? null
      if (value === null) {
        centred(context, font, bar.label(), { ...row, height: face.height })
        continue
      }
      // A setting reads left to right: what it is, then what it is set to.
      const top = Math.round(row.y + (face.height - font.height) / 2)
      font.draw(context, bar.label(), row.x + layout.setting.labelInset, top)
      font.draw(
        context,
        value,
        Math.round(row.x + row.width - layout.setting.valueInset - font.measure(value)),
        top
      )
    }

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
        cogbs = art.frames('cogb', 0, 5, 2)
        dials = art.frames('dial', 1, 12, 4)
        plates = art.frames('chose', 1, 6)
        titles = art.frames('title', 1, 6)
        lamps = art.frames('light', 1, 3)
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
      // Arriving IS the content change, so the plates turn over for it — and
      // the machine drives on underneath them at the same moment.
      const now = performance.now()
      driveOn.restart(now)
      plate = frameWalk(PLATE_BUILT_ON, 6)
      travel = null
      run(true)
    },
    selected: () => selection,
    // "Busy": the light is on its way, or the screen is still turning
    // over. Either refuses a press, so either is what a spec must wait out.
    flipping() {
      const now = performance.now()
      return (
        travelling(now) || plate.walking() || driveOn.moving()
      )
    },
    labels: () => bars.map((bar) => bar.label()),
    values: () => bars.map((bar) => bar.value?.() ?? null),
    layout
  }
}
