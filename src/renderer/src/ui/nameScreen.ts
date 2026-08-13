// PLEASE NAME YOUR TEAM — record 15, and the frontend's fourth layout.
//
// Kind 0 serves the two name entries and the level code, and it has no bars at
// all: the alphabet is `fetext` 0, a plain string of 42 characters, and the
// cursor is `[record+0x0C]` — the very field every other kind uses for "which
// item is lit" (0x4284D0). Three values past the end of that string are three
// keys of their own, `chardel` / `charspc` / `charent`, and the walk at
// 0x42AE30 puts them in one more column beside the grid. All of that is in
// `lib/game/nameEntry.ts`, which is where the rules live and where they are
// tested; this file is the picture.
//
// **The art is read, the placement is not.** The three key plates are 24×28
// and the arm stacks them 28 apart (0x41DD32/0x41DD5A/0x41DD70), the field is
// `propoint` tiled — a cap at x 184, twelve middles from 204 stepping 20, and
// a cap at 432 (0x41DDDB..0x41DEDE) — and `alpha02..08` are seven PLATES, one
// per frame of the widget the builder walks (0x41F5E9), decoded here as solid
// blocks with nothing drawn on them: the letters go on top as text. What the
// arm does NOT give is a single y, because every one it computes is
// `2·[0x512964] + k` off an entrance whose resting value is not read. So the
// verticals below are eyework and say so.

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
import {
  ALPHABET,
  KEYS,
  TEAM_NAME_MAX,
  keyAt,
  moveCursor,
  newEntry,
  padded,
  press,
  type as typeCharacter
} from '../../../lib/game/nameEntry'
import type { Alphabet, NameEntry } from '../../../lib/game/nameEntry'

/** What kind 0's loader arm (0x4228F9) brings that this screen blits. */
const ART = ['pigbkpc1', 'propoint', 'alpha07', 'chardel', 'charspc', 'charent']

/** `Fesounds.srl` entry 4 at volume 40 — every keypress (0x42AF71). */
const KEYPRESS = { name: 'CLICK1', gain: 0.4 }

/** fetext: record 15's own title. */
const TITLE_TEXT = 57

/** Screen 15 comes down like the team screen it follows. */
const ENTERS_FROM = -700

/**
 * The GRID, and it is `[CHECK — remake]`.
 *
 * The original does not store it — 0x431380 computes it from the box and the
 * font, `columns = scaleX(w + stretch)/(advance + spacing) − 7` and
 * `rows = 42/columns + 1` — and the two font metrics it reads (`[+0x3F40]` the
 * advance, `[+0x14]` the spacing) are filled at runtime by the text object's
 * constructor and are not decoded. What IS decoded is the art: `alpha07` is
 * 304×352, and 42 letters land on it as **6 across and 7 down** at a cell of
 * almost exactly 50×50, which is the one arrangement of the seven plates that
 * comes out square and uses every place. That is the argument for this number
 * and the whole of it.
 */
const COLUMNS = 6

const ALPHABET_GRID: Alphabet = {
  letters: ALPHABET,
  columns: COLUMNS,
  rows: Math.ceil(ALPHABET.length / COLUMNS)
}

/**
 * Where each piece lands. Only the x's carry an address; every y is eyework,
 * for the reason in the file's own header — nudge them from the console
 * (`pow.screen.layout.name.field.y -= 4`, then `pow.screen.print()`).
 */
const LAYOUT = {
  /** `propoint` tiled: the cap at `x`, middles from `repeat` stepping `step`
   * while they fit before `tail`, and the far cap at `tail` (0x41DDDB on).
   * The x's are the arm's; `y` and `height` are `[CHECK — remake]`. */
  field: { x: 184, repeat: 204, step: 20, tail: 432, cell: 20, y: 96, height: 40 },
  /** The alphabet plate, `alpha07`. `[CHECK — remake]`. */
  plate: { x: 168, y: 150 },
  /** The three keys, 24×28 each and stacked 28 apart — the SPACING is the
   * arm's (0x41DD32/0x41DD5A/0x41DD70), the corner is `[CHECK — remake]`. */
  keys: { x: 490, y: 190, step: 28 }
}

/** The words. The title's box is the exe's, out of the per-kind tables at
 * 0x4C1548/0x4C15A8/0x4C1608 with the −25 origin folded in: raw (370, 97)
 * 190 wide. The name's line is centred over the field. */
const TEXT = {
  title: { x: 206, y: 56, width: 168 },
  name: { x: 184, y: 108, width: 268 }
}

const TICK_MS = EXE_FRAME_SECONDS * 1000
const MOST_TICKS = 4

export type NameLayout = typeof LAYOUT & { text: typeof TEXT }

const cloneLayout = (): NameLayout => ({
  field: { ...LAYOUT.field },
  plate: { ...LAYOUT.plate },
  keys: { ...LAYOUT.keys },
  text: { title: { ...TEXT.title }, name: { ...TEXT.name } }
})

export interface NameScreen {
  load(): Promise<void>
  leave(): void
  enter(): void
  /** What has been typed so far. */
  typed(): string
  /** Where the cursor is, as the exe keeps it: an index into the alphabet, or
   * one of the three past its end. */
  selected(): number
  labels(): string[]
  values(): (string | null)[]
  flipping(): boolean
  /** The remake's own keyboard — `[deliberate]`, like the mouse on the menu.
   * The original has only the grid. */
  type(character: string): void
  layout: NameLayout
}

export function initNameScreen(handlers: {
  /** The name the player settled on. */
  onName: (name: string) => void
  onBack: () => void
}): NameScreen {
  const canvas = byId<HTMLCanvasElement>('name-screen')
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

  /** The alphabet is read from `fetext` the way the original reads it; the
   * constant is only the fallback for a stripped install. */
  let grid: Alphabet = ALPHABET_GRID
  let entry: NameEntry = newEntry()

  const driveOn = drive(ENTERS_FROM)
  let leaving: (() => void) | null = null

  const move = (dx: number, dy: number): void => {
    const next = moveCursor(entry, dx, dy, grid)
    if (next.cursor === entry.cursor) return
    entry = next
    bank.play(KEYPRESS.name, { gain: KEYPRESS.gain })
  }

  const choose = (): void => {
    if (driveOn.phase() !== 'here') return
    const result = press(entry, grid, TEAM_NAME_MAX)
    entry = result.entry
    bank.play(KEYPRESS.name, { gain: KEYPRESS.gain })
    if (result.accepted === undefined) return
    const name = result.accepted
    leaving = () => handlers.onName(name)
    driveOn.leave()
  }

  const navigate = (go: () => void): void => queueMicrotask(go)

  controller.onAction((action) => {
    if (!visible) return
    if (action === 'menuUp') move(0, -1)
    else if (action === 'menuDown') move(0, 1)
    else if (action === 'menuLeft') move(-1, 0)
    else if (action === 'menuRight') move(1, 0)
    else if (action === 'menuSelect') choose()
    else if (action === 'menuBack') navigate(handlers.onBack)
  })
  controller.bindKeyboard(() => visible, MENU_BINDINGS)

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

    context.drawImage(art.get('pigbkpc1').image, 0, 0)

    // The FIELD the typed name sits in: one cap, a run of middles, one cap —
    // `propoint` sliced 20 columns at a time, which is the arm's own step.
    const field = art.get('propoint')
    const at = layout.field
    const slice = (from: number, x: number): void =>
      context.drawImage(
        field.image,
        from, 0, at.cell, field.height,
        x, at.y + offset, at.cell, at.height
      )
    slice(0, at.x)
    for (let x = at.repeat; x < at.tail; x += at.step) slice(at.cell, x)
    slice(field.width - at.cell, at.tail)

    // The name, padded out to its maximum with dots.
    words(context, lit, padded(entry.name, TEAM_NAME_MAX), layout.text.name)

    // The alphabet's plate, and the letters over it — the lit one in the
    // light shade, which is how every other screen marks its selection.
    const plate = art.get('alpha07')
    context.drawImage(plate.image, layout.plate.x, layout.plate.y + offset)
    const cellWidth = plate.width / grid.columns
    const cellHeight = plate.height / grid.rows
    for (let i = 0; i < grid.letters.length; i++) {
      const letter = grid.letters[i]
      const column = i % grid.columns
      const row = Math.floor(i / grid.columns)
      const font = i === entry.cursor ? lit : plain
      font.draw(
        context,
        letter,
        Math.round(layout.plate.x + (column + 0.5) * cellWidth - font.measure(letter) / 2),
        Math.round(layout.plate.y + offset + (row + 0.5) * cellHeight - font.height / 2)
      )
    }

    // The three keys, in their own column beside the grid.
    const key = keyAt(entry, grid)
    KEYS.forEach((name, i) => {
      const sprite = art!.get(name === 'delete' ? 'chardel' : name === 'space' ? 'charspc' : 'charent')
      const y = layout.keys.y + offset + i * layout.keys.step
      context.drawImage(sprite.image, layout.keys.x, y)
      if (key === name) {
        context.strokeStyle = 'rgb(216, 216, 152)'
        context.strokeRect(layout.keys.x - 0.5, y - 0.5, sprite.width + 1, sprite.height + 1)
      }
    })

    words(context, lit, feText(TITLE_TEXT), layout.text.title)
  }

  const advance = (): void => {
    driveOn.tick()
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
      // fetext 0 IS the alphabet — the exe reads it from there and so does
      // this, falling back to the constant only when the install has no
      // strings at all.
      const letters = feText(0) || ALPHABET
      grid = { letters, columns: COLUMNS, rows: Math.ceil(letters.length / COLUMNS) }
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
      entry = newEntry()
      leaving = null
      draw()
      run(true)
    },
    typed: () => entry.name,
    selected: () => entry.cursor,
    labels: () => [feText(TITLE_TEXT)],
    values: () => [entry.name],
    flipping: () => driveOn.phase() !== 'here',
    type(character) {
      if (!visible || driveOn.phase() !== 'here') return
      const next = typeCharacter(entry, grid, TEAM_NAME_MAX, character)
      if (next === entry) return
      entry = next
      bank.play(KEYPRESS.name, { gain: KEYPRESS.gain })
    },
    layout
  }
}
