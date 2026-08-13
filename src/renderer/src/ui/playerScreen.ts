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
// What is still NOT drawn is the screen's own furniture — `sqpic`,
// `sqpics00..10`, `sqdial01..06`, `sqname01..06`, `pigpro`, `parrow1..3`,
// `sqarmy`, `sqoptsf`, the medals and the flags, and the frame `backgr~1`
// pieces each portrait sits in — nor the arm's THIRD loop (0x41D70E on).

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
 * Where the five rows sit, read off the arm rather than stepped: the y is
 * `flag + 2·(37·row + nudge) + 72` and the two flags are per-row, which is why
 * the pitch is 74, 74, 73, 72 rather than a flat number (0x41D2FF, 0x41D349).
 */
const ROW_Y = [75, 149, 223, 296, 368]

/**
 * Where each piece lands. Every number is the arm's, at the entrance's rest.
 */
const LAYOUT = {
  /** The portraits: `scaleX(0) − 10 + 462·column + 67`. A face is 70×60. */
  grid: { x: [57, 519], face: 70 },
  /** The badge and the pips step **417** a column and are handed (+82 / −69),
   * so both columns' badges face the middle of the screen. Their y is the
   * row's plus 44 (0x74 against the portrait's 0x48). */
  badge: { x: [161, 427], drop: 44 },
  stripes: { x: [181, 447], drop: 44 },
  /** The name under its own portrait — `[CHECK — remake]`. The exe hangs the
   * eight names off `sqname01..06` and its unread third loop, not off an item
   * box: record 12 has only the two below. */
  name: { drop: 60 },
  /** The two actions: record 12's own item boxes 59 and 60, raw (600, 658) and
   * (710, 658) 10 wide, which is (350, 385) and (418, 385) 56 across. */
  actions: { x: [350, 418], y: 385, width: 56 }
}

/** Record 12's title box, raw (299, 77) 400 wide (0x4C1548 + 4·12). */
const TEXT = { title: { x: 161, y: 45, width: 300 } }

/** The lit portrait's swell: `fcos` on an angle that steps 100 of 4096 a frame
 * (0x41D365). The two constants beside it are not decoded, so the DEPTH of the
 * swell is `[CHECK — remake]`; the rate is the exe's. */
const PULSE_STEP = (100 / 4096) * Math.PI * 2
const PULSE_DEPTH = 0.12

const TICK_MS = EXE_FRAME_SECONDS * 1000
const MOST_TICKS = 4

export type PlayerLayout = typeof LAYOUT & { text: typeof TEXT }

const cloneLayout = (): PlayerLayout => ({
  grid: { ...LAYOUT.grid, x: [...LAYOUT.grid.x] },
  badge: { ...LAYOUT.badge, x: [...LAYOUT.badge.x] },
  stripes: { ...LAYOUT.stripes, x: [...LAYOUT.stripes.x] },
  name: { ...LAYOUT.name },
  actions: { ...LAYOUT.actions, x: [...LAYOUT.actions.x] },
  text: { title: { ...TEXT.title } }
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

  const driveOn = drive(ENTERS_FROM)
  let leaving: (() => void) | null = null

  const step = (by: number): void => {
    const next = (selection + by + PLACES) % PLACES
    if (next === selection) return
    selection = next
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
    return { column, x: layout.grid.x[column], y: ROW_Y[row] }
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

    for (let slot = 0; slot < SQUAD_SIZE; slot++) {
      const pig = squad[slot]
      if (!pig) continue
      const at = place(slot)
      const y = at.y + offset

      // The PORTRAIT. The lit one breathes sideways — the arm scales the WIDTH
      // and re-centres the blit on the source, and pushes the height as it is.
      const face = sprites.get(`face${(pig.identity % 9) + 1}a`)
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
      const leg = sprites.get(slot < FIELDED ? 'bgdark' : 'bglight')
      const badge = sprites.get(BADGE[careerOf(pig.rank)] ?? 'pcHweap')
      const legX = layout.badge.x[at.column] - Math.round((leg.width - badge.width) / 2)
      context.drawImage(leg.image, legX, y + layout.badge.drop)

      // The CAREER's badge, and the stripes of its step — 0 wears none. Both
      // sit inboard of the portrait, on the column's own hand.
      //
      // **A GRUNT wears NO badge** (`[play]`): class 0 shares group 0 with the
      // heavy career, so the table alone would give it that career's picture,
      // and the original shows a pig with no class at all until it is promoted.
      // The trapezoid stays — it is the plate's own leg, not the badge's.
      if (pig.rank !== GRUNT) {
        context.drawImage(badge.image, layout.badge.x[at.column], y + layout.badge.drop)
      }
      const step_ = stepOf(pig.rank)
      if (step_ > 0) {
        const stripes = sprites.get(STRIPES[step_ - 1] ?? STRIPES[0])
        context.drawImage(stripes.image, layout.stripes.x[at.column], y + layout.stripes.drop)
      }

      // Its NAME, under its own portrait. The RANK is the badge and the pips
      // beside it — the arm writes no words for a pig at all.
      const font = slot === selection ? light : dark
      font.draw(
        context,
        pig.name,
        centred(font, pig.name, at.x, layout.grid.face),
        y + layout.name.drop
      )
    }

    // The two actions, in record 12's own boxes.
    const actions = [feText(START_TEXT), feText(SAVE_TEXT)]
    actions.forEach((label, i) => {
      const font = selection === START + i ? light : dark
      font.draw(
        context,
        label,
        centred(font, label, layout.actions.x[i], layout.actions.width),
        layout.actions.y + offset
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
