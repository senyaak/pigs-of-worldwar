// The one DIAL of docs/ai.md's difficulty ramp: how well the machine thinks
// on this map, 0..1.
//
// The axis is the CAMPAIGN POSITION over a scale of 26, and the ramp is
// SMOOTH — every map a little smarter than the one before, `[play]`: "я бы
// хотел каждый уровень чуть чуть поумнее" — where the turn TIMER steps per
// island (lib/game/turns.ts keeps its own table). Position 1, the first
// fight, thinks at 1/26 — a LITTLE, never zero, `[play]`: "яб не делал 0 —
// яб делал 1/26". The campaign's own final, Team Lard at position 25, is
// 25/26 — because THE TOP OF THE SCALE IS RESERVED: `[play]`, after the
// campaign is beaten it is played again against the secret PURPLE faction,
// and those are the smartest enemies in the game. That second pass does not
// exist here yet; when it does, it plays at LARD_WITS — the full 1.
//
// This dial does not pick behaviours: it slides the brain's own weights —
// today the crate APPETITE (lib/game/evaluate.ts), tomorrow the estimate
// error, the horizon, the memory (docs/ai.md's knob table). One brain,
// turned up.

import { CAMPAIGN_LENGTH, campaignPosition } from './missions'

/** What a map OUTSIDE the campaign plays at — the skirmish arenas, until
 * they grow a picker of their own. `[deliberate]`. */
export const ARENA_WITS = 0.5

/** The reserved top of the scale: the secret faction's second pass, the day
 * it exists. `[play]`. */
export const LARD_WITS = 1

/** The machine's wits on this map, 0..1. */
export function witsFor(map: string): number {
  const position = campaignPosition(map)
  if (position < 0) return ARENA_WITS
  // CAMP sits at 0/26 and fields no enemies, so its zero is never felt.
  return position / CAMPAIGN_LENGTH
}
