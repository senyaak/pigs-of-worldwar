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
// **The placement is READ now, every blit of it** (2026-08-13), and the one
// thing that was open — whether the arm's coordinates go through the frontend's
// resolution scalers — is settled: `[0x51F120]` is SET for the whole frontend
// (0x426A3F, and the three sites an older note called writers are all `mov
// eax,[51F120h]` READS), so `scaleX` is `v·640/1024` and `scaleY` is
// `v·480/820`, both truncated. SELECT TEAM is the proof rather than this
// screen: its lamp steps `2·scaleY(20·row)` = 0, 22, 46, 70, 92, 116, which is
// the text rows' own 0, 22, 45, 70, 92, 115 — unscaled it would be 40 a row and
// nothing would line up.
//
// So the screen is a PANEL with a bar inlaid at the top of it:
//
// - the panel is `alpha02..08`, the seven frames of **widget 18** — the very
//   widget the entrance walks 0 → 6 — drawn whole at `(168, 2·scaleY(y) − 48)`
//   with two 30-row bands of its own top edge above it at −74 and −102, which
//   is how it reaches off the top of the screen. Its frames are 368×192,
//   352×256, 320×288, 304×320, 304×336 and twice 304×352, so the panel UNROLLS
//   downward as the widget walks and comes to rest at 168..472 — dead centre of
//   a 640-wide screen — by 384.
// - the bar is `propoint` tiled at y 4: a cap at x 184, twelve middles from 204
//   stepping 20, a cap at 432, each 20×60, and a single source row stretched
//   100 tall above both caps — the rail it drops in on, since the bar falls
//   from −700 and the panel does not move under it.
//
// The x's are `scaleX([0x512CE4]) + 130 + step + 35`, where `step` is the arm's
// own stack table [51, 35, 35, 19, 3, 3, 3, 3] read BACKWARD by **widget 20**'s
// frame — a widget this screen never walks, so the step is 3 and the panel's x
// is 168.
//
// The GRID itself is play's, off a screenshot of the shipped game — seven
// letters across and six down with the three keys as an eighth column. Where it
// sits ON the panel is the remake's own: the exe lays it out through the text
// object, off record 15's first item box (raw (280, 250) 270×30, i.e. 150, 146)
// and two font metrics filled at runtime, and that arm is not read. See
// `COLUMNS` and `INNER`.

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

/** The panel's seven frames, in the order widget 18's builder walks them
 * (0x41F8A3, `[0x511A48 + 4·frame]`). The entrance asks for frame 6, so
 * `alpha08` is what the screen comes to rest wearing. */
const PLATES = ['alpha02', 'alpha03', 'alpha04', 'alpha05', 'alpha06', 'alpha07', 'alpha08']

/** What kind 0's loader arm (0x4228F9) brings that this screen blits. */
const ART = ['pigbkpc1', 'propoint', ...PLATES, 'chardel', 'charspc', 'charent']

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

/** Widget 18 IS the panel, and the gate the entrance walks is the panel
 * unrolling: frame 0 is `alpha02` and frame 6 `alpha08`. */
const PLATE_FRAMES = PLATES.length - 1

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
 * Where each piece lands, and every number here is the arm's own — see the
 * file's header for how each was read. Only `INNER` is eyework; nudge it from
 * the console (`pow.screen.layout.name.inner.top -= 4`, then
 * `pow.screen.print()`).
 */
const LAYOUT = {
  /** `propoint` tiled: the cap at `x`, middles from `repeat` stepping `step`
   * while they fit before `tail`, and the far cap at `tail`, each 20 wide out
   * of a 60×60 sprite and 60 tall (0x41DDDB..0x41DEDE). Above each cap the
   * source's top row is stretched `rail` tall — the bar's own runners, which
   * only show while it is falling. */
  field: { x: 184, repeat: 204, step: 20, tail: 432, cell: 20, y: 4, height: 60, rail: 100 },
  /** The panel: `alpha02..08` whole at (`x`, `drop` below the doubled
   * entrance), with two `band.height`-row bands of its own top (from source row
   * `band.rows`) at the two offsets above it. */
  plate: { x: 168, drop: -48, band: { rows: 2, height: 30, at: [-74, -102] } },
  /**
   * Where the letters sit ON the panel: inside its own dark WINDOW, and these
   * four are MEASURED off `alpha08`'s art rather than guessed. Scanning the
   * plate for pixels darker than 115 in every channel, the window's solid core
   * runs **x 29..260, y 100..332** of 304×352 — so the letters are laid across
   * 232×232 with the gold frame left clear. Two checks that it is the right
   * rectangle: the frame is handed, 29 on the left against 43 on the right, the
   * way the art's light is; and the window lands at 197..428 on screen, which
   * centres on 312 against the screen's own 320.
   *
   * Spreading the grid over the whole PLATE is what play saw as "the letters
   * are bigger than the black screen" — the last column and the three keys sat
   * on the frame and past it.
   *
   * The `[CHECK — remake]` here is only the SPREAD: the exe's own grid is a
   * fixed 16-pixel step (`frontend/notes.md`), which does not fill the window
   * and disagrees with play's screenshot twice over. See `COLUMNS`.
   */
  inner: { left: 29, right: 43, top: 100, bottom: 19 }
}

/** The words. Both boxes are the exe's, out of the per-kind tables at
 * 0x4C1548/0x4C15A8/0x4C1608 for the title — record 15 is raw (370, 94) 400
 * wide, which is (206, 55) 300 with the stretch's own +80/−25 folded in — and
 * the NAME is centred in the bar it is typed into, which is the remake's own
 * reading: the exe's item box for it is (150, 146), where the grid goes. */
const TEXT = {
  title: { x: 206, y: 55, width: 300 },
  name: { x: 184, y: 26, width: 268 }
}

const TICK_MS = EXE_FRAME_SECONDS * 1000
const MOST_TICKS = 4

export type NameLayout = typeof LAYOUT & { text: typeof TEXT }

const cloneLayout = (): NameLayout => ({
  field: { ...LAYOUT.field },
  plate: { ...LAYOUT.plate, band: { ...LAYOUT.plate.band, at: [...LAYOUT.plate.band.at] } },
  inner: { ...LAYOUT.inner },
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

  /** The arm's own two scalars: every piece of the panel is placed at
   * `2·scaleY(y) + k`, and the words ride the same thing measured from rest. */
  const doubled = (): number => 2 * scaleY(at.y.value)
  const screenOffset = (): { x: number; y: number } => ({
    x: scaleX(at.x.value - REST.x),
    y: doubled() - 2 * scaleY(REST.y)
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

    // The PANEL — widget 18's own frame, so it unrolls downward as the gate
    // walks. Two bands of its top edge go down first and the whole plate over
    // them, which is the arm's order (0x41DD48, 0x41DD62, then 0x41DD77).
    const frame = Math.min(gate, PLATE_FRAMES)
    const plate = art.get(PLATES[frame])
    const plateX = layout.plate.x + screen.x
    const plateTop = doubled() + layout.plate.drop
    const band = layout.plate.band
    for (const above of band.at)
      context.drawImage(
        plate.image,
        0, band.rows, plate.width, band.height,
        plateX, doubled() + above, plate.width, band.height
      )
    context.drawImage(plate.image, plateX, plateTop)

    // The BAR the typed name sits in: one cap, a run of middles, one cap —
    // `propoint` sliced 20 columns at a time, which is the arm's own step —
    // and above each cap the source's top row stretched into a rail. It does
    // NOT ride the screen's x; it has a fall of its own and nothing else.
    const field = art.get('propoint')
    const box = layout.field
    const fieldY = box.y + alongField
    const slice = (from: number, x: number): void =>
      context.drawImage(
        field.image,
        from, 0, box.cell, field.height,
        x, fieldY, box.cell, box.height
      )
    const rail = (x: number): void =>
      context.drawImage(
        field.image,
        0, 0, box.cell, 1,
        x, fieldY - box.rail, box.cell, box.rail
      )
    slice(0, box.x)
    rail(box.x)
    for (let x = box.repeat; x < box.tail; x += box.step) slice(box.cell, x)
    slice(field.width - box.cell, box.tail)
    rail(box.tail)

    // The name, padded out to its maximum with dots. It rides the bar.
    words(context, lit, padded(entry.name, TEAM_NAME_MAX), {
      ...layout.text.name,
      y: layout.text.name.y + alongField - offset
    })

    // Everything ON the panel: eight columns by six rows, the letters in the
    // first seven and the three keys in the last. They wait for the panel to
    // finish unrolling rather than swim about on it.
    if (frame === PLATE_FRAMES) {
      const inner = layout.inner
      const gridX = plateX + inner.left
      const gridY = plateTop + inner.top
      const cellWidth = (plate.width - inner.left - inner.right) / GRID_COLUMNS
      const cellHeight = (plate.height - inner.top - inner.bottom) / grid.rows
      /** The middle of a cell, in canvas coordinates. */
      const cell = (column: number, row: number): { x: number; y: number } => ({
        x: gridX + (column + 0.5) * cellWidth,
        y: gridY + (row + 0.5) * cellHeight
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
        const sprite = art!.get(
          name === 'delete' ? 'chardel' : name === 'space' ? 'charspc' : 'charent'
        )
        const middle = cell(grid.columns, i)
        const x = Math.round(middle.x - sprite.width / 2)
        const y = Math.round(middle.y - sprite.height / 2)
        context.drawImage(sprite.image, x, y)
        if (key === name) {
          context.strokeStyle = 'rgb(216, 216, 152)'
          context.strokeRect(x - 0.5, y - 0.5, sprite.width + 1, sprite.height + 1)
        }
      })
    }

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
