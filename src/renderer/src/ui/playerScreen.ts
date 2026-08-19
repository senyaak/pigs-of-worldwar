// The PLAYER screen — record 12, kind 5: your eight pigs, and what to do next.
//
// The exe draws the squad TWICE over the same grid (0x41D285): a first pass of
// portraits and a second of badges and stripes, both gated on the screen having
// arrived. Slots are read at `team + 64*slot + 0x70`, with the class in the
// byte after it.
//
// **The grid is TWO COLUMNS of five and three, and it stands UP.** The arm runs
// `ebx` 0..1 and `ebp` 0..4 with the slot `ebx*5 + ebp` and skips
// `ebx == 1 && ebp > 2` — and which counter drives which axis was read wrong
// the first time round, so this screen was built five across. It is the outer
// one that steps x, by **462** a column (0x41D3F3 on, `77·ebx` trebled and
// doubled), and the inner one that steps y by `2·37` a row. Five DOWN the left
// edge, three down the right, and everything else on the screen lives between
// them.
//
// Every number below is the arm's own now, through the frontend's scalers
// (`nameScreen.ts` carries how that was settled): the entrance rests at 0, so
// `scaleX(0) - 10` is the x every piece is measured from and the two little
// per-row nudges the arm carries are folded into `ROW_Y`. The BADGES step a
// different column pitch from the portraits — 417 — and are handed, +82 on the
// left column and −69 on the right, so the two columns face inward.
//
// **The lit portrait is the only thing that moves.** Every other pig is
// blitted at 0x1000, unity; the chosen one's WIDTH comes out of `fcos` on
// `[0x512E54]`, an angle that advances 100 of 4096 a frame, and the blit's x
// re-centres it on its own source — the height is pushed unscaled. So it
// breathes sideways.
//
// What a pig WEARS is one byte. `lib/game/ranks.ts` carries the tables: the
// class picks the career's badge (six of them, 52×24) and the step in that
// career picks the stripes, with step 0 wearing none.
//
// **The FURNITURE is the arm's own too, now that its TAIL is read** (0x41D830
// to the `ret` at 0x41DB9C): a panel a column, a dial a column, the team's
// plate and `pigpro`, every one of them at a number out of the exe rather than
// off the eye. The tail also settles what the art IS. `sqpics00..10` are not
// panels at all — they are widget 0's frames 0..5, `sqpic`'s own ARRIVAL, which
// is why nobody recognised them at rest. `parrow1..3` is dead: nothing outside
// the loader and the unload arm ever reads it. `sqarmy` is seeded and never
// blitted. `backgr~1` is blitted by no draw arm — it stays here on play's word
// alone, as the portrait's backing.
//
// Still NOT built: the medals, and `pcflag`'s 10-px shift on a pig wearing a
// pip (`sub edi,0Ah` leaks out of the pip block — ours stands still).

import { loadFrontend, SCREEN, feText } from './barScreen'
import { byId } from './dom'
import type { Font } from './font'
import { drive } from './drive'
import { controller } from '../input/controller'
import { MENU_BINDINGS } from '../input/actions'
import { loadDebriefSprites, loadSprites } from './sprites'
import type { Sprite, SpriteSet } from './sprites'
import { SILENT } from '../audio/bank'
import type { Bank } from '../audio/bank'
import { initPigMenu } from './pigMenu'
import type { PromoteResult } from './pigMenu'
import { initCareerPath } from './careerPath'
import { EXE_FRAME_SECONDS } from '../../../lib/game/ballistics'
import { SQUAD_SIZE } from '../../../lib/game/roster'
import type { Pig } from '../../../lib/game/roster'
import {
  PROMOTE_TEXT,
  careerOf,
  promotionsFrom,
  rankText,
  stepOf
} from '../../../lib/game/ranks'

/** A piece of one of the board's lines: words, or one of the markup icons.
 * `after` overrides the gap the board leaves before whatever comes next.
 * `sprite` is art from OUTSIDE the frontend set — the deaths count borrows
 * the debrief's tombstone — drawn scaled to `height`. */
interface BoardPiece {
  text?: string
  icon?: string
  sprite?: Sprite
  height?: number
  after?: number
}

/** How tall the markup icons are — what a borrowed sprite is scaled to. */
const ICON_TALL = 22

/** The debrief's tombstone (`Language/Tims/debrief`), standing in as the
 * deaths count's icon: the frontend's own thirteen have no such picture,
 * because the original never counts deaths. */
const RIP_ART = 'r_i_p'

/** The six career badges, in the order the exe's own table counts them —
 * `careerOf` returns that order (0x4D29C0's first byte). */
const BADGE: Record<string, string> = {
  heavy: 'pcHweap',
  espionage: 'snipr',
  engineer: 'sappr',
  medic: 'pcmedic',
  commando: 'cmndo',
  hero: 'pcmedal'
}

/** Class 0, which every pig starts as and which wears no class picture at all
 * (`[play]`) — the promotion tree's own root, `lib/game/ranks.ts`. */
const GRUNT = 0

/** Step 1 and step 2 of a career. Step 0 draws none, which is the exe's own
 * `jbe` on the table's second byte. **Which pair of the two the original uses
 * is `[CHECK — remake]`** — `pip1/2` (36×24) and `strp1/2` (52×24) are both
 * pairs and the slot array they come out of is not named. */
const STRIPES = ['strp1', 'strp2']

const ART = [
  'pigbkpc1',
  'pcHweap', 'snipr', 'sappr', 'pcmedic', 'cmndo', 'pcmedal',
  'strp1', 'strp2',
  'bgdark',
  // The PIG MENU's plaque and its medallion's three shades (ui/pigMenu.ts) —
  // kind 6 loads nothing of its own, the family already carries it.
  'swap', 'swap01', 'swap02', 'swap03',
  // The PROMOTION FLAG — on every pig the team can afford to promote.
  'pcflag',
  // The three markup ICONS the board writes with, 22 tall like every icon in
  // that set: `vp` is the TOKEN, `battle` how many battles a pig has fought,
  // `kills` how many it has killed (`frontend/notes.md` — the archive's name
  // is honest, whatever an earlier note said).
  'vp', 'battle', 'kills',
  // The option plate behind START MISSION and the lamp that flanks it.
  'sqoptsf', 'lit1',
  // The FURNITURE, every piece of it placed by the arm's tail: `sqpic` is the
  // panel a column stands on, cut short for the right one; `sqname01..06` one
  // widget carrying the TEAM's name across the top; `sqdial01..06` the pig
  // selector, one a column; `pigpro` the picture in front at the bottom.
  'sqpic', 'sqname01', 'sqdial01', 'pigpro', 'backgr~1',
  ...Array.from({ length: 9 }, (_, i) => `face${i + 1}a`)
]

/** `Fesounds.srl` entry 4 — the same click every other frontend screen makes. */
const CLICK = { name: 'CLICK1', gain: 0.6 }

/** Record 12's first item, START MISSION — the one action this screen keeps.
 * The original's second, SAVE TEAM (fetext 51), went with the SAVE ARMY screen:
 * the campaign autosaves, so there is nothing to save by hand (`[play]`,
 * docs/todo.md). The items after them are the pigs, named at runtime, which is
 * why their fetext ids run into the next screen's words (`frontend/notes.md`). */
const START_TEXT = 50

const ENTERS_FROM = -700

/** How many pigs each column carries: five down the left, three down the
 * right. The arm's own guard is `ebx == 1 && ebp > 2`. */
const COLUMN = [5, 3]

/**
 * Where each piece lands, in FOUR groups, because that is how the screen is
 * actually moved: `rows` is the y every slot shares, `columns` is the x each
 * column decides, `drop` is how far below its row a piece hangs, and the rest
 * belongs to the screen rather than to any column. So a y is set once —
 * `pow.screen.layout.player.drop.badge = 40` moves both columns' badges,
 * `…rows[2] += 3` moves the third row of both — and an x is set on the column
 * it belongs to: `…columns[1].panel.x -= 4`. Then `pow.screen.print()`.
 *
 * **Only the name's drop is guessed now.** Everything else here is read —
 * the pigs off the two loops, the furniture off the tail at 0x41D830, which
 * had never been disassembled and is where every piece below came from.
 */
const LAYOUT = {
  /**
   * The five rows, read off the arm rather than stepped: the y is
   * `flag + 2·(37·row + nudge) + 72` and the two flags are per-row, which is
   * why the pitch is 74, 74, 73, 72 rather than a flat number (0x41D2FF,
   * 0x41D349). Both columns step the same five; the right one stops at three.
   */
  rows: [75, 149, 223, 296, 368],
  /**
   * The SELECTOR's own five rows, which are NOT the portraits' plus a
   * constant: its counter steps `37n/5 + 18` in fifths of a row and rests at
   * `74n + 64` (0x41ED4D), a flat pitch against the portraits' 74, 74, 73, 72.
   * So the dial sits 11 px above the first row and 8 above the last.
   */
  selectorRows: [64, 138, 212, 286, 360],
  /**
   * One entry a column, carrying every x that column decides.
   *
   * `face` is the portrait: `scaleX(0) − 10 + 462·column + 67`, and a face is
   * 70×60. The badge and the pips step **417** a column and are handed
   * (+82 / −69), so both columns' badges face the middle of the screen — which
   * is why the two are not mirror images of each other.
   *
   * `panel` and `selector` are `mirror`ed on the right column — a negated
   * width, the frontend's own way of drawing a right-hand copy — so their `x`
   * is that copy's RIGHT edge. Both are the tail's own numbers: the panels at
   * 0x41D8BB and 0x41D930, the dials at 0x41ED3D and 0x41EDB4, and the two
   * panels come out exactly symmetric about x 320.
   */
  columns: [
    {
      face: 57,
      badge: 161,
      stripes: 181,
      selector: { x: -32, mirror: false },
      panel: { x: -32, y: -12, width: 298, height: 480, mirror: false }
    },
    {
      face: 519,
      badge: 427,
      stripes: 447,
      selector: { x: 672, mirror: true },
      panel: { x: 672, y: -12, width: 298, height: 301, mirror: true }
    }
  ],
  /**
   * **The right panel is the left one CUT SHORT and CAPPED**, which is how the
   * original gets three slots out of a panel built for five. The blit's source
   * rect loses 179 rows (`480 − C[6]`, 0x41D8D8) — exactly the two rows the
   * right column does not have — and then the panel's own top-left corner is
   * pasted on as the bottom end, flipped in BOTH axes (0x41D9EC, both `neg`).
   * `x`/`y` are that flipped copy's right and bottom edges.
   */
  cap: { x: 672, y: 369, width: 120, height: 100 },
  /**
   * How far below its row each piece hangs.
   *
   * The badge's is the arm's 44 (0x74 against the portrait's 0x48) less the
   * four play took off it to close the gap over the plate — `[play]`, and the
   * trapezoid follows it because it is that plate's own leg. The NAME sits
   * ABOVE the badge and inside the widget rather than under the portrait
   * (`[play]`), which is `[CHECK — remake]` in the number only: the exe writes
   * no words for a pig at all, record 12 having just the two actions.
   */
  drop: { badge: 40, stripes: 40, name: 16 },
  /** The portrait: `width` is what its name is centred across, `inset` how far
   * its backing — the three `backgr~1` entries (`[play]`) — reaches past the
   * face on every side. */
  portrait: { width: 70, inset: 0 },
  /** The TEAM's own plate, `sqname01` 400×96, hung off the top edge:
   * `2·(scaleY(0) − 7)` (0x41DA12). */
  team: { x: 120, y: -14 },
  /**
   * The PROMOTION FLAG, `pcflag` 24×34, on every pig the team can afford to
   * promote (0x41D70E): a rookie's rests at x 203 left and 406 right —
   * `[0x512C70]` walks 0→23 so it flies 23 px toward the centre as it
   * arrives — and its y is `drop` under the pig's row. The exe shifts a
   * pip-wearer's 10 px inboard; ours stands still (`[CHECK — remake]`).
   */
  flag: { x: [203, 406], drop: 49, fly: 23 },
  /**
   * `pigpro` 200×191 at the bottom centre, the arm's LAST blit (0x41DB85) so
   * it stands in front of everything — and it is **the BOARD**: a black face
   * the screen writes the team's and the lit pig's numbers across (`[play]`).
   * Five lines, centred on the board: the team's tokens, the pig's name, its
   * class, what its next promotion costs, and its two counts side by side.
   *
   * The board's own x/y are the exe's; **every line's y is
   * `[CHECK — remake]`** — nothing writes this text in any arm that has been
   * read, so they are spaced by eye and meant to be nudged.
   */
  pigpro: { x: 232, y: 304 },
  board: {
    centre: 332,
    lines: { tokens: 322, name: 348, rank: 372, promote: 400, counts: 428 },
    /** Between a piece of a line and the next, and how far the 22-tall icons
     * ride above the letters' own top. */
    gap: 6,
    lift: 2,
    /** …and between the two counts on the last line. */
    spread: 24
  },
  /**
   * START MISSION is the tail's OPTION ROW, not the item box this file used
   * to place it by: the boxes fold to (350, 385) side by side with SAVE
   * TEAM's, and both the tail and the original's own screen stack plates at a
   * fixed x 428 — the same suspect fold the name screen's +80/−25 turned out
   * to be. `rows[0]` is the plate's top, `2·(H[n] − 6 + 33) − 91` at rest
   * (0x41DA4D), and the lamps sit 16 lower (0x41DABB). SAVE TEAM itself is
   * gone with the SAVE ARMY screen (`[play]`, autosave).
   */
  options: {
    x: 428,
    width: 200,
    rows: [337],
    /** How far into its plate a row's words sit — `[CHECK — remake]`. */
    text: 38,
    lamp: { x: [429, 601], drop: 16 }
  },
  /** Record 12's title box, raw (299, 77) 400 wide (0x4C1548 + 4·12) — and
   * SUSPECT for the same folding reason as the actions were. */
  text: { title: { x: 161, y: 45, width: 300 } }
}

/** The lit portrait's swell: `fcos` on an angle that steps 100 of 4096 a frame
 * (0x41D365). The two constants beside it are not decoded, so the DEPTH of the
 * swell is `[CHECK — remake]`; the rate is the exe's. */
const PULSE_STEP = (100 / 4096) * Math.PI * 2
const PULSE_DEPTH = 0.12

const TICK_MS = EXE_FRAME_SECONDS * 1000
const MOST_TICKS = 4

export type PlayerLayout = typeof LAYOUT

const cloneLayout = (): PlayerLayout => ({
  rows: [...LAYOUT.rows],
  selectorRows: [...LAYOUT.selectorRows],
  columns: LAYOUT.columns.map((column) => ({
    ...column,
    selector: { ...column.selector },
    panel: { ...column.panel }
  })),
  cap: { ...LAYOUT.cap },
  drop: { ...LAYOUT.drop },
  portrait: { ...LAYOUT.portrait },
  team: { ...LAYOUT.team },
  flag: { ...LAYOUT.flag, x: [...LAYOUT.flag.x] },
  pigpro: { ...LAYOUT.pigpro },
  board: { ...LAYOUT.board, lines: { ...LAYOUT.board.lines } },
  options: {
    ...LAYOUT.options,
    rows: [...LAYOUT.options.rows],
    lamp: { ...LAYOUT.options.lamp, x: [...LAYOUT.options.lamp.x] }
  },
  text: { title: { ...LAYOUT.text.title } }
})

/** An overlay's e2e window — the pig menu's or the career path's. */
export interface OverlayView {
  selected(): number
  labels(): string[]
  values(): (string | null)[]
  flipping(): boolean
  open(): boolean
}

export interface PlayerScreen {
  load(): Promise<void>
  leave(): void
  enter(): void
  /** The squad to show, the team's name and its unspent tokens — the board
   * writes the last of those. Called before the screen is entered, and again
   * whenever an edit moved the save under the screen. */
  show(squad: Pig[], teamName: string, tokens: number): void
  /** Which of the nine places is lit: 0..7 a pig, 8 START MISSION. */
  selected(): number
  labels(): string[]
  values(): (string | null)[]
  flipping(): boolean
  /** The PIG MENU riding over the squad (ui/pigMenu.ts). */
  menu: OverlayView
  /** …and CAREER PATH, the same way (ui/careerPath.ts). */
  career: OverlayView
  layout: PlayerLayout
}

/** The one action lives past the eight pigs, the way the name entry's keys
 * live past its letters. */
export const START = SQUAD_SIZE
const PLACES = SQUAD_SIZE + 1

export function initPlayerScreen(handlers: {
  onStart: () => void
  onBack: () => void
  /** PROMOTE on the pig menu — the composition root holds the save and
   * answers what happened; the menu picks the sound and whether to stay. */
  promote: (slot: number) => PromoteResult
  /** The armed swap's second pick — both slots, in the order they were
   * chosen. The root writes and calls `show` again. */
  swap: (a: number, b: number) => void
  /** RENAME chose a pig: the name entry opens on it. */
  rename: (slot: number) => void
  /** A CAREER PATH row — true is written and paid. */
  careerPick: (slot: number, to: number) => boolean
}): PlayerScreen {
  const canvas = byId<HTMLCanvasElement>('player-screen')
  const layout = cloneLayout()
  canvas.width = SCREEN.width
  canvas.height = SCREEN.height

  let bank: Bank = SILENT
  let art: SpriteSet | null = null
  /** The deaths count's tombstone, or null while the debrief art is missing —
   * which costs the icon, never the screen. */
  let rip: Sprite | null = null
  let lit: Font | null = null
  let plain: Font | null = null
  let loaded = false
  let visible = false
  let offset = 0
  let squad: Pig[] = []
  let teamName = ''
  let tokens = 0
  let selection = 0
  /** Which pig the BOARD is about. The board never goes blank, so choosing an
   * action leaves it on the pig that was last lit. */
  let boardPig = 0
  let pulse = 0
  /** **Each column's selector is its own and only travels UP and DOWN**
   * (`[play]`), so a column remembers which of its rows was last lit and keeps
   * its dial there while the other column, or an action, is chosen. */
  const columnRow = [0, 0]

  const driveOn = drive(ENTERS_FROM)
  let leaving: (() => void) | null = null

  /** SWAP POSITION's armed pig, or −1 — the exe's `[0x4C0C58]`, and the one
   * portrait that BREATHES in the original (the selection swell below is the
   * remake's own, kept `[deliberate]`). */
  let armed = -1
  /** The squad DIMS behind an overlay — `[+0x20]` 120 → 80 at 4 a tick — so
   * this counts 0..DIM_TICKS and the shade is drawn from it. */
  let dim = 0
  const DIM_TICKS = 10
  /** …and 80/120 of lit is a third of the way to black. */
  const DIM_SHADE = 1 / 3
  /** The floating spend — the exe's 0x4196E0 popup, pinned at (323, 189).
   * How long it stands is `[CHECK — remake]`. */
  let spent: { cost: number; ticks: number } | null = null
  const SPENT = { x: 323, y: 189, ticks: 24 }
  /** The promotion flag's arrival — `[0x512C70]`, walked 0 → 23. */
  let flagFly = 0

  const menu = initPigMenu({
    promote: (slot) => handlers.promote(slot),
    onSwap: (slot) => {
      armed = slot
    },
    onRename: (slot) => handlers.rename(slot),
    onSpent: (cost) => {
      spent = { cost, ticks: SPENT.ticks }
    },
    onCareer: (slot) => career.open(slot)
  })
  const career = initCareerPath({
    pick: (slot, to) => handlers.careerPick(slot, to),
    onSpent: (cost) => {
      spent = { cost, ticks: SPENT.ticks }
    },
    onClosed: () => {}
  })
  /** Whether either overlay holds the screen — input goes to it and the
   * squad dims under it. */
  const overlaid = (): boolean => menu.state() !== 'closed' || career.state() === 'open'

  const step = (by: number): void => {
    const next = (selection + by + PLACES) % PLACES
    if (next === selection) return
    selection = next
    if (selection < SQUAD_SIZE) {
      const column = selection < COLUMN[0] ? 0 : 1
      columnRow[column] = column === 0 ? selection : selection - COLUMN[0]
      boardPig = selection
    }
    bank.play(CLICK.name, { gain: CLICK.gain })
  }

  /** Up and down walk the list in order — which, the grid standing up, is down
   * one column and on into the other. Left and right cross between the two
   * columns at the same row, and between the two actions. */
  const vertical = (by: number): void => step(by)
  const sideways = (by: number): void => {
    if (selection >= SQUAD_SIZE) {
      step(by)
      return
    }
    const column = selection < COLUMN[0] ? 0 : 1
    const row = column === 0 ? selection : selection - COLUMN[0]
    const other = column === 0 ? 1 : 0
    const landing = Math.min(row, COLUMN[other] - 1)
    step((other === 0 ? landing : COLUMN[0] + landing) - selection)
  }

  /** `Fesounds.srl` 12, `Indu037` at 100 — every pig click (0x42BC83), the
   * one that opens the menu and the one that completes a swap alike. */
  const PIG_CLICK = { name: 'INDU037', gain: 1.0 }

  const choose = (): void => {
    if (driveOn.phase() !== 'here') return
    if (selection < SQUAD_SIZE) {
      if (!squad[selection]) return
      bank.play(PIG_CLICK.name, { gain: PIG_CLICK.gain })
      if (armed >= 0) {
        // The second pick of a SWAP: the whole pigs change places and the
        // squad disarms — the root writes and shows the moved roster.
        handlers.swap(armed, selection)
        armed = -1
        return
      }
      menu.open(selection, squad[selection].rank)
      return
    }
    if (selection !== START) return
    leaving = handlers.onStart
    driveOn.leave()
  }

  const navigate = (go: () => void): void => queueMicrotask(go)

  controller.onAction((action) => {
    if (!visible) return
    // An overlay holds the screen while it is up.
    if (menu.state() !== 'closed') {
      menu.handle(action)
      return
    }
    if (career.state() === 'open') {
      career.handle(action)
      return
    }
    if (action === 'menuUp') vertical(-1)
    else if (action === 'menuDown') vertical(1)
    else if (action === 'menuLeft') sideways(-1)
    else if (action === 'menuRight') sideways(1)
    else if (action === 'menuSelect') choose()
    else if (action === 'menuBack') {
      // BACK with a swap armed only disarms (0x42D7ED) — no leaving, no sound.
      if (armed >= 0) {
        armed = -1
        return
      }
      navigate(handlers.onBack)
    }
  })
  controller.bindKeyboard(() => visible, MENU_BINDINGS)

  /** Which column and row slot `n` stands in — five down, then three. */
  const place = (slot: number): { column: number; x: number; y: number } => {
    const column = slot < COLUMN[0] ? 0 : 1
    const row = column === 0 ? slot : slot - COLUMN[0]
    return { column, x: layout.columns[column].face, y: layout.rows[row] }
  }

  const centred = (font: Font, text: string, x: number, width: number): number =>
    Math.round(x + (width - font.measure(text)) / 2)

  const draw = (): void => {
    const context = canvas.getContext('2d')
    if (!context || !art || !lit || !plain) return
    const sprites = art
    const light = lit
    const dark = plain
    offset = driveOn.offset()
    context.drawImage(sprites.get('pigbkpc1').image, 0, 0)

    // The FURNITURE goes down first, everything else stands on it. Positions
    // are `[CHECK — remake]` and meant to be nudged; what each piece is, is not.
    const put = (name: string, x: number, y: number): void =>
      context.drawImage(sprites.get(name).image, x, y + offset)
    /** A piece of `sqpic`, flipped in either axis — which is how the original
     * draws every right-hand copy on this screen, by negating the blit's own
     * width (and, for the cap, its height too). `x`/`y` are the drawn copy's
     * right and bottom edges wherever an axis is flipped. */
    const cut = (
      x: number, y: number, width: number, height: number,
      flipX: boolean, flipY: boolean
    ): void => {
      const image = sprites.get('sqpic').image
      context.save()
      context.scale(flipX ? -1 : 1, flipY ? -1 : 1)
      context.drawImage(
        image,
        0, 0, width, height,
        flipX ? -x : x,
        (flipY ? -(y + offset) : y + offset),
        width, height
      )
      context.restore()
    }

    // One panel a column — and the RIGHT one is the left one cut short and
    // capped, which is how three slots come out of a panel built for five.
    for (const column of layout.columns) {
      const panel = column.panel
      cut(panel.x, panel.y, panel.width, panel.height, panel.mirror, false)
      if (!panel.mirror) continue
      cut(layout.cap.x, layout.cap.y, layout.cap.width, layout.cap.height, true, true)
    }
    put('sqname01', layout.team.x, layout.team.y)

    for (let slot = 0; slot < SQUAD_SIZE; slot++) {
      const pig = squad[slot]
      if (!pig) continue
      const at = place(slot)
      const y = at.y + offset

      // The PORTRAIT, on its own backing — `backgr~1`, which is what the enter
      // arm builds into the two slots the arm blits beside every face.
      const face = sprites.get(`face${(pig.identity % 9) + 1}a`)
      const backing = sprites.get('backgr~1')
      const inset = layout.portrait.inset
      context.drawImage(
        backing.image,
        at.x - inset, y - inset,
        face.width + inset * 2, face.height + inset * 2
      )

      // The breathing is the arm's — WIDTH scaled, the blit re-centred on its
      // source, the height pushed as it is. In the exe the ONLY pig that
      // breathes is the SWAP-ARMED one (`[0x4C0C58]`, frontend/notes.md);
      // breathing the lit one too is the remake's own cursor, `[deliberate]`.
      const swell =
        slot === selection || slot === armed ? 1 + PULSE_DEPTH * Math.cos(pulse) : 1
      const width = face.width * swell
      context.drawImage(
        face.image,
        Math.round(at.x + (face.width - width) / 2),
        Math.round(y),
        Math.round(width),
        face.height
      )

      // The TRAPEZOID under the name plate, which is what the class badge
      // stands in. **It is `bgdark` for every slot** (`[play]`, against the
      // shipped screen — the right-hand three wear the dark one too), and the
      // arm agrees: the blit at 0x41D6BC has one sprite, `[0x5119E8]`, and
      // that slot holds `bgdark`. The fielded-five/reserve-three reading this
      // file used to draw `bglight` on was wrong.
      const column = layout.columns[at.column]
      const leg = sprites.get('bgdark')
      const badge = sprites.get(BADGE[careerOf(pig.rank)] ?? 'pcHweap')
      const legX = column.badge - Math.round((leg.width - badge.width) / 2)
      context.drawImage(leg.image, legX, y + layout.drop.badge)

      // The CAREER's badge, and the stripes of its step — 0 wears none. Both
      // sit inboard of the portrait, on the column's own hand.
      //
      // **A GRUNT wears NO badge** (`[play]`): class 0 shares group 0 with the
      // heavy career, so the table alone would give it that career's picture,
      // and the original shows a pig with no class at all until it is promoted.
      // The trapezoid stays — it is the plate's own leg, not the badge's.
      if (pig.rank !== GRUNT) {
        context.drawImage(badge.image, column.badge, y + layout.drop.badge)
      }
      const step_ = stepOf(pig.rank)
      if (step_ > 0) {
        const stripes = sprites.get(STRIPES[step_ - 1] ?? STRIPES[0])
        context.drawImage(stripes.image, column.stripes, y + layout.drop.stripes)
      }

      // The PROMOTION FLAG — this pig can be promoted RIGHT NOW (0x41D70E).
      // The exe's four gates fold to two here: the screen has arrived, and a
      // way out of the class is within the team's tokens. It flies its last
      // 23 px toward the centre as it lands.
      if (
        driveOn.phase() === 'here' &&
        promotionsFrom(pig.rank).some((way) => way.cost <= tokens)
      ) {
        const flag = sprites.get('pcflag')
        const short = layout.flag.fly - flagFly
        const x = at.column === 0 ? layout.flag.x[0] - short : layout.flag.x[1] + short
        context.drawImage(flag.image, x, at.y + layout.flag.drop + offset)
      }

      // Its NAME, ABOVE the badge and centred on the plate's own leg rather
      // than on the portrait (`[play]`) — it belongs inside the widget, not
      // under the face. The RANK is the badge and the pips beside it; the arm
      // writes no words for a pig at all.
      const font = slot === selection ? light : dark
      font.draw(
        context,
        pig.name,
        centred(font, pig.name, legX, leg.width),
        y + layout.drop.name
      )
    }

    // A SELECTOR a column, each on its column's own last-lit row: it rides up
    // and down its own column and never crosses to the other. Both are always
    // drawn, and the right one is mirrored to face its own column.
    layout.columns.forEach((column, index) => {
      const row = Math.min(columnRow[index], COLUMN[index] - 1)
      const dial = sprites.get('sqdial01')
      const y = layout.selectorRows[row] + offset
      if (!column.selector.mirror) {
        context.drawImage(dial.image, column.selector.x, y)
        return
      }
      context.save()
      context.scale(-1, 1)
      context.drawImage(dial.image, -column.selector.x, y)
      context.restore()
    })

    // START MISSION on the tail's own option row, on its plate with its two
    // lamps. It is the screen's only action now — SAVE TEAM went with the
    // autosave (`[play]`).
    const options = layout.options
    put('sqoptsf', options.x, options.rows[0])
    options.lamp.x.forEach((x) => put('lit1', x, options.rows[0] + options.lamp.drop))
    const startLabel = feText(START_TEXT)
    const startFont = selection === START ? light : dark
    startFont.draw(
      context,
      startLabel,
      centred(startFont, startLabel, options.x, options.width),
      options.rows[0] + options.text + offset
    )

    // The team's own name across the top, which is what the player just typed.
    if (teamName) {
      light.draw(
        context,
        teamName,
        centred(light, teamName, layout.text.title.x, layout.text.title.width),
        layout.text.title.y + offset
      )
    }

    // `pigpro` LAST, which is where the arm puts it — in front of everything —
    // and it is the BOARD: five lines about the team and the lit pig, written
    // across its black face (`[play]`).
    put('pigpro', layout.pigpro.x, layout.pigpro.y)
    writeBoard(context, sprites, light)

    // An OVERLAY dims the squad to two thirds under it — the exe ramps the
    // record's own brightness 120 → 80 — and stands on top, bright.
    if (dim > 0) {
      context.fillStyle = `rgba(0, 0, 0, ${((dim / DIM_TICKS) * DIM_SHADE).toFixed(3)})`
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    menu.draw(context, sprites, dark)
    career.draw(context, sprites, light)

    // The floating spend — the number of points a promotion just took,
    // pinned where the exe pins its popup.
    if (spent) light.draw(context, String(spent.cost), SPENT.x, SPENT.y)
  }

  /** One line of the board: pieces laid out left to right and centred as a
   * group, a piece being either words or one of the markup icons. */
  const boardLine = (
    context: CanvasRenderingContext2D,
    sprites: SpriteSet,
    font: Font,
    y: number,
    pieces: BoardPiece[]
  ): void => {
    const board = layout.board
    const widthOf = (piece: BoardPiece): number => {
      if (piece.text !== undefined) return font.measure(piece.text)
      if (piece.sprite) {
        const tall = piece.height ?? piece.sprite.height
        return Math.round((piece.sprite.width * tall) / piece.sprite.height)
      }
      return sprites.get(piece.icon ?? '').width
    }
    const after = (piece: BoardPiece): number => piece.after ?? board.gap
    const total = pieces.reduce(
      (width, piece, i) => width + widthOf(piece) + (i < pieces.length - 1 ? after(piece) : 0),
      0
    )
    let x = Math.round(board.centre - total / 2)
    for (const piece of pieces) {
      if (piece.text !== undefined) font.draw(context, piece.text, x, y + offset)
      else if (piece.sprite) {
        const tall = piece.height ?? piece.sprite.height
        context.drawImage(piece.sprite.image, x, y - board.lift + offset, widthOf(piece), tall)
      } else context.drawImage(sprites.get(piece.icon ?? '').image, x, y - board.lift + offset)
      x += widthOf(piece) + after(piece)
    }
  }

  const writeBoard = (
    context: CanvasRenderingContext2D,
    sprites: SpriteSet,
    font: Font
  ): void => {
    const pig = squad[boardPig]
    if (!pig) return
    const lines = layout.board.lines
    const gap = layout.board.gap
    // What the cheapest way out of this class costs. A HERO has none, and its
    // line is left off rather than written with a dash.
    const ways = promotionsFrom(pig.rank)
    boardLine(context, sprites, font, lines.tokens, [{ icon: 'vp' }, { text: String(tokens) }])
    boardLine(context, sprites, font, lines.name, [{ text: pig.name }])
    boardLine(context, sprites, font, lines.rank, [{ text: feText(rankText(pig.rank)) }])
    if (ways.length > 0) {
      boardLine(context, sprites, font, lines.promote, [
        { text: feText(PROMOTE_TEXT) },
        { icon: 'vp' },
        { text: String(Math.min(...ways.map((way) => way.cost))) }
      ])
    }
    // The counts, with the board's own wider gap between the pairs. The
    // third is the remake's own (`[deliberate]`, lib/game/roster.ts): how
    // many times this pig has died and come back. The original's board has
    // two counts and no deaths anywhere; the icon is the debrief's tombstone
    // scaled to the markup set's 22, or the letters where the art is missing.
    boardLine(context, sprites, font, lines.counts, [
      { icon: 'battle' },
      { text: String(pig.missions), after: gap + layout.board.spread },
      { icon: 'kills' },
      { text: String(pig.score), after: gap + layout.board.spread },
      rip ? { sprite: rip, height: ICON_TALL } : { text: 'RIP' },
      { text: String(pig.deaths) }
    ])
  }

  const advance = (): void => {
    driveOn.tick()
    pulse += PULSE_STEP
    if (driveOn.phase() === 'here' && flagFly < layout.flag.fly) flagFly++
    menu.tick()
    if (career.state() === 'open') career.tick()
    dim = Math.max(0, Math.min(DIM_TICKS, dim + (overlaid() ? 1 : -1)))
    if (spent && --spent.ticks <= 0) spent = null
    if (driveOn.phase() === 'gone' && leaving) {
      const go = leaving
      leaving = null
      navigate(go)
    }
  }

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

  return {
    async load() {
      if (loaded) return
      try {
        const [shared, sprites] = await Promise.all([loadFrontend(), loadSprites(ART)])
        bank = shared.bank
        lit = shared.lit
        plain = shared.plain
        art = sprites
      } catch (error) {
        console.warn(String(error))
        return
      }
      loaded = true
      // The tombstone comes from the DEBRIEF's folder, so it fails on its
      // own: an install without it loses the icon and keeps the screen.
      try {
        rip = (await loadDebriefSprites([RIP_ART])).get(RIP_ART)
      } catch (error) {
        console.warn(String(error))
      }
      menu.use(bank)
      career.use(bank)
      run(visible)
    },
    leave() {
      visible = false
      run(false)
    },
    enter() {
      visible = true
      driveOn.restart()
      selection = START
      columnRow[0] = 0
      columnRow[1] = 0
      boardPig = 0
      pulse = 0
      leaving = null
      armed = -1
      dim = 0
      spent = null
      flagFly = 0
      menu.reset()
      career.reset()
      draw()
      run(true)
    },
    show(pigs, name, unspent) {
      squad = pigs
      teamName = name
      tokens = unspent
    },
    selected: () => selection,
    labels: () => squad.map((pig) => pig.name).concat([feText(START_TEXT)]),
    values: (): (string | null)[] => [
      ...squad.map((pig) => feText(rankText(pig.rank))),
      null
    ],
    flipping: () => driveOn.phase() !== 'here',
    menu: {
      selected: () => menu.selected(),
      labels: () => menu.labels(),
      values: () => menu.values(),
      flipping: () => menu.flipping(),
      open: () => menu.state() !== 'closed'
    },
    career: {
      selected: () => career.selected(),
      labels: () => career.labels(),
      values: () => career.values(),
      flipping: () => career.flipping(),
      open: () => career.state() === 'open'
    },
    layout
  }
}
