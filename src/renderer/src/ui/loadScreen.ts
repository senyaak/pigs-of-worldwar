// LOAD GAME — record 10, kind 8, and it wears the ORIGINAL's furniture now:
// the eight `pclit` plates, the `pcsav` frame, and the `pcsvinf` panel that
// unrolls as the screen rises from a full screen below (`frontend/notes.md`,
// the 2026-08-17 pass — every number here is that read's).
//
// What is OURS is the meaning. The original lists eight 680-byte struct dumps
// and has a SAVE ARMY twin (record 21, kind 9 — the same screen with one
// action changed); ours lists the eight JSON slots the campaign autosaves
// into, and **SAVE ARMY is deliberately never built** — there is nothing to
// save by hand (`[play]`). The exe's own reading habits carry over exactly,
// because they are good ones: the slot's label is the TEAM NAME out of the
// file, a missing or unreadable file draws `---`, the info panel always
// describes the SELECTED slot — its squad's class badges and its MISSION
// number — and the cursor cannot rest on an empty slot while any save exists.
// The family is entirely SILENT: no arm in it plays a sound, and neither do we.
//
// The selection is shown by the PLATE, blinking `pclit1`/`pclit2` five ticks
// a side (script 1006) while every other plate walks to `pclit0` — the label
// never changes colour. The words ride in from 32 px left on a spring of
// their own while the screen climbs; the panel's CONTENTS wait for the last
// unroll frame, the way the exe's hide flag holds them (`[0x512EB4]`).

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
import { SLOTS, listCampaigns } from '../campaign'
import type { SaveGame } from '../../../lib/game/save'
import { CAMPAIGN_LENGTH } from '../../../lib/game/missions'
import { careerOf, stepOf } from '../../../lib/game/ranks'

/** fetext: record 10's own title, and 248 is `"MISSION "` — the panel's line. */
const TITLE_TEXT = 45
const MISSION_TEXT = 248

/** What an empty slot says — the exe's own string (0x4C0E50). */
const EMPTY = '---'

/** A slot's hit band where the letters have not loaded — the rows' own pitch,
 * and only the mouse reads it (ui/mouseRows.ts). */
const ROW_HEIGHT = 22

/** The plate's three shades, widget frames 0..2. */
const PLATES = ['pclit0', 'pclit1', 'pclit2']
/** The panel's five unroll frames — widget 0 walks 0 → 4 as the screen rises. */
const PANEL = ['pcsvinf0', 'pcsvinf1', 'pcsvinf2', 'pcsvinf3', 'pcsvinf4']
const PANEL_OPEN = PANEL.length - 1

/** The six career badges and the two stripes the panel draws a squad with —
 * the same strip the loader fans into `[0x5119B0]`. */
const BADGE: Record<string, string> = {
  heavy: 'pcHweap',
  espionage: 'snipr',
  engineer: 'sappr',
  medic: 'pcmedic',
  commando: 'cmndo',
  hero: 'pcmedal'
}
const STRIPES = ['strp1', 'strp2']

const ART = ['pigbkpc1', 'pcsav', ...PLATES, ...PANEL, ...Object.values(BADGE), ...STRIPES]

/**
 * THE MOTION — the enter arm's seeds and the update's two springs (0x41BDFB,
 * 0x4251D4), the leave's launcher (0x42639C). The screen's y climbs 800 → 1;
 * the WORDS' own value runs 200 → 500 and folds to a pixel offset of
 * `−(500 − v)/9` — 32 px left at the seed, zero at rest.
 */
const START = { y: 800, words: 200 }
const REST = { y: 1, words: 500 }
const CLIMB = { gain: 8, damping: 20, cap: 20 }
const LEAVING = { accel: 8, cap: 30 }

/** The lit plate's blink — script 1006, `pclit1` five ticks then `pclit2`
 * five, looping. The rack's own LAMP_BLINK is a different script (1002). */
const PLATE_BLINK: Script = {
  beats: [
    [1, 5],
    [2, 5]
  ],
  loop: true
}

const scaleY = (v: number): number => Math.trunc((v * 480) / 820)

/**
 * Where each piece lands, folded at rest — the draw arm's own numbers
 * (0x41DF4A). The panel's ROW numbers are the exe's too (0x42E310: badges at
 * 513/527, rows 110 + 29n, the mission line's box folding to (500, 351)).
 */
const LAYOUT = {
  frame: { x: 0, y: 43 },
  plates: { x: 385, y: [104, 137, 169, 204, 238, 271, 303, 338] },
  panel: { x: 474, y: 73 },
  rows: { x: 125, width: 218, y: [112, 144, 176, 212, 245, 278, 309, 345] },
  squad: { badge: 513, stripes: 527, inset: 14, top: 110, pitch: 29 },
  mission: { x: 500, y: 351, width: 156 },
  text: { title: { x: 133, y: 56, width: 206 } }
}

const TICK_MS = EXE_FRAME_SECONDS * 1000
const MOST_TICKS = 4

export type LoadLayout = typeof LAYOUT

const cloneLayout = (): LoadLayout => ({
  frame: { ...LAYOUT.frame },
  plates: { ...LAYOUT.plates, y: [...LAYOUT.plates.y] },
  panel: { ...LAYOUT.panel },
  rows: { ...LAYOUT.rows, y: [...LAYOUT.rows.y] },
  squad: { ...LAYOUT.squad },
  mission: { ...LAYOUT.mission },
  text: { title: { ...LAYOUT.text.title } }
})

export interface LoadScreen {
  load(): Promise<void>
  leave(): void
  enter(): void
  selected(): number
  labels(): string[]
  values(): (string | null)[]
  flipping(): boolean
  /** Re-read the slots from disk; `enter()` does it on the way in. */
  refresh(): Promise<void>
  layout: LoadLayout
}

export function initLoadScreen(handlers: {
  /** A slot was chosen — the caller adopts it as the campaign. */
  onLoaded: (entry: { slot: string; save: SaveGame }) => void
  onBack: () => void
}): LoadScreen {
  const canvas = byId<HTMLCanvasElement>('load-screen')
  const layout = cloneLayout()
  canvas.width = SCREEN.width
  canvas.height = SCREEN.height

  let art: SpriteSet | null = null
  let lit: Font | null = null
  let plain: Font | null = null
  let loaded = false
  let visible = false

  let entries: ({ slot: string; save: SaveGame } | null)[] = SLOTS.map(() => null)
  let selection = 0
  const y: Motion = still(START.y)
  const words: Motion = still(START.words)
  let phase: 'arriving' | 'here' | 'leaving' = 'arriving'
  let leavingTo: (() => void) | null = null

  const panel: Widget = widget(0)
  const plates: Widget[] = SLOTS.map(() => widget(2))

  const refresh = async (): Promise<void> => {
    const listed = await listCampaigns()
    entries = SLOTS.map((slot) => listed.find((entry) => entry.slot === slot) ?? null)
    if (!entries[selection]) selection = Math.max(0, entries.findIndex(Boolean))
  }

  /** The cursor cannot REST on an empty slot while any save exists — the
   * exe's own recursion, flattened (0x42A749/0x42A8BD/0x4277A1). */
  const step = (by: number): void => {
    if (phase === 'leaving') return
    if (!entries.some(Boolean)) return
    let next = selection
    for (let hops = 0; hops < SLOTS.length; hops++) {
      next = (next + by + SLOTS.length) % SLOTS.length
      if (entries[next]) break
    }
    selection = next
    // No sound: nothing in this family plays one.
  }

  const choose = (): void => {
    if (phase !== 'here') return
    const entry = entries[selection]
    // An empty press is SWALLOWED while any save exists; with all eight empty
    // it backs out (0x42C52D). The skip above makes the first case rare.
    if (!entry) {
      if (!entries.some(Boolean)) goBack()
      return
    }
    leavingTo = () => handlers.onLoaded(entry)
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

  /**
   * THE MOUSE (ui/mouseRows.ts) — the eight slots, at the boxes their labels
   * are centred in, riding the screen's climb. A click on the lit slot loads
   * it.
   *
   * An EMPTY slot is not a place the cursor may rest (`step` hops over one),
   * so the pointer resting on one is simply forgotten in `advance` — without
   * that the light would chase a row it is never allowed to reach and walk the
   * list for ever.
   */
  const mouse = trackRows(
    canvas,
    () =>
      SLOTS.map((_, i) => {
        // The band runs to the NEXT slot, not to the letters' own height —
        // 16 px of type on a 32 px pitch left half the column unclickable.
        const ys = layout.rows.y
        return {
          x: layout.rows.x,
          y: ys[i] + scaleY(y.value) - scaleY(REST.y),
          width: layout.rows.width,
          height: (ys[i + 1] ?? ys[i] + ROW_HEIGHT) - ys[i]
        }
      }),
    // Choosing rides the light: the click queues (ui/mouseRows.ts) and lands
    // in `advance` when the walk arrives at the slot.
    () => {}
  )

  const advance = (): void => {
    if (phase === 'leaving') {
      // The panel rolls shut and the plates park mid-shade; only once the
      // panel is home does the screen drop back out the bottom (0x42639C).
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

    // The pointer walks the light a slot a tick, and an empty slot — which
    // the cursor may not rest on — is forgotten rather than chased.
    const hovered = mouse.hovered()
    if (hovered >= 0) {
      if (hovered === selection && entries[hovered]) {
        const clicked = mouse.clicked()
        mouse.clear()
        if (clicked) choose()
      } else if (!entries[hovered]) mouse.clear()
      else step(hovered > selection ? 1 : -1)
    }

    const home = spring(y, REST.y, CLIMB)
    spring(words, REST.words, CLIMB)
    if (!panel.walking() && panel.frame() !== PANEL_OPEN) panel.goTo(PANEL_OPEN)
    panel.tick()

    // The lit plate blinks on its script; every other walks to the dark one.
    plates.forEach((plate, i) => {
      if (i === selection) {
        if (!plate.walking()) plate.play(PLATE_BLINK)
      } else if (plate.frame() !== 0) {
        plate.goTo(0)
      }
      plate.tick()
    })

    // ONLY the arrival may latch 'here' — a click is chosen INSIDE this very
    // tick now (the queue in ui/mouseRows.ts), and an unguarded latch undid
    // the leave the same frame it began: the screen was settled, so `home`
    // was true, and play read it as a dead click ("клик в выборе сохранения
    // ничего не делает" — the leave trace came back EMPTY).
    if (phase === 'arriving' && home && panel.frame() === PANEL_OPEN) phase = 'here'
  }

  const centred = (font: Font, text: string, left: number, width: number): number =>
    Math.round(left + (width - font.measure(text)) / 2)

  const draw = (): void => {
    const context = canvas.getContext('2d')
    if (!context || !art || !lit || !plain) return
    const sprites = art
    const yOff = scaleY(y.value) - scaleY(REST.y)
    const wordsOff = -Math.trunc((REST.words - words.value) / 9)
    context.drawImage(sprites.get('pigbkpc1').image, 0, 0)

    context.drawImage(sprites.get('pcsav').image, layout.frame.x, layout.frame.y + yOff)
    plates.forEach((plate, i) => {
      const shade = sprites.get(PLATES[plate.frame()] ?? PLATES[0])
      context.drawImage(shade.image, layout.plates.x, layout.plates.y[i] + yOff)
    })
    context.drawImage(
      sprites.get(PANEL[panel.frame()] ?? PANEL[0]).image,
      layout.panel.x,
      layout.panel.y + yOff
    )

    // The labels: the team's name, or the exe's own `---`, and **the LIT slot
    // is written in the light shade** — `[play]`: "выделенный вариант — текст
    // не подсвечивается белым как в других меню". The exe does not do this
    // (its selection is the plate's business alone and the words never change
    // colour, which is what this file used to say and draw), but every other
    // screen in the remake's frontend tells the lit row apart by its letters,
    // and a plate blinking behind eight identical lines does not read as a
    // cursor. Play's call overrides the read, by design (CLAUDE.md).
    entries.forEach((entry, i) => {
      const label = entry ? entry.save.name : EMPTY
      const font = i === selection ? lit : plain
      font?.draw(
        context,
        label,
        centred(font, label, layout.rows.x + wordsOff, layout.rows.width),
        layout.rows.y[i] + yOff
      )
    })

    const title = feText(TITLE_TEXT)
    lit.draw(
      context,
      title,
      centred(lit, title, layout.text.title.x + wordsOff, layout.text.title.width),
      layout.text.title.y + yOff
    )

    // The panel's CONTENTS exist only once it has unrolled (`[0x512EB4]`):
    // the selected slot's squad as badges and stripes, and its mission line.
    if (panel.frame() !== PANEL_OPEN) return
    const entry = entries[selection]
    if (!entry) return
    entry.save.squad.forEach((pig, n) => {
      const rowY = layout.squad.top + layout.squad.pitch * n + yOff
      const step_ = stepOf(pig.rank)
      if (step_ > 0) {
        const stripes = sprites.get(STRIPES[step_ - 1] ?? STRIPES[0])
        context.drawImage(stripes.image, layout.squad.stripes, rowY)
      }
      // A GRUNT draws nothing, the exe's own class-0 skip — which is why a
      // fresh campaign shows an empty column.
      if (pig.rank !== 0) {
        const badge = sprites.get(BADGE[careerOf(pig.rank)] ?? 'pcHweap')
        const badgeX = layout.squad.badge - (step_ > 0 ? layout.squad.inset : 0)
        context.drawImage(badge.image, badgeX, rowY)
      }
    })
    const mission = `${feText(MISSION_TEXT)}${entry.save.position}`
    plain.draw(
      context,
      mission,
      centred(plain, mission, layout.mission.x, layout.mission.width),
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
        const [shared, sprites] = await Promise.all([loadFrontend(), loadSprites(ART)])
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
      y.value = START.y
      y.velocity = 0
      words.value = START.words
      words.velocity = 0
      phase = 'arriving'
      leavingTo = null
      panel.set(0)
      plates.forEach((plate) => plate.set(2))
      void refresh().then(() => draw())
      draw()
      run(true)
    },
    selected: () => selection,
    labels: () => entries.map((entry) => (entry ? entry.save.name : EMPTY)),
    values: () =>
      entries.map((entry) => (entry ? `${entry.save.position}/${CAMPAIGN_LENGTH}` : null)),
    flipping: () => phase !== 'here',
    refresh,
    layout
  }
}
