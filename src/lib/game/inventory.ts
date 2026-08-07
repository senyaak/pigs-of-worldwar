// What a pig is carrying.
//
// The exe's own shape, read off `Pig::GiveSkill` at 0x465425 — the function
// whose debug print is "Giving skill %d (%d)":
//
//     pig+0x2E8            how many slots are in use, a BYTE
//     pig+0x234 + i*12     slot i's skill id
//     pig+0x238 + i*12     slot i's amount
//     pig+0x23C + i*12     a byte, set to 1 when the slot is filled
//
// so a pig carries at most FIFTEEN skills (`cmp al,0Fh; jge` at 0x465787
// refuses a sixteenth), and picking up something it already has adds to that
// slot instead of taking a new one.
//
// An amount of −1 is UNLIMITED, and it is contagious: a slot already at −1
// stays there, and anything given while the training flag is up arrives as
// −1 (0x465625). On the training ground nothing runs out, which is what
// makes it a place to practise.
//
// Pure: it is a list of numbers and the rules for adding to it.

/** The most skills a pig can carry (exe 0x465787). */
export const MAX_SLOTS = 15

/** An amount that never runs down. */
export const UNLIMITED = -1

export interface Slot {
  /** Skill id — lib/game/skills.ts names them. */
  skill: number
  /** How many are left, or UNLIMITED. */
  amount: number
}

/** What happened when something was offered to a pig. */
export type GiveResult =
  /** A new slot was taken. */
  | 'taken'
  /** Added to a slot the pig already had. */
  | 'stacked'
  /** The pig already had it, unlimited: nothing to add. */
  | 'already'
  /** Fifteen slots, all full: the pig has too many toys already. */
  | 'full'

/**
 * Give a pig `amount` of `skill`, in place.
 *
 * The order is the exe's: look for a slot with this skill first and add to
 * it, and only take a new slot if there is none. `UNLIMITED` given, or
 * already held, wins over any count.
 */
export function give(slots: Slot[], skill: number, amount: number): GiveResult {
  const held = slots.find((slot) => slot.skill === skill)
  if (held) {
    if (amount === UNLIMITED) {
      const was = held.amount
      held.amount = UNLIMITED
      return was === UNLIMITED ? 'already' : 'stacked'
    }
    // A slot that never runs down cannot be topped up.
    if (held.amount === UNLIMITED) return 'already'
    held.amount += amount
    return 'stacked'
  }
  if (slots.length >= MAX_SLOTS) return 'full'
  slots.push({ skill, amount })
  return 'taken'
}

/** How many of `skill` a pig holds: 0 if none, UNLIMITED if endless. */
export function amountOf(slots: Slot[], skill: number): number {
  return slots.find((slot) => slot.skill === skill)?.amount ?? 0
}

/** Spend one of `skill`. Unlimited slots never run down; a slot that hits
 * zero is dropped, which is what leaves the pig with nothing to select. */
export function spend(slots: Slot[], skill: number): boolean {
  const index = slots.findIndex((slot) => slot.skill === skill)
  if (index < 0) return false
  const slot = slots[index]
  if (slot.amount === UNLIMITED) return true
  if (slot.amount <= 0) return false
  slot.amount -= 1
  if (slot.amount === 0) slots.splice(index, 1)
  return true
}
