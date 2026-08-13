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
// WHERE each piece sits is the game's now, not the remake's, and so is WHEN
// each piece moves. The exe computes its screen coordinates in the frontend's
// draw code rather than storing them, and the MAIN MENU's arm has been read
// blit by blit (frontend/notes.md, in the disasm repo), so `LAYOUT` below
// carries the original's own numbers with the address each came from —
// nothing on this screen is placed by eye any more.
//
// Nor does anything on it move by itself. Three things animate and each is a
// widget the original asks for a new FRAME of: the plates and title turning
// over, the dial's needle walking to the lit row, and that row's lamp
// blinking. The cogs are still pictures. What a player remembers turning is
// the plates; what they remember hearing is `cog.wav`, one tooth a tick,
// while the machine drives in.
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

import { FRONTEND_METRICS, loadFont } from './font'
import type { Font } from './font'
import { loadSprites } from './sprites'
import type { Sprite, SpriteSet } from './sprites'
import { SILENT, loadBank } from '../audio/bank'
import type { Bank } from '../audio/bank'
import { controller } from '../input/controller'
import { MENU_BINDINGS } from '../input/actions'
import { EXE_FRAME_SECONDS } from '../../../lib/game/ballistics'
import { drive } from './drive'
import { LAMP_BLINK, widget } from './frames'

/** The frontend's own bank — 27 sounds, the menu's clicks among them. */
const FRONTEND_SOUNDS = 'FESounds/Fesounds.srl'
/**
 * The three sounds screen 1 makes, and the exe names each of them by its
 * INDEX in the bank above — 0, 1 and 5 — which is what turns into these
 * names. The volumes are its own too (0x420060's second argument, out of a
 * hundred). Moving the light makes no sound of its own: the click a player
 * hears is the needle landing.
 */
const NEEDLE = { name: 'INDU006', gain: 0.5 }
const FLIP = { name: 'CLICK5', gain: 1 }
const COG = { name: 'COG', gain: 0.2 }

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
  machine: { x: 25, y: 0, seam: 340, column: 2, cap: 50 },
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
   * The toothed racks, one down each edge, and they are READ now — the last
   * piece of this screen that was placed by eye.
   *
   * The exe blits `track` twice through `0x41AF70(x, y, sprite, rect, w, h)`,
   * the blitter with an explicit destination size, stretching the 64×480 art
   * to **638 tall**. Both land mostly OFF the screen and the flush clips them
   * (it trims against 639×479, which is also what settles that a blit's x/y
   * is its top left corner): about thirty pixels of the left rack show and
   * twenty-three of the right. The right one's WIDTH is negated, which the
   * flush reads as a MIRROR, so the two are handed.
   *
   * Neither rides the vertical entrance — their y is pushed as a literal —
   * and they have a horizontal one of their own instead (`drive.ts`).
   */
  track: { x: -34, y: -272, width: 64, height: 638 },
  rightTrack: { x: 681, y: -222 },
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
 * Where the WORDS go — a box each, and the text is centred across it with its
 * TOP at the box's own y.
 *
 * These are the exe's, out of `.data` rather than out of the draw code: a
 * screen's own string has four parallel per-screen tables (0x4C1548 x,
 * 0x4C15A8 y, 0x4C1608 w, 0x4C1668 h) and its ITEMS have one table of 16-byte
 * records at 0x4C1728, which every screen indexes from a running total of the
 * item counts at 0x4C16C8 — screen 1's four rows are records 1..4. The
 * numbers are in the frontend's 1024×820, squeezed here to pixels, and every
 * box is shifted by the frontend's own text origin (the screen's x offset
 * less 50/2 in the wide space, which is -25 at rest and is folded in).
 *
 * The rows do NOT carry the plates' stagger: all four boxes are the same x,
 * while rows 1 and 2 sit twelve pixels in. The words stay put and the plate
 * moves under them.
 */
export const MENU_TEXT = {
  /** exe (518, 227) 210+80 × 30 — one line of a 16-tall font in a 17-tall box. */
  title: { x: 298, y: 132, width: 181 },
  /** exe (528, 329/398/468/537) 205+80 wide. The pitch is 40, 41, 41 — the
   * plates' own is a flat 40 with two rows nudged, so the two only agree at
   * the ends. */
  rows: [
    { x: 305, y: 192, width: 178 },
    { x: 305, y: 232, width: 178 },
    { x: 305, y: 273, width: 178 },
    { x: 305, y: 314, width: 178 }
  ]
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
 * Leaving turns them the other way: the screen's own leave arm puts the
 * widget back on frame 0 and asks for 3, so the plates turn as it flies off
 * (exe 0x4254F5).
 */
const PLATE_LEAVES_ON = 0
const PLATE_TURNS_OUT_TO = 3
/**
 * How the WORDS ride the turn, per plate frame. The widget's builder writes
 * one of these two numbers out for the rows and the other for the title
 * (0x41f289 and 0x41f2ed), and the glyph drawer reads it as `k = 100 - |v|`:
 * a letter is CROPPED to `k` per cent of its height and dropped by what it
 * lost, so the line collapses onto its own baseline and vanishes at k = 0.
 * There is a second, smaller shift of `12v/100` on top (0x431879..0x4318a0).
 *
 * Walking 2 → 6 on the way in, the rows are gone for two frames and come back
 * through 30 and 80 per cent; the title only ever dips to 10. Leaving walks
 * 0 → 3, which is the same in reverse.
 */
const ROW_TURN = [0, 100, 100, -70, -20, 0, 0]
const TITLE_TURN = [0, 30, 90, -90, -40, 0, 0]
/** The frontend's own tick — one update, one walk of every widget, one draw. */
const TICK_MS = EXE_FRAME_SECONDS * 1000
/** A window that was hidden comes back to a SETTLED screen, not to a
 * fast-forward of everything it missed. */
const MOST_TICKS = 4

/**
 * What this screen wears. The original's loader arm decompresses more —
 * `cog0..5` and `cogb00..05` are six frames each — but its own builder only
 * ever asks for frame 0 of either, so the other ten are archive entries
 * nothing on this screen can show.
 */
const ART = [
  'pigbkpc1',
  'fullmenu',
  'track',
  'chose1', 'chose2', 'chose3', 'chose4', 'chose5', 'chose6',
  'title1', 'title2', 'title3', 'title4', 'title5', 'title6',
  'cog0',
  'cogb00',
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
  lit: Font
  plain: Font
  off: Font
}> | null = null

function loadShared(): NonNullable<typeof shared> {
  shared ??= (async () => {
    const [bank, sprites, text, litFont, plainFont, offFont] = await Promise.all([
      loadBank(FRONTEND_SOUNDS),
      loadSprites(ART),
      window.api.loadGameText('fetext'),
      // CHARS2 in its three shades and NOTHING else: the frontend builds one
      // text object out of the three and writes every screen with it, title
      // included (0x426AA6). The light one is the chosen bar, the plain one
      // the rest and the title, the dark one a bar with nothing behind it.
      loadFont('chars2L', { metrics: FRONTEND_METRICS }),
      loadFont('CHARS2', { metrics: FRONTEND_METRICS }),
      loadFont('chars2D', { metrics: FRONTEND_METRICS })
    ])
    if (!text.ok) throw new Error(text.error)
    strings = text.strings
    return { bank, art: sprites, lit: litFont, plain: plainFont, off: offFont }
  })()
  return shared
}

export function initBarScreen(config: {
  canvas: HTMLCanvasElement
  /** The plate at the top — the screen's own fetext string. */
  title: () => string
  bars: Bar[]
  /** Where this screen's WORDS go, when its own boxes have been read off the
   * exe — `MENU_TEXT` is screen 1's. Left out, a label is centred on its
   * plate and hidden while the plate turns, which is the remake's own. */
  text?: typeof MENU_TEXT
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
  const { canvas, bars, text } = config
  const layout = cloneLayout()
  canvas.width = SCREEN.width
  canvas.height = SCREEN.height

  let bank: Bank = SILENT
  let art: SpriteSet | null = null
  let lit: Font | null = null
  let plain: Font | null = null
  let off: Font | null = null
  let dials: Sprite[] = []
  let plates: Sprite[] = []
  let titles: Sprite[] = []
  let lamps: Sprite[] = []

  let selection = 0
  let visible = false
  /** The bar the mouse is over, taken up one bar a tick. */
  let hovered = -1
  /** The screen's own arrival and departure: one y displacement added to
   * everything the machine draws, and one the tracks carry. The backdrop is
   * NOT displaced — the exe blits it before the switch that applies this. */
  const driveOn = drive(config.entersFrom ?? 0)
  /** The plates and the title, which are ONE widget (7) and turn together. */
  const plate = widget(PLATE_BUILT_ON)
  /** The dial's needle (widget 4), which walks to the lit row a frame a tick. */
  const dial = widget(0)
  /** One per row (widgets 0..3): the frame IS which of `light1..3` its lamp
   * wears, and only the lit row's is given a script. */
  const rowLamps = bars.map(() => widget(0))
  /** What the vertical displacement is right now. Read once a tick and shared
   * with the mouse, so a click during the arrival hits the bar it looks at. */
  let arrivalOffset = 0
  /** Where the screen is going once it has finished clearing out. */
  let leaving: (() => void) | null = null

  /**
   * The SELECTION changed — exe 0x427C90, and the whole of what it does: aim
   * the needle at the new row, give that row's lamp the blink, and walk every
   * other lamp back down to `light1`.
   */
  const relight = (): void => {
    dial.goTo(needleFrame(selection))
    for (let i = 0; i < rowLamps.length; i++) {
      if (i === selection) rowLamps[i].play(LAMP_BLINK)
      else rowLamps[i].goTo(0)
    }
  }

  /**
   * Move one bar. It WRAPS and it is not gated on anything — the original's
   * up and down arms are two lines each (0x42a739, 0x42a8a9), with no travel
   * to wait out and no click of their own.
   */
  const step = (by: number): void => {
    const next = (selection + by + bars.length) % bars.length
    if (next === selection) return
    selection = next
    relight()
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

  /**
   * Choose the lit bar — and on a screen that DRIVES, that starts the exit
   * rather than swapping the view: the plates turn the other way, the machine
   * climbs back out of the top of the screen and the tracks walk out after
   * it, and only then does the next screen get its press (exe 0x425467).
   */
  const choose = (): void => {
    const bar = bars[selection]
    if (!bar.enabled() || !bar.choose) return
    if (driveOn.phase() !== 'here') return
    if (config.entersFrom === undefined) {
      navigate(bar.choose)
      return
    }
    leaving = bar.choose
    driveOn.leave()
    plate.set(PLATE_LEAVES_ON)
    plate.goTo(PLATE_TURNS_OUT_TO)
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

  /**
   * One line of words in one of the exe's own boxes: centred across it, its
   * TOP at the box's y (0x430ED0's alignment mode 2, which every frontend box
   * is set to), and CROPPED by however far the plate under it has turned —
   * see `ROW_TURN`. A crop and a drop, not a squash: the letters lose their
   * bottoms and fall by what they lost, so the line sinks into the plate.
   */
  const words = (
    context: CanvasRenderingContext2D,
    font: Font,
    text: string,
    box: { x: number; y: number; width: number },
    turn: number
  ): void => {
    const left = Math.round(box.x + (box.width - font.measure(text)) / 2)
    const top = box.y + arrivalOffset
    const kept = 100 - Math.abs(turn)
    if (kept <= 0) return
    const shift = Math.trunc((12 * turn) / 100)
    if (kept >= 100) {
      font.draw(context, text, left, top + shift)
      return
    }
    const lost = Math.round((font.height * (100 - kept)) / 100)
    context.save()
    context.beginPath()
    context.rect(left, top + lost, box.width, font.height - lost)
    context.clip()
    font.draw(context, text, left, top + lost + shift)
    context.restore()
  }

  /**
   * Which frame of the dial POINTS at a row.
   *
   * The needle following the lit bar is the exe's, not an invention to be
   * corrected: the screen's selection handler aims it with
   * `0x423E10(1, 4, 4*row - (4*row > 4 ? 1 : 0), 1, 1)`, which for the four
   * rows is frames 0, 4, 7 and 11 of twelve — and the widget walks there one
   * frame a tick, so it SWEEPS. Spreading the frames evenly over the rows
   * gives exactly those four back, and gives a sensible answer on a screen
   * with a different number of bars, whose own arm has not been read.
   */
  const needleFrame = (row: number): number => {
    const across = bars.length > 1 ? row / (bars.length - 1) : 0
    return Math.round(across * 11)
  }

  const draw = (): void => {
    const context = canvas.getContext('2d')
    if (!context || !art || !lit || !plain || !off) return
    // Everything the machine draws is displaced by the arrival — everything
    // except the backdrop, which the exe blits before the switch that applies
    // it, so the sky stays put while the machine drives on. And except the
    // TRACKS, whose y the draw arm pushes as a plain literal.
    arrivalOffset = driveOn.offset()
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
      const { seam, column, cap } = layout.machine
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
      // And a fourth blit nobody would guess at: the machine's own top `cap`
      // rows again, 48 pixels ABOVE it (exe 0x41c389). Two visible pixels once
      // the screen has landed, and what fills the gap over its head while it
      // is still driving in.
      context.drawImage(sprite.image, 0, 0, seam, cap, x, y - 48, seam, cap)
    }
    /**
     * A TRACK — the toothed rack down a screen edge, blitted through the
     * stretching blitter and mirrored where the exe negates its width. Most
     * of it is off the screen and the canvas clips it exactly as the flush
     * does.
     */
    const drawTrack = (sprite: Sprite, x: number, y: number, mirror: boolean): void => {
      const { width, height } = layout.track
      context.save()
      context.translate(x, 0)
      if (mirror) context.scale(-1, 1)
      context.drawImage(sprite.image, 0, y, width, height)
      context.restore()
    }
    /** One lamp out of the rack of four, chosen by ROW rather than by frame.
     * A screen with more rows than the rack has lamps repeats it — the exe
     * only ever bands four, because the arm this is read off draws four. */
    const drawLamp = (sprite: Sprite, row: number, x: number, y: number): void => {
      const band = layout.lamp.band
      const top = (row % 4) * layout.bars.step
      context.drawImage(sprite.image, 0, top, sprite.width, band, x, y, sprite.width, band)
    }

    const shift = driveOn.trackShift()
    context.drawImage(art.get('pigbkpc1').image, 0, 0)
    drawMachine(art.get('fullmenu'), layout.machine.x, layout.machine.y + arrivalOffset)
    drawTrack(art.get('track'), layout.track.x + shift, layout.track.y, false)
    drawTrack(art.get('track'), layout.rightTrack.x - shift, layout.rightTrack.y, true)
    blit(dials[dial.frame() % dials.length], layout.dial.x, layout.dial.y)
    // The cogs are STILL PICTURES. Both widgets are built on frame 0 and no
    // call site on this screen ever asks either for another — what a player
    // remembers turning is the plates, and what they remember hearing is the
    // machine's own cog ratcheting as the screen drives in.
    blit(art.get('cog0'), layout.cog.x, layout.cog.y)
    blit(art.get('cogb00'), layout.cogb.x, layout.cogb.y)

    // The plates and the title are one widget and turn together; which frame
    // they are on is walked in `advance` on the exe's own guards.
    const face = plates[plate.frame() % plates.length]
    const turning = plate.walking()

    const title = titles[plate.frame() % titles.length]
    drawPlate(title, layout.title.x, layout.title.y + arrivalOffset, layout.title.seam)
    // The whole frontend is written in CHARS2 — the screen builds ONE text
    // object out of CHARS2, CHARS2L and CHARS2D and hands it to every screen
    // but one (0x426AA6; screen 3 gets a CHARS3 of its own). Which of the
    // three shades a line wears is decided by the MEAN of the colour it is
    // asked for: under 50 the dark one, over 100 the light one, otherwise
    // plain (0x4317ed..0x431823). The title's own colour is (100, 100, 60),
    // so the title is always the plain shade.
    const frame = plate.frame() % TITLE_TURN.length
    if (text) words(context, plain, config.title(), text.title, TITLE_TURN[frame])
    else if (!turning) {
      centred(context, plain, config.title(), {
        x: layout.title.x,
        y: layout.title.y + arrivalOffset,
        width: title.width + layout.bars.stretch,
        height: title.height
      })
    }

    for (let i = 0; i < bars.length; i++) {
      const row = rowBox(i, face)
      drawPlate(face, row.x, row.y)

      // One lamp per row, to the right of its plate. WHICH of `light1..3` it
      // wears is its widget's frame, and only the lit row's widget is given a
      // script — everything else is walked back down to the dimmest.
      if (lamps.length > 0) {
        const lamp = lamps[Math.min(rowLamps[i].frame(), lamps.length - 1)]
        drawLamp(lamp, i, layout.lamp.x, layout.lamp.y + i * layout.bars.step + arrivalOffset)
      }

      const bar = bars[i]
      // The lit row is asked for in (120, 120, 75) against the others'
      // (80, 80, 45), and a row that leads nowhere has its colour divided by
      // three — which is what puts the three shades on the three states
      // (0x428DBD). The words are drawn on the row's own box, which does NOT
      // carry the plate's stagger.
      const font = !bar.enabled() ? off : i === selection ? lit : plain
      const value = bar.value?.() ?? null
      if (text && value === null) {
        words(context, font, bar.label(), text.rows[i] ?? text.rows[0], ROW_TURN[frame])
        continue
      }
      if (turning) continue
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

  /**
   * ONE frontend tick: the screen's own update, then the pass that walks
   * every widget one step and rebuilds what changed. That order is the exe's
   * (0x423E70 out of the state machine, 0x41FEC0 in the per-frame function),
   * and so is everything in it.
   */
  const advance = (): void => {
    driveOn.tick()
    if (driveOn.rumbled()) bank.play(COG.name, { gain: COG.gain })

    // The flip: once the screen has nearly landed and the widget is not
    // already walking, the plates and the title are asked for frame 6, which
    // is six of six and wraps back to the first (exe 0x423f57). If the screen
    // has fully arrived by then it is heard as well.
    if (
      driveOn.phase() !== 'leaving' &&
      driveOn.phase() !== 'gone' &&
      driveOn.raw() > FLIP_AT &&
      !plate.walking() &&
      plate.frame() !== PLATE_TURNS_TO
    ) {
      plate.goTo(PLATE_TURNS_TO)
      if (driveOn.raw() === 0) bank.play(FLIP.name, { gain: FLIP.gain })
    }

    plate.tick()
    // The needle clicks when it LANDS, not once per row it passes: the dial's
    // builder plays it on the step that reaches the frame it was aimed at.
    if (dial.tick() && !dial.walking()) bank.play(NEEDLE.name, { gain: NEEDLE.gain })
    for (const lamp of rowLamps) lamp.tick()

    // The mouse is the remake's own convenience, and it moves the light the
    // only way the machine can: a bar at a time.
    if (hovered >= 0) {
      if (hovered === selection) hovered = -1
      else step(hovered > selection ? 1 : -1)
    }

    if (driveOn.phase() === 'gone' && leaving) {
      const go = leaving
      leaving = null
      navigate(go)
    }
  }

  // The machine only turns while it is on screen: an app parked behind a
  // battle — or behind another app, during a test run — costs nothing.
  let frame = 0
  let ticked = 0
  const paint = (now: number): void => {
    frame = requestAnimationFrame(paint)
    let due = Math.floor((now - ticked) / TICK_MS)
    if (due <= 0) return
    ticked += due * TICK_MS
    if (due > MOST_TICKS) due = MOST_TICKS
    for (let i = 0; i < due; i++) advance()
    draw()
  }
  const run = (on: boolean): void => {
    if (on && loaded && frame === 0) {
      ticked = performance.now()
      frame = requestAnimationFrame(paint)
    }
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
        lit = pieces.lit
        plain = pieces.plain
        off = pieces.off
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
      loaded = true
      relight()
      run(visible)
    },
    leave() {
      visible = false
      run(false)
    },
    enter() {
      visible = true
      // Entering CLEARS every widget's frame and builds them again: the
      // plates and title on frame 2 — arriving IS the content change, so they
      // turn over for it — the dial on 0 and the lamps dark, which is why the
      // needle sweeps up to the lit row from the top rather than being there
      // already.
      driveOn.restart()
      plate.set(PLATE_BUILT_ON)
      dial.set(0)
      for (const lamp of rowLamps) lamp.set(0)
      leaving = null
      relight()
      run(true)
    },
    selected: () => selection,
    // "Busy": the plates are turning over, or the screen is not standing
    // still. A press during either is not refused — the original refuses
    // nothing — but a spec measuring the machine wants it settled first.
    flipping: () => plate.walking() || driveOn.phase() !== 'here',
    labels: () => bars.map((bar) => bar.label()),
    values: () => bars.map((bar) => bar.value?.() ?? null),
    layout
  }
}
