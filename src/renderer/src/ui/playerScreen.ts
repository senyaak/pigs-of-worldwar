// The PLAYER screen — record 12, kind 5: your eight pigs, and what to do next.
//
// The exe draws the squad TWICE over the same ragged grid (0x41D285): a first
// pass of portraits and a second of badges and stripes, both gated on the
// screen having arrived. The grid is **five across and then three** — the arm
// runs `ebp` 0..4 and `ebx` 0..1 and skips `ebx == 1 && ebp > 2` — over slots
// read at `team + 64*slot + 0x70`, with the class in the byte after it.
//
// **The lit portrait is the only thing that moves.** Every other pig is
// blitted at 0x1000, unity; the chosen one's width and height come out of
// `fcos` on `[0x512E54]`, an angle that advances 100 of 4096 a frame. So it
// swells and shrinks in place.
//
// What a pig WEARS is one byte. `lib/game/ranks.ts` carries the tables: the
// class picks the career's badge (six of them, 52×24) and the step in that
// career picks the stripes, with step 0 wearing none.
//
// **The column pitch, 74, is the arm's** (`2·(37·column)`, 0x41D5B0). Every y
// here is eyework — the arm's are computed off an entrance whose resting value
// is not read, exactly as on the name entry.

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
import { SQUAD_SIZE } from '../../../lib/game/roster'
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

/** The grid: five, then three. */
const ROWS = [5, 3]

/**
 * Where each piece lands. **The pitch is the arm's; every y is eyework** —
 * nudge from the console (`pow.screen.layout.player.grid.y += 4`, then
 * `pow.screen.print()`).
 */
const LAYOUT = {
  /** A face is 70×60, a badge 52×24. `pitch` is 0x41D5B0's own `2·37·column`. */
  grid: { x: 96, y: 120, pitch: 74, rowPitch: 150, face: 70, high: 60 },
  /** Under the face: the badge, the stripes, and the name. */
  badge: { drop: 64 },
  stripes: { drop: 64, across: 54 },
  name: { drop: 92 },
  /** The two actions, at the foot. */
  actions: { x: 220, y: 400, pitch: 24, width: 200 }
}

const TEXT = { title: { x: 206, y: 30, width: 228 } }

/** The lit portrait's swell: `fcos` on an angle that steps 100 of 4096 a frame
 * (0x41D365). The two constants beside it are not decoded, so the DEPTH of the
 * swell is `[CHECK — remake]`; the rate is the exe's. */
const PULSE_STEP = (100 / 4096) * Math.PI * 2
const PULSE_DEPTH = 0.12

const TICK_MS = EXE_FRAME_SECONDS * 1000
const MOST_TICKS = 4

export type PlayerLayout = typeof LAYOUT & { text: typeof TEXT }

const cloneLayout = (): PlayerLayout => ({
  grid: { ...LAYOUT.grid },
  badge: { ...LAYOUT.badge },
  stripes: { ...LAYOUT.stripes },
  name: { ...LAYOUT.name },
  actions: { ...LAYOUT.actions },
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

  /** Left and right walk the row; up and down step a whole row, and the two
   * actions are the row under the grid. */
  const sideways = (by: number): void => step(by)
  const vertical = (by: number): void => {
    if (selection >= SQUAD_SIZE) {
      // Out of the actions and back onto the grid's last row, or round.
      step(by > 0 ? PLACES - selection : -1 - (selection - SQUAD_SIZE))
      return
    }
    step(by > 0 ? ROWS[0] : -ROWS[0])
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

  /** Where slot `n` sits, in the ragged five-then-three. */
  const place = (slot: number): { x: number; y: number } => {
    const row = slot < ROWS[0] ? 0 : 1
    const column = slot - (row === 0 ? 0 : ROWS[0])
    return {
      x: layout.grid.x + column * layout.grid.pitch,
      y: layout.grid.y + row * layout.grid.rowPitch
    }
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

      // The PORTRAIT. The lit one swells; every other is drawn at its own size.
      const face = sprites.get(`face${(pig.identity % 9) + 1}a`)
      const swell = slot === selection ? 1 + PULSE_DEPTH * Math.cos(pulse) : 1
      const width = face.width * swell
      const high = face.height * swell
      context.drawImage(
        face.image,
        Math.round(at.x + (face.width - width) / 2),
        Math.round(y + (face.height - high) / 2),
        Math.round(width),
        Math.round(high)
      )

      // The CAREER's badge, and the stripes of its step — 0 wears none.
      const badge = sprites.get(BADGE[careerOf(pig.rank)] ?? 'pcHweap')
      context.drawImage(badge.image, at.x, y + layout.badge.drop)
      const step_ = stepOf(pig.rank)
      if (step_ > 0) {
        const stripes = sprites.get(STRIPES[step_ - 1] ?? STRIPES[0])
        context.drawImage(stripes.image, at.x + layout.stripes.across, y + layout.stripes.drop)
      }

      // Its NAME, and its RANK under that — both out of fetext for the rank,
      // and the player's own words for the name.
      const font = slot === selection ? light : dark
      font.draw(context, pig.name, centred(font, pig.name, at.x, layout.grid.face), y + layout.name.drop)
      const rank = feText(rankText(pig.rank))
      dark.draw(
        context,
        rank,
        centred(dark, rank, at.x, layout.grid.face),
        y + layout.name.drop + dark.height
      )
    }

    // The two actions under the grid.
    const actions = [feText(START_TEXT), feText(SAVE_TEXT)]
    actions.forEach((label, i) => {
      const font = selection === START + i ? light : dark
      font.draw(
        context,
        label,
        centred(font, label, layout.actions.x, layout.actions.width),
        layout.actions.y + offset + i * layout.actions.pitch
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
