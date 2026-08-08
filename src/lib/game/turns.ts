// How long a turn lasts, which is the LEVEL's business and not a constant.
//
// The exe reads it out of a 27-entry table at 0x4d1860 indexed by the level
// number and multiplies by 100 into the clock (0x4309f1..0x430a01):
//
//   levels 0-2   99 seconds
//   levels 3-6   60
//   levels 7-17  45
//   levels 18-23 30
//   level  24    15
//   level  25    30
//   level  26    99
//
// which is also why the dashboard's clock has exactly two digit windows:
// 99 is the most it can ever show.
//
// Derivation: turns/notes.md.

import { DEFAULT_TURN_SECONDS } from './game'

/**
 * The campaign's turn lengths in level order, straight off the table.
 *
 * Kept whole even though only the first entry can be spent yet, because the
 * shape is the finding — a campaign that starts generous and tightens to
 * fifteen seconds at level 24 — and half a table would read as a guess.
 */
export const TURN_SECONDS_BY_LEVEL: readonly number[] = [
  99, 99, 99, 60, 60, 60, 60, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 30, 30, 30, 30, 30, 30,
  15, 30, 99
]

/**
 * Which map is which LEVEL is not decoded — the map name comes from its own
 * array indexed by a different counter (`turns/notes.md`)
 * — so this is what can be said by name, and no more.
 *
 * CAMP is the training ground, so it is level 0, so it is 99 seconds. Every
 * other map falls back to the campaign's most common length until the level
 * order is read; that is a KNOWN GAP, not a decision, and the moment the
 * link turns up this becomes the whole table.
 */
const BY_MAP: Record<string, number> = {
  CAMP: TURN_SECONDS_BY_LEVEL[0]
}

/** Seconds on the clock for a map, by its archive name (`CAMP`, `LIBERATE`). */
export const turnSecondsFor = (map: string): number =>
  BY_MAP[map.toUpperCase()] ?? DEFAULT_TURN_SECONDS
