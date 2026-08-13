// SELECT TEAM — the six armies, on the frontend's OTHER layout.
//
// This is not the machine. Records 3 and 16 wear **kind 2**, and the exe draws
// every kind from one function (0x41BEF0) through a table at 0x41E72C: kind 1
// is the machine at 0x41BF6C, kind 2 is 0x41CBE1, and this file is that arm.
// It was read blit by blit 2026-08-13 and every number below carries the
// address it came from (`frontend/notes.md`, in the disasm repo).
//
// **The lit row is BRACKETED, and the brackets SLIDE.** `selec00..05` at
// x 298 and `lit1..3` at x 537 sit either side of the console, and both take
// their y from `[0x512C18]` — which is **widget 0's FRAME**, the same array
// the band reads widget 5's out of at `[0x512C2C]`. Widget 0 walks FIVE frames
// per row, so `2·scaleY(4·frame)` moves the pair about 23 pixels a row, which
// is the text rows' own pitch: they travel down the list with the selection.
// The first pass here read the two literals 170 and 202 as fixed positions and
// the frame as the only thing that moved — play's screenshot showed the lamp
// stranded at the top while the third name was lit, which is what put it
// right. The `selcog` carriage at (553, 180) really does not move; the arm
// blits it at a literal.
//
// Two things the arm does not draw, and both are gaps:
//
// - **the PIG**, which the original stands on a turntable at the left of this
//   screen. It is a MODEL, not a blit: the frontend's pig-display block
//   (0x513034..0x513068) carries clip 27, the idle, and screen 3's draw arm
//   overrides nothing — it falls into the tail on the shared defaults,
//   `edi = ebp = 331`, `esi = 160`, `1000.0f` in `[0x513030]`. The uniform
//   follows from `Team::SetNation`, which a changed row calls first. Needs the
//   scene beside this canvas, so it lands the way `ui/battle.ts` does it.
// - MULTI-PLAYER's own furniture. Record 16 carries on from 0x41d099 into a
//   long block of four team slots and a sine wobble; every other kind-2 screen
//   returns before it. Ours still rides the machine (`ui/multiPlayer.ts`) and
//   moving it here is a separate piece of work.

import { loadFrontend, SCREEN, feText } from './barScreen'
import { byId } from './dom'
import type { Font } from './font'
import { widget, LAMP_BLINK } from './frames'
import { drive } from './drive'
import { controller } from '../input/controller'
import { MENU_BINDINGS } from '../input/actions'
import { loadSprites } from './sprites'
import type { Sprite, SpriteSet } from './sprites'
import { SILENT } from '../audio/bank'
import type { Bank } from '../audio/bank'
import { EXE_FRAME_SECONDS } from '../../../lib/game/ballistics'
import { NATIONS } from '../../../lib/game/teams'

/** What the kind-2 loader arm (0x422270) decompresses, less the pieces this
 * screen's own arm never blits. `pigbkpc1` is the backdrop every screen sits
 * on and belongs to none of them. */
const ART = [
  'pigbkpc1',
  'counsele',
  'track',
  'namarm1', 'namarm2',
  'name0', 'name1', 'name2', 'name3', 'name4', 'name5',
  'selcog1', 'selcog2', 'selcog3', 'selcog4', 'selcog5', 'selcog6',
  'selec00', 'selec01', 'selec02', 'selec03', 'selec04', 'selec05',
  'lit1', 'lit2', 'lit3'
]

/** `Fesounds.srl` entry 4 at volume 60 — the reel stopping (0x41F34F). */
const CLICK = { name: 'CLICK1', gain: 0.6 }

/** The global 50 the whole frontend widens itself by — `[0x4C0C5C]`, which
 * every x on this screen is written against. */
const STRETCH = 50

/**
 * Where each piece lands, at rest. The y's the arm computes as
 * `2·entrance + k` are marked: those pieces move at TWICE the screen's
 * entrance, which is the arm's own arithmetic and not a mistake here.
 */
const LAYOUT = {
  /** `counsele`'s frame, the machine's three-piece stretch: source `0..128` at
   * x, a two-pixel column repeated 25 times from `repeat`, and `128..end` at
   * `tail`. `y` rides 2× the entrance (0x41cc8b). */
  console: { x: 335, y: 160, seam: 128, repeat: 463, tail: 513 },
  /** Its SKIRT: source rows 290..294 blitted twenty-five times, stepping +4
   * down from y 450 — it runs off the bottom and the canvas clips it exactly
   * as the flush does (0x41cbfe..0x41cc50). 2× the entrance. */
  skirt: { x: 335, y: 450, top: 290, bottom: 294, step: 4, times: 25 },
  /** The carriage, at a literal, 2× the entrance (0x41cc61). */
  carriage: { x: 553, y: 180 },
  /** The two arms of the panel, on widget 1's entrance rather than the
   * screen's — which at rest is nought, so they simply sit (0x41cdc8/0x41cdea). */
  namarm1: { x: 55 },
  namarm2: { x: 460 },
  /** The name band between them, stretched the machine's way again, at
   * `namarm + 24` — and eight pixels higher on one frame of six
   * (0x41ce23: `(frame + 6) % 6 == 3`). */
  band: { x: 98, repeat: 298, tail: 348, drop: 24, wobble: 8, wobbleOn: 3 },
  /** ONE track, the mirrored one, where the machine draws two (0x41d072). */
  track: { x: 651, y: 742, width: 64, height: 638 },
  /** The two brackets round the lit row. Their y is
   * `2·(scaleY(4·widget0.frame) + scaleY(entrance)) + literal` (0x41eb18 and
   * 0x41eb51), so the literal is where row 0 puts them and the frame carries
   * them down the list. */
  emblem: { x: 298, y: 170 },
  lamp: { x: 537, y: 202 }
}

/**
 * The WORDS, out of the per-kind tables at 0x4C1548/0x4C15A8/0x4C1608 with the
 * -25 origin folded in, exactly as `MENU_TEXT` is. Kind 2 carries EIGHT item
 * boxes though no kind-2 screen has more than six items — the layout is shared
 * with the scrolling lists (records 44 and 46), which clamp the lit row to
 * four and carry the surplus as an offset (0x427d96).
 */
/**
 * Where the list's words start. The exe's own table says **404** — records
 * 5..12 at 0x4C1728, raw 687 through the same `x·640/1024 − 25` the main
 * menu's boxes go through — and every other box on this screen comes out of
 * those tables and lands right. But `counsele` is 179 wide and the console
 * spans 335..564 with the global 50 in it, so a 163-wide box at 404 runs to
 * 567 and the longest name goes past the console's own right edge, which is
 * what play saw. Centring on the console gave 368; play looked at that and
 * asked for **+12**. `[play]`, and the exe's number is kept below because the
 * disagreement is real and unexplained.
 *
 * The boxes are in the screen's live layout too —
 * `pow.screen.layout.team.text.rows[0].x` — so the next nudge is a console
 * line and a `print()`, not an edit.
 */
const ROW_X = 380

/** What the exe's own table says row x is, kept so the divergence is visible. */
export const EXE_ROW_X = 404

const TEXT = {
  title: { x: 101, y: 38, width: 425 },
  /** The pitch is the exe's; the x is `ROW_X`, which is play's. */
  rows: [216, 238, 262, 286, 308, 332, 355, 379].map((y) => ({ x: ROW_X, y, width: 163 }))
}

/** fetext: the title, then the six armies. Record 3's own consecutive block. */
const TITLE_TEXT = 24
const ARMY_TEXT = 25

/** Screen 3 comes DOWN from -700 — the per-screen table at 0x4C0A18. It is a
 * different loader family from ONE PLAYER's, so the entrance IS replayed. */
const ENTERS_FROM = -700

/** Widget 0 walks five frames for every row it moves (0x41F34F). */
const FRAMES_PER_ROW = 5
const EMBLEMS = 6

/** The frontend authors in 1024×820 and the screen is 640×480, so a y written
 * in its units comes back through this — the exe's `0x41ADD0`. */
const scaleY = (value: number): number => Math.trunc((value * SCREEN.height) / 820)

const TICK_MS = EXE_FRAME_SECONDS * 1000
const MOST_TICKS = 4

/** Where this screen's pieces sit. Cloned per screen so a console nudge moves
 * the one being looked at, exactly as `ui/barScreen.ts` does it — and this
 * screen wants it more than that one did, because its art was placed from a
 * fresh read and nobody has looked at it yet. */
export type TeamLayout = typeof LAYOUT & { text: typeof TEXT }

const cloneLayout = (): TeamLayout => ({
  console: { ...LAYOUT.console },
  skirt: { ...LAYOUT.skirt },
  carriage: { ...LAYOUT.carriage },
  namarm1: { ...LAYOUT.namarm1 },
  namarm2: { ...LAYOUT.namarm2 },
  band: { ...LAYOUT.band },
  track: { ...LAYOUT.track },
  emblem: { ...LAYOUT.emblem },
  lamp: { ...LAYOUT.lamp },
  // The WORDS come along, because `rowX` is the one number here play has
  // already had to correct — `pow.screen.layout.team.text.rows[0].x -= 4`,
  // watch, `pow.screen.print()`.
  text: { title: { ...TEXT.title }, rows: TEXT.rows.map((row) => ({ ...row })) }
})

export interface TeamScreen {
  load(): Promise<void>
  leave(): void
  enter(): void
  selected(): number
  labels(): string[]
  values(): (string | null)[]
  flipping(): boolean
  layout: TeamLayout
}

export function initTeamScreen(handlers: {
  /** The army the player settled on, 0..5 — the nation index
   * `lib/game/teams.ts` counts by, which is also `team+0x28E`. */
  onPick: (nation: number) => void
  onBack: () => void
}): TeamScreen {
  const canvas = byId<HTMLCanvasElement>('team-screen')
  const layout = cloneLayout()
  canvas.width = SCREEN.width
  canvas.height = SCREEN.height

  let bank: Bank = SILENT
  let art: SpriteSet | null = null
  let lit: Font | null = null
  let plain: Font | null = null
  let names: string[] = []

  let selection = 0
  let visible = false
  let loaded = false
  let offset = 0

  const driveOn = drive(ENTERS_FROM)
  /** The REEL: five frames a row, and the emblem is `frame % 6`. */
  const reel = widget(0)
  /** The lamp, which blinks on the same script the machine's rack does. */
  const lamp = widget(0)
  /** The name band, whose one-frame-in-six wobble is its own frame. */
  const band = widget(0)
  let leaving: (() => void) | null = null

  const step = (by: number): void => {
    const next = (selection + by + NATIONS) % NATIONS
    if (next === selection) return
    selection = next
    reel.goTo(selection * FRAMES_PER_ROW)
    lamp.play(LAMP_BLINK)
  }

  const navigate = (go: () => void): void => queueMicrotask(go)

  const choose = (): void => {
    if (driveOn.phase() !== 'here') return
    const nation = selection
    leaving = () => handlers.onPick(nation)
    driveOn.leave()
  }

  controller.onAction((action) => {
    if (!visible) return
    if (action === 'menuUp') step(-1)
    else if (action === 'menuDown') step(1)
    else if (action === 'menuSelect') choose()
    else if (action === 'menuBack') navigate(handlers.onBack)
  })
  controller.bindKeyboard(() => visible, MENU_BINDINGS)

  /**
   * A line in one of the exe's boxes: centred across it with its TOP at the
   * box's own y, and riding the entrance with everything else.
   */
  const words = (
    context: CanvasRenderingContext2D,
    font: Font,
    text: string,
    box: { x: number; y: number; width: number }
  ): void => {
    font.draw(
      context,
      text,
      Math.round(box.x + (box.width - font.measure(text)) / 2),
      Math.round(box.y + offset)
    )
  }

  const draw = (): void => {
    const context = canvas.getContext('2d')
    if (!context || !art || !lit || !plain) return
    offset = driveOn.offset()
    /** The arm's `2·entrance + k` pieces (0x41cbfe onward). */
    const twice = offset * 2

    /** Source columns `from..to` of a sprite, at (x, y). */
    const slice = (s: Sprite, from: number, to: number, x: number, y: number): void =>
      context.drawImage(s.image, from, 0, to - from, s.height, x, y, to - from, s.height)

    /**
     * The machine's own stretch, a third screen using it: the piece up to
     * `seam`, then a two-pixel column of the source repeated until the global
     * 50 is used up, then the rest.
     */
    const stretched = (
      s: Sprite,
      seam: number,
      at: { x: number; repeat: number; tail: number },
      y: number
    ): void => {
      slice(s, 0, seam, at.x, y)
      for (let done = 0; done < STRETCH; done += 2) {
        slice(s, seam, seam + 2, at.repeat + done, y)
      }
      slice(s, seam, s.width, at.tail, y)
    }

    context.drawImage(art.get('pigbkpc1').image, 0, 0)

    // 1. the console's skirt — one four-row band, twenty-five times down.
    const console_ = art.get('counsele')
    const skirt = layout.skirt
    for (let i = 0; i < skirt.times; i++) {
      context.drawImage(
        console_.image,
        0, skirt.top, console_.width, skirt.bottom - skirt.top,
        skirt.x, skirt.y + twice + i * skirt.step, console_.width, skirt.bottom - skirt.top
      )
    }

    // 2. the carriage, which does not move.
    context.drawImage(art.get('selcog1').image, layout.carriage.x, layout.carriage.y + twice)

    // 3. the console proper.
    stretched(console_, layout.console.seam, layout.console, layout.console.y + twice)

    // 4-6. the panel: two arms and the band between them. They ride widget 1's
    // own entrance, which nothing seeds — so at rest they simply sit.
    const arm1 = art.get('namarm1')
    const armY = 0
    context.drawImage(arm1.image, layout.namarm1.x, armY)
    context.drawImage(art.get('namarm2').image, layout.namarm2.x, armY)
    const plate = art.get(`name${band.frame() % 6}`)
    const wobbling = (band.frame() + 6) % 6 === layout.band.wobbleOn
    const bandY = armY + layout.band.drop - (wobbling ? 0 : layout.band.wobble)
    stretched(plate, 200, layout.band, bandY)

    // 7. ONE track, mirrored, mostly off the screen and clipped by the canvas
    // the way the flush clips it.
    const track = art.get('track')
    context.save()
    context.translate(layout.track.x + driveOn.trackShift(), 0)
    context.scale(-1, 1)
    context.drawImage(track.image, 0, -layout.track.y / 2, layout.track.width, layout.track.height)
    context.restore()

    // 8. the two brackets round the lit row, which SLIDE: their y carries
    // widget 0's own frame, and widget 0 is the reel.
    const slide = twice + 2 * scaleY(4 * reel.frame())
    const emblem = art.get(`selec0${reel.frame() % EMBLEMS}`)
    context.drawImage(emblem.image, layout.emblem.x, layout.emblem.y + slide)
    context.drawImage(
      art.get(`lit${Math.min(lamp.frame(), 2) + 1}`).image,
      layout.lamp.x,
      layout.lamp.y + slide
    )

    // The title wears this family's LIGHT shade — its enter arm sets the
    // colour to (120, 120, 80), mean 107, and over 100 is the light one
    // (0x41B5F4, and 0x4317ed for the rule).
    words(context, lit, feText(TITLE_TEXT), layout.text.title)
    for (let i = 0; i < NATIONS; i++) {
      words(context, i === selection ? lit : plain, names[i] ?? '', layout.text.rows[i])
    }
  }

  const advance = (): void => {
    driveOn.tick()
    // The reel clicks when it LANDS, not once per frame it passes: the
    // builder plays it on the step that reaches the frame it was aimed at.
    if (reel.tick() && !reel.walking()) bank.play(CLICK.name, { gain: CLICK.gain })
    lamp.tick()
    band.tick()
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
        // A stripped install has no frontend to wear. Warn rather than error:
        // the e2e suite treats console.error as a failed run.
        console.warn(String(error))
        return
      }
      // The six armies are named in fetext, and so are their pigs — one block
      // of ten from 166 each (lib/game/teams.ts). The BARS use the screen's
      // own labels at 25..30, which are the same six words.
      names = Array.from({ length: NATIONS }, (_, i) => feText(ARMY_TEXT + i))
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
      selection = 0
      reel.set(0)
      lamp.set(0)
      band.set(0)
      leaving = null
      lamp.play(LAMP_BLINK)
      // Paint the UN-ARRIVED state before the first tick. Without this the
      // canvas still holds the last frame drawn before `leave()` — the screen
      // settled — so coming back to it flashed the finished menu and only then
      // drove in from the top.
      draw()
      run(true)
    },
    selected: () => selection,
    labels: () => names.slice(0, NATIONS),
    values: () => names.slice(0, NATIONS).map(() => null),
    flipping: () => reel.walking() || driveOn.phase() !== 'here',
    layout
  }
}
