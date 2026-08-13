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
// (0x41DD32/0x41DD5A/0x41DD70), the field is `propoint` tiled — a cap at x 184,
// twelve middles from 204 stepping 20, and a cap at 432 (0x41DDDB..0x41DEDE) —
// and `alpha02..08` are seven PLATES, one per frame of the widget the builder
// walks (0x41F5E9), decoded here as solid blocks with nothing drawn on them:
// the letters go on top as text. What the arm does NOT give is a single y,
// because every one it computes is `2·[0x512964] + k` off an entrance whose
// resting value is not read. So the verticals below are eyework and say so.
//
// The GRID itself is play's, off a screenshot of the shipped game — seven
// letters across and six down with the three keys as an eighth column, on
// `alpha03`. See `COLUMNS`.

import { loadFrontend, SCREEN, feText } from './barScreen'
import { byId } from './dom'
import type { Font } from './font'
import { launch, spring, still } from './springs'
import type { Motion } from './springs'
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
const ART = ['pigbkpc1', 'propoint', 'alpha03', 'chardel', 'charspc', 'charent']

/** `Fesounds.srl` entry 4 at volume 40 — every keypress (0x42AF71). */
const KEYPRESS = { name: 'CLICK1', gain: 0.4 }

/** fetext: record 15's own title. */
const TITLE_TEXT = 57

/**
 * THE MOTION, all of it read (0x41B9FD to seed, 0x424EB6 to arrive, 0x4260F0
 * to leave; `frontend/notes.md` carries the pushes).
 *
 * The screen falls in on TWO axes at once, kicks itself when it lands, walks a
 * widget six frames, and only then slides the name field in behind it. It
 * leaves in the same order backwards. Nothing else on the screen moves.
 */
const START = { x: -800, y: -250, field: -700 }
const REST = { x: 0, y: 70, field: 0 }
/** Both of the screen's own axes, and the field's slower one. */
const SCREEN_SPRING = { gain: 15, damping: 30, cap: 30 }
const FIELD_SPRING = { gain: 10, damping: 17, cap: 50 }
/** A screen does not spring OUT — it launches, under constant acceleration. */
const LEAVING = { accel: 12, cap: 30 }
/** The kick the arm gives itself the frame it arrives (0x424F32). */
const BOUNCE = { y: 1, velocityY: -40, velocityX: -20 }
/** Widget 18 walks 0 → 6 between the screen arriving and the field moving. */
const GATE = 6
/** Where the field goes when the screen leaves, before the screen follows. */
const FIELD_EXIT = -400

/**
 * The GRID: **seven letters across, six rows down**, and the three keys are an
 * EIGHTH column on the same plate.
 *
 * `[play]`, off a screenshot of the shipped game, and it settles what the
 * disassembly could not: 0x431380 computes the shape from the box and the font
 * and the two metrics it reads are filled at runtime, so there was nothing to
 * read. The picture shows `А В С Д Е Ы Ш` and then the back-arrow, six such
 * rows, with `_` and `OK` under the arrow — which is exactly the layout the
 * cursor walk describes (0x42AE30 treats any index at or past the count as one
 * more column, three tall).
 *
 * The ART agrees, which is the check. Eight columns and six rows want a plate
 * whose sides are as 8:6 for a square cell, and of the seven `alpha` plates
 * exactly one is: **`alpha03`, 352×256**, ratio 1.375, cell 44×42.7. The first
 * pass here took `alpha07` and 6×7 and spread the letters half the screen
 * apart, which is what play saw.
 */
const COLUMNS = 7
/** …and the keys' column is the one after the letters'. */
const GRID_COLUMNS = COLUMNS + 1

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
  field: { x: 184, repeat: 204, step: 20, tail: 432, cell: 20, y: 96, height: 60 },
  /** The alphabet plate, `alpha03` — 352 wide, so centred it starts at 144.
   * The y is `[CHECK — remake]`, placed under the field the way play's
   * screenshot has it. */
  plate: { x: 144, y: 176 }
}

/** The words. The title's box is the exe's, out of the per-kind tables at
 * 0x4C1548/0x4C15A8/0x4C1608 with the −25 origin folded in: raw (370, 97)
 * 190 wide. The name's line is centred over the field. */
const TEXT = {
  title: { x: 206, y: 40, width: 168 },
  name: { x: 184, y: 118, width: 268 }
}

const TICK_MS = EXE_FRAME_SECONDS * 1000
const MOST_TICKS = 4

export type NameLayout = typeof LAYOUT & { text: typeof TEXT }

const cloneLayout = (): NameLayout => ({
  field: { ...LAYOUT.field },
  plate: { ...LAYOUT.plate },
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

  /** The three numbers the screen is made of, and the widget between them. */
  const at = { x: still(START.x), y: still(START.y), field: still(START.field) }
  let gate = 0
  let bounced = false
  let phase: 'arriving' | 'here' | 'leaving' | 'gone' = 'arriving'
  let leaving: (() => void) | null = null

  /** The frontend authors in 1024×820; a screen number comes back through
   * these, which are the exe's own 0x41ADB0 and 0x41ADD0. */
  const scaleX = (value: number): number => Math.trunc((value * SCREEN.width) / 1024)
  const scaleY = (value: number): number => Math.trunc((value * SCREEN.height) / 820)

  /** How far the whole screen is from where it settles, in pixels. The arm
   * places its pieces at `2·scaleY(y) − k`, so the offset is doubled too. */
  const screenOffset = (): { x: number; y: number } => ({
    x: scaleX(at.x.value - REST.x),
    y: 2 * scaleY(at.y.value - REST.y)
  })
  /** …and the field carries its own, undoubled. */
  const fieldOffset = (): number => scaleY(at.field.value - REST.field)

  const move = (dx: number, dy: number): void => {
    const next = moveCursor(entry, dx, dy, grid)
    if (next.cursor === entry.cursor) return
    entry = next
    bank.play(KEYPRESS.name, { gain: KEYPRESS.gain })
  }

  const choose = (): void => {
    if (phase !== 'here') return
    const result = press(entry, grid, TEAM_NAME_MAX)
    entry = result.entry
    bank.play(KEYPRESS.name, { gain: KEYPRESS.gain })
    if (result.accepted === undefined) return
    const name = result.accepted
    leaving = () => handlers.onName(name)
    phase = 'leaving'
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
    const screen = screenOffset()
    // The screen's own two axes ride everything; the FIELD carries a third of
    // its own, which does not move until the gate widget has walked.
    offset = screen.y
    const alongField = fieldOffset()

    context.drawImage(art.get('pigbkpc1').image, 0, 0)

    // The FIELD the typed name sits in: one cap, a run of middles, one cap —
    // `propoint` sliced 20 columns at a time, which is the arm's own step.
    const field = art.get('propoint')
    const box = layout.field
    const slice = (from: number, x: number): void =>
      context.drawImage(
        field.image,
        from, 0, box.cell, field.height,
        x + screen.x, box.y + alongField, box.cell, box.height
      )
    slice(0, box.x)
    for (let x = box.repeat; x < box.tail; x += box.step) slice(box.cell, x)
    slice(field.width - box.cell, box.tail)

    // The name, padded out to its maximum with dots. It rides the field.
    words(context, lit, padded(entry.name, TEAM_NAME_MAX), {
      ...layout.text.name,
      x: layout.text.name.x + screen.x,
      y: layout.text.name.y + alongField - offset
    })

    // The alphabet's plate, and everything on it: eight columns by six rows,
    // the letters in the first seven and the three keys in the last.
    const plate = art.get('alpha03')
    const plateX = layout.plate.x + screen.x
    context.drawImage(plate.image, plateX, layout.plate.y + offset)
    const cellWidth = plate.width / GRID_COLUMNS
    const cellHeight = plate.height / grid.rows
    /** The middle of a cell, in canvas coordinates. */
    const cell = (column: number, row: number): { x: number; y: number } => ({
      x: plateX + (column + 0.5) * cellWidth,
      y: layout.plate.y + offset + (row + 0.5) * cellHeight
    })

    for (let i = 0; i < grid.letters.length; i++) {
      const letter = grid.letters[i]
      const middle = cell(i % grid.columns, Math.floor(i / grid.columns))
      const font = i === entry.cursor ? lit : plain
      font.draw(
        context,
        letter,
        Math.round(middle.x - font.measure(letter) / 2),
        Math.round(middle.y - font.height / 2)
      )
    }

    // The three keys — 24×28 sprites, one per row of the eighth column, and
    // the lit one boxed the way the letters are told apart by their shade.
    const key = keyAt(entry, grid)
    KEYS.forEach((name, i) => {
      const sprite = art!.get(name === 'delete' ? 'chardel' : name === 'space' ? 'charspc' : 'charent')
      const middle = cell(grid.columns, i)
      const x = Math.round(middle.x - sprite.width / 2)
      const y = Math.round(middle.y - sprite.height / 2)
      context.drawImage(sprite.image, x, y)
      if (key === name) {
        context.strokeStyle = 'rgb(216, 216, 152)'
        context.strokeRect(x - 0.5, y - 0.5, sprite.width + 1, sprite.height + 1)
      }
    })

    words(context, lit, feText(TITLE_TEXT), {
      ...layout.text.title,
      x: layout.text.title.x + screen.x
    })
  }

  /**
   * One frontend tick of the whole motion, in the exe's own order.
   *
   * Arriving: both axes spring together; the frame they land the screen kicks
   * itself and the gate widget starts walking; the field only moves once that
   * widget is at 6. Leaving: the field launches out first, the widget walks
   * back, and the screen follows it.
   */
  const advance = (): void => {
    if (phase === 'leaving') {
      launch(at.field, FIELD_EXIT, LEAVING)
      if (gate > 0) gate--
      else {
        launch(at.x, START.x, LEAVING)
        if (launch(at.y, START.y, LEAVING)) phase = 'gone'
      }
    } else if (phase !== 'gone') {
      spring(at.x, REST.x, SCREEN_SPRING)
      spring(at.y, REST.y, SCREEN_SPRING)
      if (!bounced && at.x.value === REST.x && at.y.value === REST.y) {
        bounced = true
        at.y.value = BOUNCE.y
        at.y.velocity = BOUNCE.velocityY
        at.x.velocity = BOUNCE.velocityX
      }
      if (bounced && gate < GATE) gate++
      if (gate === GATE) {
        if (spring(at.field, REST.field, FIELD_SPRING) && phase === 'arriving') phase = 'here'
      }
    }
    if (phase === 'gone' && leaving) {
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
      at.x = still(START.x)
      at.y = still(START.y)
      at.field = still(START.field)
      gate = 0
      bounced = false
      phase = 'arriving'
      entry = newEntry()
      leaving = null
      draw()
      run(true)
    },
    typed: () => entry.name,
    selected: () => entry.cursor,
    labels: () => [feText(TITLE_TEXT)],
    values: () => [entry.name],
    flipping: () => phase !== 'here',
    type(character) {
      if (!visible || phase !== 'here') return
      const next = typeCharacter(entry, grid, TEAM_NAME_MAX, character)
      if (next === entry) return
      entry = next
      bank.play(KEYPRESS.name, { gain: KEYPRESS.gain })
    },
    layout
  }
}
