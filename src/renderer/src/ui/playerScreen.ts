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
// Still NOT built: `pcflag`, which marks a pig the team can afford to promote
// (0x41D814, and it wants the team's promotion points); the `sqoptsf` option
// rows at x 428 with their `lit1/2/3` lamps; and the medals.

import { loadFrontend, SCREEN, feText } from './barScreen'
import { byId } from './dom'
import type { Font } from './font'
import { drive } from './drive'
import { controller } from '../input/controller'
import { MENU_BINDINGS } from '../input/actions'
import { loadSprites } from './sprites'
import type { SpriteSet } from './sprites'
import { SILENT } from '../audio/bank'
import type { Bank } from '../audio/bank'
import { EXE_FRAME_SECONDS } from '../../../lib/game/ballistics'
import { FIELDED, SQUAD_SIZE } from '../../../lib/game/roster'
import type { Pig } from '../../../lib/game/roster'
import { careerOf, rankText, stepOf } from '../../../lib/game/ranks'

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
  'bgdark', 'bglight',
  // The FURNITURE, every piece of it placed by the arm's tail: `sqpic` is the
  // panel a column stands on, cut short for the right one; `sqname01..06` one
  // widget carrying the TEAM's name across the top; `sqdial01..06` the pig
  // selector, one a column; `pigpro` the picture in front at the bottom.
  'sqpic', 'sqname01', 'sqdial01', 'pigpro', 'backgr~1',
  ...Array.from({ length: 9 }, (_, i) => `face${i + 1}a`)
]

/** `Fesounds.srl` entry 4 — the same click every other frontend screen makes. */
const CLICK = { name: 'CLICK1', gain: 0.6 }

/** Record 12's own two: START MISSION and SAVE TEAM. The six after them are
 * the pigs, named at runtime, which is why their fetext ids run into the next
 * screen's words (`frontend/notes.md`). */
const START_TEXT = 50
const SAVE_TEXT = 51

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
  /** How far below its row each piece hangs. The badge's 44 is the arm's
   * (0x74 against the portrait's 0x48); the name's is the one number on this
   * screen still `[CHECK — remake]` — the exe writes no words for a pig at
   * all, record 12 having only the two actions. */
  drop: { badge: 44, stripes: 44, name: 44 },
  /** The portrait: `width` is what its name is centred across, `inset` how far
   * its backing — the three `backgr~1` entries (`[play]`) — reaches past the
   * face on every side. */
  portrait: { width: 70, inset: 0 },
  /** The TEAM's own plate, `sqname01` 400×96, hung off the top edge:
   * `2·(scaleY(0) − 7)` (0x41DA12). */
  team: { x: 120, y: -14 },
  /** `pigpro` 200×191 at the bottom centre, and it is the arm's LAST blit
   * (0x41DB85) — so it stands IN FRONT of everything, not behind the
   * portraits as this file used to have it. */
  pigpro: { x: 232, y: 304 },
  /** The WORDS, in their own `.data` boxes the way every other screen's are.
   * `title` is record 12's title box, raw (299, 77) 400 wide (0x4C1548 + 4·12)
   * — and SUSPECT, the +80/−25 folding that placed it having been found wrong
   * on the name screen (`docs/todo.md`). The two actions are its item boxes 59
   * and 60, raw (600, 658) and (710, 658) 10 wide. */
  text: {
    title: { x: 161, y: 45, width: 300 },
    actions: { x: [350, 418], y: 385, width: 56 }
  }
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
  pigpro: { ...LAYOUT.pigpro },
  text: {
    title: { ...LAYOUT.text.title },
    actions: { ...LAYOUT.text.actions, x: [...LAYOUT.text.actions.x] }
  }
})

export interface PlayerScreen {
  load(): Promise<void>
  leave(): void
  enter(): void
  /** The squad to show. Called before the screen is entered. */
  show(squad: Pig[], teamName: string): void
  /** Which of the ten places is lit: 0..7 a pig, 8 START MISSION, 9 SAVE. */
  selected(): number
  labels(): string[]
  values(): (string | null)[]
  flipping(): boolean
  layout: PlayerLayout
}

/** The two actions live past the eight pigs, the way the name entry's keys
 * live past its letters. */
export const START = SQUAD_SIZE
export const SAVE = SQUAD_SIZE + 1
const PLACES = SQUAD_SIZE + 2

export function initPlayerScreen(handlers: {
  onStart: () => void
  onBack: () => void
}): PlayerScreen {
  const canvas = byId<HTMLCanvasElement>('player-screen')
  const layout = cloneLayout()
  canvas.width = SCREEN.width
  canvas.height = SCREEN.height

  let bank: Bank = SILENT
  let art: SpriteSet | null = null
  let lit: Font | null = null
  let plain: Font | null = null
  let loaded = false
  let visible = false
  let offset = 0
  let squad: Pig[] = []
  let teamName = ''
  let selection = 0
  let pulse = 0
  /** **Each column's selector is its own and only travels UP and DOWN**
   * (`[play]`), so a column remembers which of its rows was last lit and keeps
   * its dial there while the other column, or an action, is chosen. */
  const columnRow = [0, 0]

  const driveOn = drive(ENTERS_FROM)
  let leaving: (() => void) | null = null

  const step = (by: number): void => {
    const next = (selection + by + PLACES) % PLACES
    if (next === selection) return
    selection = next
    if (selection < SQUAD_SIZE) {
      const column = selection < COLUMN[0] ? 0 : 1
      columnRow[column] = column === 0 ? selection : selection - COLUMN[0]
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

  const choose = (): void => {
    if (driveOn.phase() !== 'here') return
    if (selection !== START) return
    leaving = handlers.onStart
    driveOn.leave()
  }

  const navigate = (go: () => void): void => queueMicrotask(go)

  controller.onAction((action) => {
    if (!visible) return
    if (action === 'menuUp') vertical(-1)
    else if (action === 'menuDown') vertical(1)
    else if (action === 'menuLeft') sideways(-1)
    else if (action === 'menuRight') sideways(1)
    else if (action === 'menuSelect') choose()
    else if (action === 'menuBack') navigate(handlers.onBack)
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

      // The lit one breathes sideways — the arm scales the WIDTH and re-centres
      // the blit on the source, and pushes the height as it is.
      const swell = slot === selection ? 1 + PULSE_DEPTH * Math.cos(pulse) : 1
      const width = face.width * swell
      context.drawImage(
        face.image,
        Math.round(at.x + (face.width - width) / 2),
        Math.round(y),
        Math.round(width),
        face.height
      )

      // The TRAPEZOID under the name plate, which is what the class badge
      // stands in — and which of the two it is says which HALF of the squad the
      // pig is in: `bgdark` for the five that take the field, `bglight` for the
      // three that do not (`[play]`, against the shipped screen; the five is
      // the manual's own `FIELDED`).
      const column = layout.columns[at.column]
      const leg = sprites.get(slot < FIELDED ? 'bgdark' : 'bglight')
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

      // Its NAME, under its own portrait. The RANK is the badge and the pips
      // beside it — the arm writes no words for a pig at all.
      const font = slot === selection ? light : dark
      font.draw(
        context,
        pig.name,
        centred(font, pig.name, at.x, layout.portrait.width),
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

    // The two actions, in record 12's own boxes.
    const actions = [feText(START_TEXT), feText(SAVE_TEXT)]
    actions.forEach((label, i) => {
      const font = selection === START + i ? light : dark
      font.draw(
        context,
        label,
        centred(font, label, layout.text.actions.x[i], layout.text.actions.width),
        layout.text.actions.y + offset
      )
    })

    // The team's own name across the top, which is what the player just typed.
    if (teamName) {
      light.draw(
        context,
        teamName,
        centred(light, teamName, layout.text.title.x, layout.text.title.width),
        layout.text.title.y + offset
      )
    }

    // `pigpro` LAST, which is where the arm puts it — in front of everything.
    put('pigpro', layout.pigpro.x, layout.pigpro.y)
  }

  const advance = (): void => {
    driveOn.tick()
    pulse += PULSE_STEP
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
      pulse = 0
      leaving = null
      draw()
      run(true)
    },
    show(pigs, name) {
      squad = pigs
      teamName = name
    },
    selected: () => selection,
    labels: () => squad.map((pig) => pig.name).concat([feText(START_TEXT), feText(SAVE_TEXT)]),
    values: (): (string | null)[] => [
      ...squad.map((pig) => feText(rankText(pig.rank))),
      null,
      null
    ],
    flipping: () => driveOn.phase() !== 'here',
    layout
  }
}
