// The one DIAL of docs/ai.md's difficulty ramp: how well the machine thinks
// on this map, 0..1.
//
// The axis is the CAMPAIGN POSITION, and the ramp is per ISLAND: it creeps
// across the five maps of one, and JUMPS when a new one opens. `[play]`,
// 2026-08-24 — "важно чтобы тупые умнели постепенно; я б брал: каждый
// остров растёт медленно, а новый остров — буст" — which replaces the flat
// n/26 this file used to run. Both readings agree that every map is a
// little smarter than the last ("я бы хотел каждый уровень чуть чуть
// поумнее"); the islands are what shape the little.
//
// Position 1, the first fight, thinks at 1/26 — a LITTLE, never zero,
// `[play]`: "яб не делал 0 — яб делал 1/26". The campaign's own final, Team
// Lard at position 25, is 25/26 — because THE TOP OF THE SCALE IS RESERVED:
// `[play]`, after the campaign is beaten it is played again against the
// secret PURPLE faction, and those are the smartest enemies in the game.
// That second pass does not exist here yet; when it does, it plays at
// LARD_WITS — the full 1. So the curve is pinned at both ends and the
// islands only decide the shape between them.
//
// The islands are the pig map's own regions (lib/game/pigmap.ts,
// `regionOf`), which is where the turn TIMER also steps — one fewer thing
// for the campaign to disagree with itself about.
//
// This dial does not pick behaviours: it slides the brain's own weights —
// today the crate APPETITE (lib/game/evaluate.ts), tomorrow the estimate
// error, the horizon, the memory (docs/ai.md's knob table). One brain,
// turned up.

import { CAMPAIGN_LENGTH, campaignPosition } from './missions'
import { regionOf } from './pigmap'

/** What a map OUTSIDE the campaign plays at — the skirmish arenas, until
 * they grow a picker of their own. `[deliberate]`. */
export const ARENA_WITS = 0.5

/** The reserved top of the scale: the secret faction's second pass, the day
 * it exists. `[play]`. */
export const LARD_WITS = 1

/**
 * How much a NEW ISLAND is worth against one more map of the same island —
 * four ordinary steps to one. `[play]` for the shape ("каждый остров растёт
 * медленно, а новый остров — буст"), `[deliberate]` for the number, and it
 * is the only knob this curve has: raise it and the campaign feels like six
 * difficulty settings, lower it toward 1 and the old flat ramp comes back.
 */
export const ISLAND_STEP = 4

/** The first campaign fight, and the campaign's own last — the two ends the
 * shape is nailed to whatever the knob does (see the header). */
const FIRST_WITS = 1 / CAMPAIGN_LENGTH
const LAST_WITS = (CAMPAIGN_LENGTH - 1) / CAMPAIGN_LENGTH

/**
 * The RAMP as a ladder of steps: one rung per mission after the first, a
 * plain rung inside an island and an `ISLAND_STEP` rung where a new one
 * opens. Built once and normalised, so both ends land exactly on
 * `FIRST_WITS` and `LAST_WITS` however the knob is turned.
 */
const RAMP: readonly number[] = ((): number[] => {
  const last = CAMPAIGN_LENGTH - 1
  const steps: number[] = [0]
  for (let position = 2; position <= last; position++) {
    steps.push(regionOf(position) === regionOf(position - 1) ? 1 : ISLAND_STEP)
  }
  const total = steps.reduce((sum, one) => sum + one, 0)
  let walked = 0
  return steps.map((step) => {
    walked += step
    return FIRST_WITS + ((LAST_WITS - FIRST_WITS) * walked) / total
  })
})()

/** The machine's wits on this map, 0..1. */
export function witsFor(map: string): number {
  const position = campaignPosition(map)
  if (position < 0) return ARENA_WITS
  // CAMP fields no enemies, so its zero is never felt.
  if (position <= 0) return 0
  return RAMP[position - 1] ?? LAST_WITS
}
