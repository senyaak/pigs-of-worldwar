// The skill menu: what a pig is carrying, in the game's own frame.
//
// The exe calls it a MODE of its own — "Skill menu mode. Press X to select a
// skill" (0x4D8BE0) — entered from the battle's mode machine at 0x49172A.
// What it draws comes out of `Language/Tims/MENUTIMS.MAD`, which is BMPs
// rather than TIMs: `menu.bmp`, the 257×274 frame, then one 56×34 icon per
// skill NAMED after the skill and in the skill list's own order (TROTTER,
// KNIFE, BAYONET, … SURREND — lib/game/skills.ts), and last `SELECT.BMP`,
// the 86×52 highlight that sits over the chosen one.
//
// The transparency is two different keys and they are both measured: the
// frame's see-through is MAGENTA and the black inside it is the widget's own
// backing, while the icons and the highlight sit on BLACK fields that go
// (main/assets.ts, lib/formats/alpha.ts).
//
// The GRID is measured off the frame rather than decoded: its cells are the
// transparent windows punched through it, three across and four down —
// x 14..79, 84..149, 153..219 and y 54..93, 99..138, 145..184, 192..231,
// with a wider window at the bottom (13..220 × 248..265) for the name of
// what is selected. Where the widget SITS and how it arrives — in from the
// right — is play's, not the exe's, which computes its coordinates rather
// than storing them.

import { SKILL, SKILL_ICON, skillName } from '../../../lib/game/skills'
import { UNLIMITED } from '../../../lib/game/inventory'
import type { Slot } from '../../../lib/game/inventory'
import { loadFont } from './font'
import type { Font } from './font'
import { loadArchiveBmps } from './sprites'
import type { Sprite, SpriteSet } from './sprites'

const MENU_ART = 'Language/Tims/MENUTIMS.MAD'
/** The frame, and the highlight over the chosen cell. */
const FRAME = 'menu'
const HIGHLIGHT = 'select'
/** The name under the grid is small text, not the big letters. */
const MENU_FONT = 'CHARS2'

/** Every number here is in the 640×480 units the screen is laid out in. */
export const LAYOUT = {
  /** The frame's own size, and where it comes to rest: against the right
   * edge, clear of it by `margin`. */
  frame: { width: 257, height: 274, margin: { right: 8 }, y: 96 },
  /** How long it takes to slide in from off the right edge. */
  slide: 0.18,
  /** The windows punched through the frame, measured off it. */
  grid: {
    columns: 3,
    rows: 4,
    /** First cell's top-left, then the step to the next. */
    x: 14,
    y: 54,
    stepX: 70,
    stepY: 46,
    width: 66,
    height: 40
  },
  /** The strip at the bottom that names what is selected. */
  caption: { x: 13, y: 249, width: 208 }
}

export interface SkillMenu {
  load(): Promise<void>
  /** Whether the menu is up — the battle stops driving the pig while it is. */
  open(): boolean
  /**
   * Open it on what this pig is carrying, or close it if it is already up.
   * Returns true when it OPENED, which is what the caller plays a sound on.
   *
   * It opens on an empty pig too: a pig always has something to do, because
   * SKIP TURN is always in the list.
   */
  toggle(carrying: Slot[]): boolean
  close(): void
  /** One frame of the slide. */
  update(delta: number): void
  /** Move the cursor. */
  move(dx: number, dy: number): void
  /** The skill under the cursor, or null when the menu is down. */
  chosen(): number | null
  /** Draw it, in the 640×480 units the rest of the dashboard uses. */
  draw(context: CanvasRenderingContext2D, viewWidth: number, strings: string[]): void
}

/**
 * What a pig can always do, whatever it is carrying — SKIP TURN is in the
 * menu of a pig with empty hands, so the menu always has something in it.
 */
const ALWAYS: Slot[] = [{ skill: SKILL.SKIP_TURN, amount: UNLIMITED }]

export function createSkillMenu(): SkillMenu {
  let art: SpriteSet | null = null
  let font: Font | null = null
  let loaded = false
  let up = false
  let slots: Slot[] = ALWAYS
  let cursor = 0
  /** How far in the widget is, 0 off-screen right to 1 home. */
  let slid = 0

  const perPage = LAYOUT.grid.columns * LAYOUT.grid.rows
  /** What the menu shows: what the pig carries, then what it can always do. */
  const listFor = (carrying: Slot[]): Slot[] => [
    ...carrying,
    ...ALWAYS.filter((always) => !carrying.some((slot) => slot.skill === always.skill))
  ]

  return {
    async load() {
      if (loaded) return
      try {
        const [icons, letters] = await Promise.all([loadArchiveBmps(MENU_ART), loadFont(MENU_FONT)])
        art = icons
        font = letters
        loaded = true
      } catch (error) {
        // A stripped install has no menu art; the battle plays on without it.
        console.warn(String(error))
      }
    },

    open: () => up,

    toggle(carrying) {
      if (up) {
        up = false
        return false
      }
      slots = listFor(carrying)
      cursor = Math.min(cursor, slots.length - 1)
      up = true
      slid = 0
      return true
    },

    close() {
      up = false
    },

    update(delta) {
      // It drives on, and simply goes when it is dismissed — the original's
      // own pieces slide in and this is the same reading of them.
      slid = up ? Math.min(1, slid + delta / LAYOUT.slide) : 0
    },

    move(dx, dy) {
      if (!up || slots.length === 0) return
      const step = dx + dy * LAYOUT.grid.columns
      const count = Math.min(slots.length, perPage)
      cursor = (((cursor + step) % count) + count) % count
    },

    chosen: () => (up && slots.length > 0 ? slots[cursor].skill : null),

    draw(context, viewWidth, strings) {
      if (!up || !art || !font) return
      const sheet = art
      const letters = font
      const frame = sheet.get(FRAME)
      // Home is against the right edge; off-screen is a whole width further.
      const home = viewWidth - LAYOUT.frame.width - LAYOUT.frame.margin.right
      const left = Math.round(home + (1 - slid) * (LAYOUT.frame.width + LAYOUT.frame.margin.right))
      const top = LAYOUT.frame.y
      context.drawImage(frame.image, left, top)

      const { grid } = LAYOUT
      const cellAt = (index: number): { x: number; y: number } => ({
        x: left + grid.x + (index % grid.columns) * grid.stepX,
        y: top + grid.y + Math.floor(index / grid.columns) * grid.stepY
      })

      // One icon per slot, in the order the pig picked them up, with its
      // count under it — unlimited ones simply carry no number.
      slots.slice(0, perPage).forEach((slot, index) => {
        const cell = cellAt(index)
        const icon = iconFor(sheet, slot.skill)
        if (icon) {
          context.drawImage(
            icon.image,
            Math.round(cell.x + (grid.width - icon.width) / 2),
            Math.round(cell.y + (grid.height - icon.height) / 2)
          )
        }
        if (slot.amount === UNLIMITED) return
        const count = String(slot.amount)
        letters.draw(
          context,
          count,
          Math.round(cell.x + grid.width - letters.measure(count) - 2),
          Math.round(cell.y + grid.height - letters.height)
        )
      })

      // The highlight is bigger than a cell and sits centred on it.
      const cell = cellAt(Math.min(cursor, perPage - 1))
      const mark = sheet.get(HIGHLIGHT)
      context.drawImage(
        mark.image,
        Math.round(cell.x + (grid.width - mark.width) / 2),
        Math.round(cell.y + (grid.height - mark.height) / 2)
      )

      // And what it is called, along the strip at the bottom.
      const skill = slots[cursor]?.skill
      if (skill === undefined) return
      const name = skillName(strings, skill)
      letters.draw(
        context,
        name,
        Math.round(left + LAYOUT.caption.x + (LAYOUT.caption.width - letters.measure(name)) / 2),
        top + LAYOUT.caption.y
      )
    }
  }
}

/** The icon for a skill: the archive names them, so a skill with no art
 * simply shows an empty cell rather than taking the menu down. */
function iconFor(art: SpriteSet, skill: number): Sprite | null {
  const name = SKILL_ICON[skill]
  if (!name) return null
  try {
    return art.get(name)
  } catch {
    return null
  }
}
