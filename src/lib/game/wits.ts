// The one DIAL of docs/ai.md's difficulty ramp: how well the machine thinks
// on this map, 0..1.
//
// The axis is the CAMPAIGN POSITION, and the ramp is SMOOTH — every map a
// little smarter than the one before, `[play]`: "я бы хотел каждый уровень
// чуть чуть поумнее" — where the turn TIMER steps per island
// (lib/game/turns.ts keeps its own table). Position 1, the first fight, is
// the dumbest machine there is; position 25, Team Lard, is the sharpest.
// CAMP has no enemies at all, so its zero is never felt.
//
// This dial does not pick behaviours: it slides the brain's own weights —
// today the crate APPETITE (lib/game/evaluate.ts), tomorrow the estimate
// error, the horizon, the memory (docs/ai.md's knob table). One brain,
// turned up.

import { CAMPAIGN, MAP_NAMES } from './missions'

/** What a map OUTSIDE the campaign plays at — the skirmish arenas, until
 * they grow a picker of their own. `[deliberate]`. */
export const ARENA_WITS = 0.5

/** The machine's wits on this map, 0..1. */
export function witsFor(map: string): number {
  const position = CAMPAIGN.findIndex((id) => MAP_NAMES[id] === map)
  if (position < 0) return ARENA_WITS
  if (position <= 1) return 0
  return (position - 1) / (CAMPAIGN.length - 2)
}
