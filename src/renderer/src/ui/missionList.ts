// THE MISSION MAP — the campaign's 26, on the console the original keeps for
// its own mission list.
//
// The original has NO between-mission screen: START MISSION launches, and the
// only thing that ever lists the campaign is the NAUGHTY PIGS cheat — record
// 44, kind 2, the SELECT TEAM console wearing 26 rows in a SEVEN-ROW WINDOW
// that scrolls under a PARKED cursor (`frontend/notes.md`, the 2026-08-17
// read). This screen is that record's mechanics on that record's furniture,
// standing where the original has nothing (`[deliberate]`): the campaign
// deserves a map, and the exe itself drew one only for cheats.
//
// What is the READ's: the console, its skirt, the carriage, the arms and the
// band (the numbers `ui/teamScreen.ts` carries, 0x41CBE1); the seven text
// rows in kind 2's own boxes with the chosen one in the MIDDLE box and the
// list moving under it (0x4291D8/0x429205); the lamp parked at (537, 272) on
// its blink script and the `selec03` bracket at (298, 240) — record 44's
// widget frame is pinned at 15, and 15 % 6 is 3 for ever (0x41EB25); the
// silent moves — nothing on record 44 clicks; the cursor seeded from the
// campaign's own position (0x42D2AC); and the console rising from 546 below
// (0x41B652, spring 10/15/15).
//
// What is OURS: the rows say the mission TITLES out of gtext (the cheat
// prints raw map names — `ROAD`, `TRENCH`); a played position wears the plain
// shade, the CURRENT one the light, the future the dark; and only the current
// row can be CHOSEN — the cheat lets any row move the campaign, which is
// exactly what a cheat is for and a map is not.

import { loadFrontend, SCREEN } from './barScreen'
import { byId } from './dom'
import type { Font } from './font'
import { spring, launch, still } from './springs'
import type { Motion } from './springs'
import { widget, LAMP_BLINK } from './frames'
import type { Widget } from './frames'
import { controller } from '../input/controller'
import { MENU_BINDINGS } from '../input/actions'
import { loadSprites } from './sprites'
import type { Sprite, SpriteSet } from './sprites'
import { EXE_FRAME_SECONDS } from '../../../lib/game/ballistics'
import { CAMPAIGN_LENGTH, mapAt, missionNameIndex } from '../../../lib/game/missions'

const ART = [
  'pigbkpc1',
  'counsele',
  'selcog1',
  'namarm1', 'namarm2', 'name0',
  'track',
  'selec03',
  'lit1', 'lit2', 'lit3'
]

/**
 * The console furniture, at rest — the same read numbers `ui/teamScreen.ts`
 * stands on (0x41CBE1's blits), less the pig and its turntable, which are
 * record 3's own. The `2×` pieces ride TWICE the entrance, the arm's own
 * arithmetic.
 */
const LAYOUT = {
  console: { x: 335, y: 160, seam: 128, repeat: 463, tail: 513 },
  skirt: { x: 335, y: 450, top: 290, bottom: 294, step: 4, times: 25 },
  carriage: { x: 553, y: 180 },
  namarm1: { x: 55 },
  namarm2: { x: 460 },
  band: { x: 98, repeat: 298, tail: 348, drop: 24 },
  track: { x: 651, y: 742, width: 64, height: 638 },
  /** Record 44's own parked pair (0x41EB25/0x41EB62). */
  emblem: { x: 298, y: 240 },
  lamp: { x: 537, y: 272 },
  /**
   * The seven-row WINDOW: kind 2's item boxes 5..11, the exe's x 404 through
   * the same play-corrected 380 the team screen's rows wear — mission titles
   * are longer than army names, so the centring wants the console's own
   * middle. The chosen row is always the MIDDLE one, y 286.
   */
  rows: { x: 380, width: 163, y: [216, 238, 261, 286, 308, 331, 355] },
  text: { title: { x: 101, y: 38, width: 425 } }
}

/** The window shows three above and three below the browsed row (0x4291D8). */
const MIDDLE = 3

/** The console rises from 546 below (0x41B652), spring 10/15/15 (0x4241FF),
 * and leaves under the family's own launcher. */
const ENTERS_FROM = 546
const CLIMB = { gain: 10, damping: 15, cap: 15 }
const LEAVING = { accel: 10, cap: 30 }

const scaleY = (value: number): number => Math.trunc((value * SCREEN.height) / 820)
const STRETCH = 50

const TICK_MS = EXE_FRAME_SECONDS * 1000
const MOST_TICKS = 4

export type MissionListLayout = typeof LAYOUT

const cloneLayout = (): MissionListLayout => ({
  console: { ...LAYOUT.console },
  skirt: { ...LAYOUT.skirt },
  carriage: { ...LAYOUT.carriage },
  namarm1: { ...LAYOUT.namarm1 },
  namarm2: { ...LAYOUT.namarm2 },
  band: { ...LAYOUT.band },
  track: { ...LAYOUT.track },
  emblem: { ...LAYOUT.emblem },
  lamp: { ...LAYOUT.lamp },
  rows: { ...LAYOUT.rows, y: [...LAYOUT.rows.y] },
  text: { title: { ...LAYOUT.text.title } }
})

export interface MissionListScreen {
  load(): Promise<void>
  leave(): void
  enter(): void
  selected(): number
  labels(): string[]
  values(): (string | null)[]
  flipping(): boolean
  /** The campaign to show: where it stands, and whose name goes on top.
   * Called before the screen is entered. */
  show(position: number, teamName: string): void
  layout: MissionListLayout
}

export function initMissionList(handlers: {
  /** The CURRENT mission was chosen — launch it. */
  onPick: () => void
  onBack: () => void
}): MissionListScreen {
  const canvas = byId<HTMLCanvasElement>('missions-screen')
  const layout = cloneLayout()
  canvas.width = SCREEN.width
  canvas.height = SCREEN.height

  let art: SpriteSet | null = null
  let lit: Font | null = null
  let plain: Font | null = null
  let off: Font | null = null
  let gtext: string[] = []
  let loaded = false
  let visible = false

  let position = 0
  let teamName = ''
  /** The browsed row — the one standing in the middle box. */
  let cursor = 0
  const y: Motion = still(ENTERS_FROM)
  let phase: 'arriving' | 'here' | 'leaving' = 'arriving'
  let leavingTo: (() => void) | null = null

  const lamp: Widget = widget(0)

  /** A position's name: the mission TITLE out of gtext, the raw map name
   * where the title table has none. */
  const nameOf = (at: number): string => {
    const map = mapAt(at)
    if (!map) return ''
    const title = gtext[missionNameIndex(map)] ?? ''
    return title || map
  }

  const step = (by: number): void => {
    if (phase === 'leaving') return
    cursor = Math.max(0, Math.min(CAMPAIGN_LENGTH - 1, cursor + by))
    // Silent — nothing on record 44 clicks (`frontend/notes.md`).
  }

  const choose = (): void => {
    if (phase !== 'here' || cursor !== position) return
    leavingTo = handlers.onPick
    phase = 'leaving'
  }

  const goBack = (): void => {
    if (phase === 'leaving') return
    leavingTo = handlers.onBack
    phase = 'leaving'
  }

  controller.onAction((action) => {
    if (!visible) return
    if (action === 'menuUp') step(-1)
    else if (action === 'menuDown') step(1)
    else if (action === 'menuSelect') choose()
    else if (action === 'menuBack') goBack()
  })
  controller.bindKeyboard(() => visible, MENU_BINDINGS)

  const advance = (): void => {
    if (phase === 'leaving') {
      if (launch(y, ENTERS_FROM, LEAVING) && leavingTo) {
        const go = leavingTo
        leavingTo = null
        queueMicrotask(go)
      }
      return
    }
    if (spring(y, 0, CLIMB)) phase = 'here'
    lamp.tick()
  }

  const centred = (font: Font, text: string, left: number, width: number): number =>
    Math.round(left + (width - font.measure(text)) / 2)

  const draw = (): void => {
    const context = canvas.getContext('2d')
    if (!context || !art || !lit || !plain || !off) return
    const sprites = art
    const twice = 2 * scaleY(y.value)

    const slice = (s: Sprite, from: number, to: number, x: number, atY: number): void =>
      context.drawImage(s.image, from, 0, to - from, s.height, x, atY, to - from, s.height)
    const stretched = (
      s: Sprite,
      seam: number,
      at: { x: number; repeat: number; tail: number },
      atY: number
    ): void => {
      slice(s, 0, seam, at.x, atY)
      for (let done = 0; done < STRETCH; done += 2) slice(s, seam, seam + 2, at.repeat + done, atY)
      slice(s, seam, s.width, at.tail, atY)
    }

    context.drawImage(sprites.get('pigbkpc1').image, 0, 0)

    // The console family's own order: skirt, carriage, console, arms, band,
    // track (ui/teamScreen.ts, 0x41CBE1).
    const console_ = sprites.get('counsele')
    const skirt = layout.skirt
    for (let i = 0; i < skirt.times; i++) {
      context.drawImage(
        console_.image,
        0, skirt.top, console_.width, skirt.bottom - skirt.top,
        skirt.x, skirt.y + twice + i * skirt.step, console_.width, skirt.bottom - skirt.top
      )
    }
    context.drawImage(sprites.get('selcog1').image, layout.carriage.x, layout.carriage.y + twice)
    stretched(console_, layout.console.seam, layout.console, layout.console.y + twice)
    context.drawImage(sprites.get('namarm1').image, layout.namarm1.x, 0)
    context.drawImage(sprites.get('namarm2').image, layout.namarm2.x, 0)
    stretched(sprites.get('name0'), 200, layout.band, layout.band.drop)
    const track = sprites.get('track')
    context.save()
    context.scale(-1, 1)
    context.drawImage(
      track.image,
      -layout.track.x - layout.track.width,
      -layout.track.y / 2,
      layout.track.width,
      layout.track.height
    )
    context.restore()

    // Record 44's parked pair: the bracket and the blinking lamp.
    context.drawImage(sprites.get('selec03').image, layout.emblem.x, layout.emblem.y + twice)
    context.drawImage(
      sprites.get(`lit${Math.min(lamp.frame(), 2) + 1}`).image,
      layout.lamp.x,
      layout.lamp.y + twice
    )

    // The WINDOW: seven rows, the browsed one always in the middle box, the
    // list moving under it. Played positions plain, the current light, the
    // future dark.
    layout.rows.y.forEach((rowY, i) => {
      const at = cursor - MIDDLE + i
      if (at < 0 || at >= CAMPAIGN_LENGTH) return
      const font = at === position ? lit : at < position ? plain : off
      if (!font) return
      const label = nameOf(at)
      font.draw(context, label, centred(font, label, layout.rows.x, layout.rows.width), rowY + twice)
    })

    // The team's name across the top, the family's own title box.
    if (teamName && lit) {
      lit.draw(
        context,
        teamName,
        centred(lit, teamName, layout.text.title.x, layout.text.title.width),
        layout.text.title.y + twice
      )
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
        const [shared, sprites, text] = await Promise.all([
          loadFrontend(),
          loadSprites(ART),
          window.api.loadGameText('gtext')
        ])
        lit = shared.lit
        plain = shared.plain
        off = shared.off
        art = sprites
        if (text.ok) gtext = text.strings
        else console.warn(`missions: gtext would not load (${text.error})`)
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
      y.value = ENTERS_FROM
      y.velocity = 0
      cursor = position
      phase = 'arriving'
      leavingTo = null
      lamp.play(LAMP_BLINK)
      draw()
      run(true)
    },
    show(at, name) {
      position = at
      teamName = name
    },
    selected: () => cursor,
    labels: () => Array.from({ length: CAMPAIGN_LENGTH }, (_, i) => nameOf(i)),
    values: () =>
      Array.from({ length: CAMPAIGN_LENGTH }, (_, i) =>
        i < position ? 'done' : i === position ? 'next' : null
      ),
    flipping: () => phase !== 'here',
    layout
  }
}
