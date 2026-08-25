// CAREER PATH — record 25, kind 13: a GRUNT's four ways out.
//
// The exe draws it as a CAROUSEL, not a list (`frontend/notes.md`,
// 2026-08-18): the title, ONE career name in one box under it — the four take
// turns there as the cursor moves — and four career icons in a row at the
// bottom, the chosen one blinking. It plays NO entrance: kinds 0/5/6/13 are
// one family and the enter arm skips everything inside it.
//
// It has no backdrop of its own: it is drawn ON the pig menu's plaque, which
// HOLDS, bare, while this screen is up — both word boxes and the icon row
// land inside the plaque's footprint. Closing hands the plaque back through
// `onClosed(chosen)`: chosen, the plaque leaves for the squad; backed out,
// the menu's rows come back onto it.
//
// The gate ran before this screen opened — the pig menu refuses a GRUNT with
// no point — so choosing a row pays without a second test (0x42C631), which
// is safe while all four rows cost the same 1. The write itself is still the
// composition root's; a refusal here would mean the save moved underneath,
// and it answers with the refusal sound rather than a write.

import type { SpriteSet } from './sprites'
import type { Font } from './font'
import { SILENT, type Bank } from '../audio/bank'
import { feText } from './barScreen'
import { promotionsFrom } from '../../../lib/game/ranks'

/** fetext: the title, and the four careers — 91 HEAVY WEAPONS, 92 ENGINEER,
 * 93 ESPIONAGE, 94 MEDIC, the tree's own row order (classes 1/5/8/11). */
const TITLE_TEXT = 90
const ROW_TEXT = 91

/** The two word boxes, folded: the title, and the ONE box all four names
 * share (kind 13's item boxes are identical on purpose). */
const TITLE = { x: 184, y: 339, width: 218 }
const NAME = { x: 184, y: 373, width: 218 }

/** The four icons: x 260 + 30 a row, y 408 — rows 0..3 wear the careers'
 * badges in the stack table's order {0,2,1,3} over the loader's handle
 * array, which lands as heavy, sapper, sniper, medic. */
const ICONS = ['pcHweap', 'sappr', 'snipr', 'pcmedic']
const ICON = { x: 260, step: 30, y: 408 }

/** A row change (0x4280E4) — `click4` at 40, and nothing else moves. */
const MOVE = { name: 'CLICK4', gain: 0.4 }
const PROMO = { name: 'PROMO', gain: 0.8 }
const CRUNCH = { name: 'CRUNCH', gain: 1.0 }

const GRUNT = 0

export interface CareerPath {
  open(slot: number): void
  /** Gone at once, without the closed handler — the squad re-entering. */
  reset(): void
  state(): 'open' | 'closed'
  handle(action: string): void
  tick(): void
  draw(context: CanvasRenderingContext2D, sprites: SpriteSet, lit: Font): void
  use(bank: Bank): void
  selected(): number
  labels(): string[]
  values(): (string | null)[]
  flipping(): boolean
}

export function initCareerPath(handlers: {
  /** The chosen way, off the GRUNT's own four. True is written and paid. */
  pick: (slot: number, to: number) => boolean
  onSpent: (cost: number) => void
  /** The screen closed. `chosen` says which way: a career was picked (the
   * held plaque should leave), or the player backed out (the pig menu's rows
   * should come back onto it). */
  onClosed: (chosen: boolean) => void
}): CareerPath {
  let bank: Bank = SILENT
  let slot = 0
  let selection = 0
  let open = false
  /** The lit icon's blink — `[0x512EB0]` flips sign every frame, so the icon
   * is hidden on alternate ticks. */
  let blink = false

  const close = (chosen: boolean): void => {
    // No leave sound is read for kind 13 — the close is silent
    // (`[CHECK — remake]`), the choice having already paid with `Promo`.
    open = false
    handlers.onClosed(chosen)
  }

  return {
    open(pig) {
      slot = pig
      selection = 0
      blink = false
      open = true
    },
    reset() {
      open = false
    },
    state: () => (open ? 'open' : 'closed'),
    handle(action) {
      if (!open) return
      if (action === 'menuUp') {
        selection = (selection + 3) % 4
        bank.play(MOVE.name, { gain: MOVE.gain })
      } else if (action === 'menuDown') {
        selection = (selection + 1) % 4
        bank.play(MOVE.name, { gain: MOVE.gain })
      } else if (action === 'menuSelect') {
        const way = promotionsFrom(GRUNT)[selection]
        if (!way) return
        if (!handlers.pick(slot, way.to)) {
          bank.play(CRUNCH.name, { gain: CRUNCH.gain })
          return
        }
        bank.play(PROMO.name, { gain: PROMO.gain })
        handlers.onSpent(way.cost)
        close(true)
      } else if (action === 'menuBack') close(false)
    },
    tick() {
      blink = !blink
    },
    draw(context, sprites, lit) {
      if (!open) return
      const centred = (text: string, box: { x: number; y: number; width: number }): void =>
        lit.draw(context, text, Math.round(box.x + (box.width - lit.measure(text)) / 2), box.y)
      centred(feText(TITLE_TEXT), TITLE)
      centred(feText(ROW_TEXT + selection), NAME)
      ICONS.forEach((name, i) => {
        if (i === selection && blink) return
        context.drawImage(sprites.get(name).image, ICON.x + ICON.step * i, ICON.y)
      })
    },
    use(it) {
      bank = it
    },
    selected: () => selection,
    labels: () => ICONS.map((_, i) => feText(ROW_TEXT + i)),
    values: () => ICONS.map(() => null),
    flipping: () => false
  }
}
