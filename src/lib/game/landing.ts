// What a FLYING pig's contact with the ground does besides bounce: the rungs of
// the exe's impact handler, 0x470d10 (`movement/landing.md`).
//
// Every rung asks the one arrival speed, truncated to a whole exe unit a frame
// (0x4ae390 sets the FPU to chop), so "over 75" starts at 76. The two rungs that
// move the body, the eject under 50 and the bounce at 25, are in `fly`
// (lib/game/locomotion.ts); these three are what is seen, heard and felt:
//
// - over 75 a ring of dust, and over 25 the thud, both behind one gate:
//   `[pig+0x1b2]`, a byte the pig update counts up every frame and the thud
//   zeroes, must be over 2. So a chain of contacts is heard every third frame at
//   most. The byte wraps at 256 and shuts the gate for three frames in each lap;
//   that accident is not kept.
// - with the thud the ground's scuff, on a landscape contact only (0x4711b3): an
//   object's contact has the thud alone.
// - over 70 the pig is winded by 60, gate or no gate.
//
// Pure: a pig, a locomotion state, an emit.

import { FRAME_SECONDS, fromExeSpeed } from './ballistics'
import type { Emit } from './events'
import type { Pig } from './game'
import type { LocomotionState } from './locomotion'

/** The dust starts past 75 (0x471052). */
export const DUST_SPEED = fromExeSpeed(0x4b + 1)
/** The thud starts past 25 (0x471158), so a contact of exactly 25 bounces in
 * silence: the fork's own 25 includes it (0x4711d8). */
export const THUD_SPEED = fromExeSpeed(0x19 + 1)
/** Winded past 70 (0x471325). */
export const WINDED_SPEED = fromExeSpeed(0x46 + 1)

/** `[pig+0x1b2] > 2`: three of the pig update's frames, the clock the wedge and
 * the flying conversion count on too (0x46cbd7). */
export const THUD_QUIET_SECONDS = 3 * FRAME_SECONDS

/** What that costs: 60 on the counter (0x47132b). */
export const LANDING_EXERTION = 0x3c
/** The counter's own clamp, 0..300 (0x46DCB2, `movement/walk-speed.md`). */
export const EXERTION_MAX = 300

/** The thud's loudness: a tenth of the arrival, up to 60 (0x471166..0x471181). */
export const thudVolume = (speed: number): number =>
  Math.min(0x3c, Math.floor((speed * FRAME_SECONDS) / 10))

/** The ladder's three rungs, for the contact `fly` recorded (`LocomotionState`). */
export function answerLanding(
  pig: Pig,
  state: LocomotionState,
  landed: NonNullable<LocomotionState['impact']>,
  emit: Emit
): void {
  if (landed.speed >= THUD_SPEED && state.thudQuiet <= 0) {
    state.thudQuiet = THUD_QUIET_SECONDS
    emit({
      kind: 'thudded',
      at: { ...pig.position },
      volume: thudVolume(landed.speed),
      surface: landed.onObject ? null : landed.surface,
      dust: landed.speed >= DUST_SPEED
    })
  }
  if (landed.speed >= WINDED_SPEED) {
    pig.exertion = Math.min(EXERTION_MAX, pig.exertion + LANDING_EXERTION)
  }
}
