// THE PIG MENU — record 19, kind 6: PROMOTE / SWAP POSITION / RENAME.
//
// It is an OVERLAY, not a screen: the squad screen stays up and DIMS behind it
// (120 → 80 at 4 a tick in the exe) while the `swap` plaque — a sign on two
// posts — springs up from below the screen. Read end to end 2026-08-18
// (`frontend/notes.md`): the plaque at x 180 riding `2·scaleY` of one spring
// cell, the `swap01..03` medallion sliding 16 px a widget-frame down the rows
// and blinking script 1006 at rest, and the three words on their own boxes,
// which do NOT ride the box — they stand while the plaque rises under them.
//
// The PROMOTE row carries the pig's own price — fetext 71 + the `vp` token
// icon and the cost off the tree, or `-` for a HERO, which has no way up. The
// medallion is the whole highlight: the rows never change colour.
//
// This module owns the box's motion and its choices; what a choice DOES to
// the save is the composition root's (`main.ts` → `lib/game/promotion.ts`),
// handed in as answers so the menu knows which sound to make and whether to
// stay open.

import { widget, type Script } from './frames'
import { launch, spring, still } from './springs'
import type { SpriteSet } from './sprites'
import type { Font } from './font'
import { SILENT, type Bank } from '../audio/bank'
import { feText } from './barScreen'
import { promotionsFrom } from '../../../lib/game/ranks'

/** fetext: the three rows. The title (70) is blank and the exe draws none. */
const ROW_TEXT = [71, 72, 73]

/** What answering PROMOTE did — decided by the composition root, which holds
 * the save. `cost` rides `promoted` for the floating spend number. */
export type PromoteResult =
  | { kind: 'none' }
  | { kind: 'refused' }
  | { kind: 'promoted'; cost: number }
  | { kind: 'career' }

/**
 * The box's y — `[0x512960]`, parked at 500 below the screen, sprung to 0 and
 * launched back (0x41FD30 / 0x41FE20). Everything but the words rides
 * `2·scaleY` of it.
 */
const PARKED = 500
const ENTER_SPRING = { gain: 12, damping: 20, cap: 40 }
const LEAVE_LAUNCH = { accel: 14, cap: 70 }

/** The plaque: `swap` rows 0..245 at x 180, resting y 260. (The arm's third
 * blit — the same rows 212..245 a plaque-height lower — is dead art, below
 * the screen in every reachable state, and is not drawn.) */
const PLAQUE = { x: 180, y: 260, rows: 245 }

/** The medallion: x 230, y 347 + 16 a widget-frame, the frame walked to
 * 2·selected one step a tick — so a move slides it in two visible steps. */
const MEDALLION = { x: 230, y: 347, step: 16 }

/** The three words' boxes, folded to pixels (kind 6's item boxes 32..34). */
const ROWS = [
  { x: 232, y: 357, width: 206 },
  { x: 232, y: 389, width: 206 },
  { x: 232, y: 422, width: 206 }
]

/** Between the PROMOTE words, the token icon and the price. `[CHECK — remake]`
 * — the exe composes `"  /0/S %d"` and its icon gap is the markup writer's. */
const PRICE_GAP = 6

/** Script 1006 on the medallion — `swap02`/`swap03` five ticks a side. While
 * the medallion is WALKING it wears `swap01`, the dim shade, instead. */
const MEDALLION_BLINK: Script = {
  beats: [
    [1, 5],
    [2, 5]
  ],
  loop: true
}
const SHADES = ['swap01', 'swap02', 'swap03']

/** The click of the medallion arriving on a row — the builder's own
 * (0x41F863), the same `click1` at 60 the menu dial makes. */
const ARRIVE = { name: 'CLICK1', gain: 0.6 }
/** Opening and every close — kind 6's arrive (60) and leave (100) sounds. */
const STEAM = 'STEAM1'
/** The promotion paid (80), and the refusal (100). */
const PROMO = { name: 'PROMO', gain: 0.8 }
const CRUNCH = { name: 'CRUNCH', gain: 1.0 }
/** CAREER PATH (kind 13) arriving — `hiss2` at 100. */
const HISS = { name: 'HISS2', gain: 1.0 }

export interface PigMenu {
  /** Open over the squad, always on PROMOTE — `[+0x0C]=0`, the exe's reset. */
  open(slot: number, rank: number): void
  /** Gone at once, no leave and no handler — the squad screen re-entering. */
  reset(): void
  /** 'closed' is not on screen at all; the squad routes input here otherwise. */
  state(): 'arriving' | 'here' | 'leaving' | 'closed'
  handle(action: string): void
  tick(): void
  draw(context: CanvasRenderingContext2D, sprites: SpriteSet, plain: Font): void
  use(bank: Bank): void
  /** The e2e window: the three rows, PROMOTE's price on the first. */
  selected(): number
  labels(): string[]
  values(): (string | null)[]
  flipping(): boolean
}

export function initPigMenu(handlers: {
  promote: (slot: number) => PromoteResult
  /** The menu has left on SWAP POSITION: the squad arms the second pick. */
  onSwap: (slot: number) => void
  /** The menu has left on RENAME: the name entry opens. */
  onRename: (slot: number) => void
  /** A promotion was paid — the squad shows the floating spend. */
  onSpent: (cost: number) => void
  /** GRUNT's four ways: the menu has left and CAREER PATH takes its place. */
  onCareer: (slot: number) => void
}): PigMenu {
  let bank: Bank = SILENT
  let slot = 0
  let rank = 0
  let selection = 0
  let phase: 'arriving' | 'here' | 'leaving' | 'closed' = 'closed'
  let after: (() => void) | null = null
  const y = still(PARKED)
  /** Widget 16 — the medallion's row, in frames of 8 raw = 16 px. */
  const row = widget(0)
  /** Widget 17 — its shade: 0 sliding, the blink at rest. */
  const shade = widget(1)

  /** What the lit pig's promotion costs, or null for a HERO. All the menu
   * needs for its own row is the number — the decision is the handler's. */
  const price = (): number | null => {
    const ways = promotionsFrom(rank)
    return ways.length > 0 ? Math.min(...ways.map((way) => way.cost)) : null
  }

  const close = (then: (() => void) | null): void => {
    phase = 'leaving'
    after = then
    bank.play(STEAM, { gain: 1.0 })
  }

  const choose = (): void => {
    if (selection === 0) {
      const result = handlers.promote(slot)
      if (result.kind === 'refused') bank.play(CRUNCH.name, { gain: CRUNCH.gain })
      else if (result.kind === 'promoted') {
        bank.play(PROMO.name, { gain: PROMO.gain })
        handlers.onSpent(result.cost)
        close(null)
      } else if (result.kind === 'career') {
        bank.play(HISS.name, { gain: HISS.gain })
        close(() => handlers.onCareer(slot))
      }
      // 'none' — a HERO: the exe's arm falls through to nothing at all.
      return
    }
    if (selection === 1) {
      // The action's own steam over the close's, the exe's double.
      bank.play(STEAM, { gain: 1.0 })
      close(() => handlers.onSwap(slot))
      return
    }
    bank.play(HISS.name, { gain: HISS.gain })
    close(() => handlers.onRename(slot))
  }

  const step = (by: number): void => {
    selection = (selection + by + ROWS.length) % ROWS.length
    row.goTo(2 * selection)
    shade.set(0)
  }

  /** The plaque's furniture — the medallion and the three words — kept a
   * function of its own so a refusal to draw part of a frame can never take
   * the rest with it (CLAUDE.md's bare-return trap). */
  const furniture = (
    context: CanvasRenderingContext2D,
    sprites: SpriteSet,
    plain: Font,
    ride: number
  ): void => {
    const medallion = sprites.get(SHADES[row.walking() ? 0 : shade.frame()] ?? SHADES[0])
    context.drawImage(
      medallion.image,
      MEDALLION.x,
      MEDALLION.y + MEDALLION.step * row.frame() + ride
    )

    // The words stand still — they do not ride the box. All three wear the
    // plain shade; the medallion is the highlight.
    ROWS.forEach((box, i) => {
      if (i === 0) {
        const cost = price()
        const label = feText(ROW_TEXT[0])
        const tail = cost === null ? '-' : String(cost)
        const icon = cost === null ? null : sprites.get('vp')
        const width =
          plain.measure(label) +
          PRICE_GAP * 2 +
          (icon ? icon.width + PRICE_GAP : 0) +
          plain.measure(tail)
        let x = Math.round(box.x + (box.width - width) / 2)
        plain.draw(context, label, x, box.y)
        x += plain.measure(label) + PRICE_GAP * 2
        if (icon) {
          context.drawImage(icon.image, x, box.y - 2)
          x += icon.width + PRICE_GAP
        }
        plain.draw(context, tail, x, box.y)
        return
      }
      const label = feText(ROW_TEXT[i])
      plain.draw(
        context,
        label,
        Math.round(box.x + (box.width - plain.measure(label)) / 2),
        box.y
      )
    })
  }

  return {
    open(pig, pigRank) {
      slot = pig
      rank = pigRank
      selection = 0
      y.value = PARKED
      y.velocity = 0
      phase = 'arriving'
      after = null
      row.set(0)
      shade.play(MEDALLION_BLINK)
      // The open is `steam1` at 60 (0x4200D8); the click that asked for it is
      // the squad screen's own.
      bank.play(STEAM, { gain: 0.6 })
    },
    reset() {
      phase = 'closed'
      after = null
    },
    state: () => phase,
    handle(action) {
      if (phase === 'closed' || phase === 'leaving') return
      if (action === 'menuUp') step(-1)
      else if (action === 'menuDown') step(1)
      else if (action === 'menuSelect') choose()
      else if (action === 'menuBack') close(null)
    },
    tick() {
      if (phase === 'arriving') {
        if (spring(y, 0, ENTER_SPRING)) phase = 'here'
      } else if (phase === 'leaving') {
        if (launch(y, PARKED, LEAVE_LAUNCH)) {
          phase = 'closed'
          const go = after
          after = null
          if (go) go()
        }
      }
      if (row.tick() && !row.walking()) {
        shade.play(MEDALLION_BLINK)
        bank.play(ARRIVE.name, { gain: ARRIVE.gain })
      }
      shade.tick()
    },
    draw(context, sprites, plain) {
      if (phase === 'closed') return
      // The exe's own fold: everything but the words rides 2·scaleY(y).
      const ride = 2 * Math.trunc((y.value * 480) / 820)

      const plaque = sprites.get('swap')
      context.drawImage(
        plaque.image,
        0, 0, plaque.width, PLAQUE.rows,
        PLAQUE.x, PLAQUE.y + ride, plaque.width, PLAQUE.rows
      )

      furniture(context, sprites, plain, ride)
    },
    use(it) {
      bank = it
    },
    selected: () => selection,
    labels: () => ROW_TEXT.map((id) => feText(id)),
    values: () => {
      const cost = price()
      return [cost === null ? '-' : String(cost), null, null]
    },
    flipping: () => phase !== 'here'
  }
}
