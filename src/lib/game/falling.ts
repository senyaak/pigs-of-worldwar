// What a HARD LANDING costs — fall damage, read end to end (2026-08-27).
//
// The exe's pig has three airborne regimes, and only ONE of them can be hurt
// by the ground. A plain jump or step-off (`+0x1fd`) lands through 0x470910,
// which has no damage code at all; a PARACHUTE (`+0x225`) lands through
// 0x4717d0, none either — the campaign drop-in is exempt STRUCTURALLY, and
// cutting the canopy deliberately leaves the flag set. What can be hurt is
// FLYING (`+0x21c`, clip 38): a pig thrown by anything, a pig ejected from a
// wall — and a plain fall that has lasted more than 25 frames, which 0x46e95d
// converts (with a yelp) into the flying state mid-drop.
//
// The damage arm is `0x4aa010`, two call sites in the whole image: the
// landscape hit at 0x477282 (threshold 200) and the object hit at 0x477713
// (threshold 250). Read to its ret: the impact speed — `[hit+0x14]`, the full
// length of the relative velocity per frame — is only the GATE; the damage is
// FLAT, `threshold/50` points (200·1/50 = 4, snapped to 508/128ths by a
// divide-through-127 dance), kind 4, with sound 0x47 over it. Water tiles and
// a handful of object types are skipped at the call sites. So: a qualifying
// contact costs four points, a soft one nothing, and a chain of hard bounces
// is charged per bounce.
//
// The remake folds the object case into the landscape's (one gate of 200 —
// the 250 object threshold is noted and not built; a roof landing here is
// rare and reads the same). The full read is `movement/falling.md` in the
// disasm repo.
//
// Pure: a pig, a locomotion state, an emit.

import { fromExeSpeed } from './ballistics'
import { hurt, isDead } from './health'
import { originY } from './body'
import type { LocomotionState } from './locomotion'
import type { Emit } from './events'
import type { Pig } from './game'

/**
 * The GATE: the arrival speed a landing must exceed to cost anything —
 * `cmp` against 0xc8 at 0x4aa02c, per frame, so `fromExeSpeed` like every
 * other speed in the engine. It is the same 200 the hardest knock is capped
 * at (lib/game/blast.ts FLING_CAP), which is the exe's own economy: a blast
 * can throw you exactly hard enough to get hurt coming down.
 */
export const FALL_GATE = fromExeSpeed(200)

/**
 * …and the FLAT price of crossing it: `(200 · 1 / 50) << 7`, then the
 * arm's divide-through-127 leaves 508 of 128ths — 3.97 points, kind 4.
 * The impact speed never scales it.
 */
export const FALL_POINTS = 508 / 128

/**
 * Take the landing recorded on `state` (lib/game/locomotion.ts `fly` writes
 * one per ground contact) and charge it if it qualifies: a FLYING body,
 * arriving harder than the gate. Clears the record either way, so a caller
 * may run every frame.
 */
export function chargeLanding(
  pig: Pig,
  state: LocomotionState,
  training: boolean,
  emit: Emit
): void {
  const landed = state.impact
  if (!landed) return
  state.impact = null
  if (!landed.flying || landed.speed <= FALL_GATE) return
  // A corpse slamming down is not hurt again — it has nothing to lose, and
  // the exe's own arm goes through TakeDamage, which a dead pig's death path
  // has already run.
  if (isDead(pig)) return
  const outcome = hurt(pig, FALL_POINTS, training)
  emit({
    kind: 'damaged',
    at: { x: pig.position.x, y: originY(pig.position.y, pig.body), z: pig.position.z },
    amount: Math.round(FALL_POINTS),
    pig: pig.id
  })
  // Kind 4 is gib-capable in the exe, and four points never reach the line.
  if (outcome === 'died') emit({ kind: 'killed', pig: pig.id })
}
