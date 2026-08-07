// The drop-in that opens a level: a squad falling onto its own spawn markers
// under canopies. Pure, like the rest of lib/game — the battle scene asks it
// for a height once a frame and draws that.
//
// The whole of it is the original's, and it is smaller than it looks. The
// object loader's closing pass (exe 0x4a6704) lifts every marker-flagged pig
// 3072–3583 units above where it was going to stand and calls
// `Pig::StartParachuting` (0x4716c0), which zeroes the velocity, takes the
// FALLING force off the body and puts the parachute one on. The pig update's
// parachute branch (0x46ed23) then does nothing but advance the clip: no
// input, no steering, and the force's target has no horizontal part, so the
// pig comes straight down onto its marker. The landing (0x4717d0) swaps the
// forces back, drops the canopy and plays one clip.
//
// Derivation, addresses and the proof that the bit means this:
// ../../../pigs-disasm/parachute/notes.md

import { FRAME_SECONDS, fromExeSpeed } from './ballistics'
import { DRAG_TAU } from './locomotion'
import { fromExeY } from './terrain'

/**
 * How far above its marker a pig starts: the exe's `y + 0xC00 + (rand &
 * 0x1FF)`, so 3072 units and up to 511 more.
 *
 * Vertical, so it goes through `fromExeY` like every other height lifted out
 * of the exe — which halves it, because the exe doubles the PMG's heights
 * and the remake does not (`lib/game/terrain.ts`). The pig starts about
 * three tiles up rather than six.
 *
 * The SPEED below does not halve, because `TERMINAL_FALL` does not either:
 * every speed in the remake is `fromExeSpeed` alone. So the descent is
 * quicker against this terrain than the original's was against its own — the
 * same trade `HEIGHT_SCALE` already makes for every fall, not a new
 * decision, and not a thing to fix here. It works out at **five seconds**
 * from 1536 units and five and a half from the far end of the spread.
 */
export const DROP_HEIGHT = fromExeY(0xc00)
/** The spread on top of it — `rand & 0x1FF`, so a pig lands a beat before or
 * after the pig beside it rather than the whole squad touching down at once. */
export const DROP_SPREAD = fromExeY(0x200)

/**
 * The canopy's terminal velocity and the time constant it approaches it
 * over: the world's third force generator, `(50 - v)/51` a frame
 * (`[world+0x18]`, exe 0x414f50), which `StartParachuting` swaps in for the
 * `(320 - v)/32` a free fall gets.
 *
 * A speed, so it goes through `fromExeSpeed` alone — the same reading
 * `TERMINAL_FALL` takes.
 */
export const CHUTE_TERMINAL = fromExeSpeed(50)
export const CHUTE_TAU = 51 * FRAME_SECONDS

/** A pig on its way down. Game space, Y-down: `y` is the FEET, as
 * `LocomotionState.y` is, and smaller means higher. */
export interface DropState {
  y: number
  /** Downward speed, units a second. `StartParachuting` zeroes it. */
  vy: number
  landed: boolean
}

/**
 * A drop onto ground at `groundY`. `roll` is the exe's `rand & 0x1FF` as a
 * fraction — passed in rather than taken, so a spec can drop a whole squad
 * from one height and the scene can stagger it.
 */
export function createDrop(groundY: number, roll: number): DropState {
  return { y: groundY - DROP_HEIGHT - roll * DROP_SPREAD, vy: 0, landed: false }
}

/**
 * One frame of descent. The integrator is the one `locomotion.fly` uses —
 * the force toward the terminal velocity, plus the engine's own `v -= v/128`
 * drag — with the parachute's constants instead of the fall's.
 */
export function updateDrop(drop: DropState, groundY: number, delta: number): void {
  if (drop.landed) return
  drop.vy += ((CHUTE_TERMINAL - drop.vy) / CHUTE_TAU - drop.vy / DRAG_TAU) * delta
  drop.y += drop.vy * delta
  if (drop.y < groundY) return
  // Hitting the landscape is the whole of the landing — there is no bounce
  // to ride out, because the exe's own handler turns parachuting off and
  // snaps the pig to the ground under it.
  drop.y = groundY
  drop.vy = 0
  drop.landed = true
}
