// MISSION SELECT — replay a COMPLETED campaign mission for its record.
//
// The remake's own screen (`[deliberate]`): the original has no replay — its
// nearest relative is the CHEAT LEVEL SELECT (record 44, fetext 151), which
// MOVES the campaign, where this one never does. It wears LOAD GAME's
// furniture on play's word ("использовать тот же интерфейс что и у загрузки
// игры"): the `pcsav` frame, the eight `pclit` plates blinking script 1006,
// the `pcsvinf` panel, the same springs and the same silence. What a row
// SAYS is play's spec exactly: the mission's name on the LEFT — not centred
// — and on the right the PP token with `X/Y`, taken over available
// (2026-08-24). More than eight completed missions scroll through the eight
// plates, the browsed row held in view.
//
// What a replay WINS is a MEDAL the position's record does not hold - each
// new one pays a token (lib/game/save.ts `bankReplay`, campaign.ts
// `bankReplayResult`). The pair a row prints is `taken/available`, taken
// being how many medals stand: the level, the clean sweep, and each of the
// level's own pickups. The campaign position never moves.

import { loadFrontend, SCREEN, feText } from './barScreen'
import { byId } from './dom'
import type { Font } from './font'
import { spring, launch, still } from './springs'
import type { Motion } from './springs'
import { widget } from './frames'
import type { Script, Widget } from './frames'
import { trackRows } from './mouseRows'
import { controller } from '../input/controller'
import { MENU_BINDINGS } from '../input/actions'
import { loadSprites } from './sprites'
import type { SpriteSet } from './sprites'
import { EXE_FRAME_SECONDS } from '../../../lib/game/ballistics'
import { current } from '../campaign'
import { foughtAt, medalCount, medalsAt } from '../../../lib/game/save'
import { bonusPoints, CAMPAIGN_LENGTH, mapAt, missionNameIndex } from '../../../lib/game/missions'

/** The screen's own title — a literal, because no fetext names a replay
 * (151 is "CHEAT LEVEL SELECT" and this is not the cheat). `[deliberate]`. */
const TITLE = 'SELECT MISSION'

/** A row's hit band before the fonts load (ui/mouseRows.ts). */
const ROW_HEIGHT = 22

/** LOAD GAME's own furniture, shared name for name (ui/loadScreen.ts). */
const PLATES = ['pclit0', 'pclit1', 'pclit2']
const PANEL = ['pcsvinf0', 'pcsvinf1', 'pcsvinf2', 'pcsvinf3', 'pcsvinf4']
const PANEL_OPEN = PANEL.length - 1
const ART = ['pigbkpc1', 'pcsav', 'vp', ...PLATES, ...PANEL]

/** How many plates the frame carries — the window the list scrolls through. */
const WINDOW = 8

const START = { y: 800, words: 200 }
const REST = { y: 1, words: 500 }
const CLIMB = { gain: 8, damping: 20, cap: 20 }
const LEAVING = { accel: 8, cap: 30 }

const PLATE_BLINK: Script = {
  beats: [
    [1, 5],
    [2, 5]
  ],
  loop: true
}

const scaleY = (v: number): number => Math.trunc((v * 480) / 820)

/** LOAD GAME's own numbers (ui/loadScreen.ts LAYOUT), less the squad panel
 * it has no use for; `pp` is the right column's inset for the token pair. */
const LAYOUT = {
  frame: { x: 0, y: 43 },
  plates: { x: 385, y: [104, 137, 169, 204, 238, 271, 303, 338] },
  panel: { x: 474, y: 73 },
  rows: { x: 125, width: 218, y: [112, 144, 176, 212, 245, 278, 309, 345] },
  mission: { x: 500, y: 351, width: 156 },
  text: { title: { x: 133, y: 56, width: 206 } },
  /** The PP pair on a row's right edge: the `vp` icon, a gap, then `X/Y`
   * ending flush at `rows.x + rows.width`. */
  pp: { gap: 4 }
}

const TICK_MS = EXE_FRAME_SECONDS * 1000
const MOST_TICKS = 4

export type MissionSelectLayout = typeof LAYOUT

const cloneLayout = (): MissionSelectLayout => ({
  frame: { ...LAYOUT.frame },
  plates: { ...LAYOUT.plates, y: [...LAYOUT.plates.y] },
  panel: { ...LAYOUT.panel },
  rows: { ...LAYOUT.rows, y: [...LAYOUT.rows.y] },
  mission: { ...LAYOUT.mission },
  text: { title: { ...LAYOUT.text.title } },
  pp: { ...LAYOUT.pp }
})

/** fetext 248 `"MISSION "` — the panel's line, LOAD GAME's own. */
const MISSION_TEXT = 248

export interface MissionSelect {
  load(): Promise<void>
  leave(): void
  enter(): void
  selected(): number
  /** The visible rows' names, top to bottom — the rack's own contract. */
  labels(): string[]
  /** …and each row's `taken/available` pair, as drawn. */
  values(): (string | null)[]
  flipping(): boolean
  layout: MissionSelectLayout
}

export function initMissionSelect(handlers: {
  /** A completed position was chosen — the caller launches the replay. */
  onPick: (position: number) => void
  onBack: () => void
}): MissionSelect {
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

  /** EVERY real mission, campaign order — the training ground is deliberately
   * not a row (play: "тренировку туда не пихай — буткэмп"). A row past the
   * campaign's position is LOCKED: grey, browsable, and it refuses the
   * choice (play: "серым — текст не белый а серый, и его незя выбрать"). */
  let positions: number[] = []
  /** Which of `positions` the cursor stands on, and where the window starts. */
  let selection = 0
  let windowTop = 0
  const y: Motion = still(START.y)
  const words: Motion = still(START.words)
  let phase: 'arriving' | 'here' | 'leaving' = 'arriving'
  let leavingTo: (() => void) | null = null

  const panel: Widget = widget(0)
  const plates: Widget[] = Array.from({ length: WINDOW }, () => widget(2))

  /**
   * A row past the record is locked — never chosen, only read. So is one the
   * save kept no SQUAD for: a replay fields the pigs that finished the
   * mission and nothing else may stand in (`[play]`, 2026-08-26), so a
   * position with no record cannot be replayed at all. Only a campaign from
   * before the record existed has such a row.
   */
  const locked = (position: number): boolean => {
    const save = current()
    if (!save || position >= save.position) return true
    return foughtAt(save, position) === null
  }

  const refresh = (): void => {
    positions = current()
      ? Array.from({ length: CAMPAIGN_LENGTH - 1 }, (_, i) => i + 1)
      : []
    if (selection >= positions.length) selection = Math.max(0, positions.length - 1)
    scrollTo(selection)
  }

  /** Keep the selection inside the window — the list scrolls, the plates
   * stand still. */
  const scrollTo = (at: number): void => {
    if (at < windowTop) windowTop = at
    if (at >= windowTop + WINDOW) windowTop = at - WINDOW + 1
    windowTop = Math.max(0, Math.min(windowTop, Math.max(0, positions.length - WINDOW)))
  }

  const step = (by: number): void => {
    if (phase === 'leaving' || positions.length === 0) return
    selection = (selection + by + positions.length) % positions.length
    scrollTo(selection)
    // Silent, like the whole family (ui/loadScreen.ts).
  }

  const choose = (): void => {
    if (phase !== 'here') return
    const position = positions[selection]
    if (position === undefined) {
      goBack()
      return
    }
    // A locked row refuses in silence, like the family's other refusals.
    if (locked(position)) return
    leavingTo = () => handlers.onPick(position)
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

  const mouse = trackRows(
    canvas,
    () =>
      Array.from({ length: WINDOW }, (_, i) => ({
        x: layout.rows.x,
        y: layout.rows.y[i] + scaleY(y.value) - scaleY(REST.y),
        width: layout.rows.width,
        height: plain?.height ?? ROW_HEIGHT
      })),
    (row) => {
      if (windowTop + row === selection) choose()
    }
  )

  const advance = (): void => {
    if (phase === 'leaving') {
      panel.goTo(0)
      plates.forEach((plate) => plate.goTo(1))
      panel.tick()
      plates.forEach((plate) => plate.tick())
      if (panel.frame() === 0 && launch(y, START.y, LEAVING) && leavingTo) {
        const go = leavingTo
        leavingTo = null
        queueMicrotask(go)
      }
      return
    }

    const hovered = mouse.hovered()
    if (hovered >= 0) {
      const at = windowTop + hovered
      if (at === selection || at >= positions.length) mouse.clear()
      else step(at > selection ? 1 : -1)
    }

    const home = spring(y, REST.y, CLIMB)
    spring(words, REST.words, CLIMB)
    if (!panel.walking() && panel.frame() !== PANEL_OPEN) panel.goTo(PANEL_OPEN)
    panel.tick()

    plates.forEach((plate, i) => {
      if (windowTop + i === selection) {
        if (!plate.walking()) plate.play(PLATE_BLINK)
      } else if (plate.frame() !== 0) {
        plate.goTo(0)
      }
      plate.tick()
    })

    if (home && panel.frame() === PANEL_OPEN) phase = 'here'
  }

  /** A row's two halves: the name off gtext's own mission table, and the
   * record over what a mission can PAY — one for finishing, one for coming
   * through without a death, plus the map's own specials (play caught the
   * pair counting only specials: "the war foundation показывает 0/0").
   * Never under what was actually taken. */
  const rowOf = (position: number): { name: string; taken: number; available: number } => {
    const save = current()
    const map = mapAt(position)
    const name = (map && gtext[missionNameIndex(map)]) || map || '?'
    // The medals HELD at this position, counted - which is what the pair
    // says: taken of available. Which ones they are decides what a replay is
    // paid for (lib/game/save.ts, `Medals`).
    const taken = save ? medalCount(medalsAt(save, position)) : 0
    return { name, taken, available: Math.max(2 + bonusPoints(position), taken) }
  }

  const centred = (font: Font, text: string, left: number, width: number): number =>
    Math.round(left + (width - font.measure(text)) / 2)

  const draw = (): void => {
    const context = canvas.getContext('2d')
    if (!context || !art || !lit || !plain) return
    const sprites = art
    const litFont = lit
    const plainFont = plain
    const yOff = scaleY(y.value) - scaleY(REST.y)
    const wordsOff = -Math.trunc((REST.words - words.value) / 9)
    context.drawImage(sprites.get('pigbkpc1').image, 0, 0)

    context.drawImage(sprites.get('pcsav').image, layout.frame.x, layout.frame.y + yOff)
    plates.forEach((plate, i) => {
      if (windowTop + i >= positions.length) return
      const shade = sprites.get(PLATES[plate.frame()] ?? PLATES[0])
      context.drawImage(shade.image, layout.plates.x, layout.plates.y[i] + yOff)
    })
    context.drawImage(
      sprites.get(PANEL[panel.frame()] ?? PANEL[0]).image,
      layout.panel.x,
      layout.panel.y + yOff
    )

    // The rows: name LEFT — play's spec, not centred — and the PP pair flush
    // right: the `vp` token, a gap, `taken/available`. A LOCKED mission is
    // written whole in the OFF shade — the frontend's own grey for a bar
    // that refuses — and carries no pair: nothing was earned and the count
    // is the map's to keep.
    const coin = sprites.get('vp')
    for (let i = 0; i < WINDOW; i++) {
      const at = windowTop + i
      if (at >= positions.length) break
      const position = positions[at]
      const row = rowOf(position)
      const shut = locked(position)
      const font = shut ? (off ?? plainFont) : at === selection ? litFont : plainFont
      const top = layout.rows.y[i] + yOff
      font.draw(context, row.name, layout.rows.x + wordsOff, top)
      if (shut) continue
      const pair = `${row.taken}/${row.available}`
      const pairX = layout.rows.x + layout.rows.width - font.measure(pair)
      font.draw(context, pair, pairX + wordsOff, top)
      context.drawImage(
        coin.image,
        pairX - coin.width - layout.pp.gap + wordsOff,
        Math.round(top + (font.height - coin.height) / 2)
      )
    }

    litFont.draw(
      context,
      TITLE,
      centred(litFont, TITLE, layout.text.title.x + wordsOff, layout.text.title.width),
      layout.text.title.y + yOff
    )

    // The panel names the browsed mission once it has unrolled, LOAD GAME's
    // own habit — its number, which the battle's own card counts the same way.
    if (panel.frame() !== PANEL_OPEN || positions.length === 0) return
    const mission = `${feText(MISSION_TEXT)}${positions[selection]}`
    plainFont.draw(
      context,
      mission,
      centred(plainFont, mission, layout.mission.x, layout.mission.width),
      layout.mission.y + yOff
    )
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
      y.value = START.y
      y.velocity = 0
      words.value = START.words
      words.velocity = 0
      phase = 'arriving'
      leavingTo = null
      panel.set(0)
      plates.forEach((plate) => plate.set(2))
      refresh()
      draw()
      run(true)
    },
    selected: () => selection,
    labels: () =>
      positions.slice(windowTop, windowTop + WINDOW).map((position) => rowOf(position).name),
    values: () =>
      positions.slice(windowTop, windowTop + WINDOW).map((position) => {
        if (locked(position)) return null
        const row = rowOf(position)
        return `${row.taken}/${row.available}`
      }),
    flipping: () => phase !== 'here',
    layout
  }
}
