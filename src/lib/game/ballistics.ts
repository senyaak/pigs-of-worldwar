// Getting unstuck, and bouncing. Pure, like the rest of lib/game.
//
// A pig pressed into a wall is not simply stopped in the original. Every
// frame `Pig::UpdateGroundState` (exe VA 0x46fd50) sees it standing inside
// the wall it eases the pig's friction DOWN and its bounciness UP; the pig
// update (0x46c8f0) counts those frames, and once there are more than 25 it
// calls `Pig::EjectFromWall` (0x46fbd0): lift 100 units, face away from the
// wall, hop out, and fall. Landing on 0.85 bounciness instead of the usual
// 0.65 is what makes that read as coming off the wall with a bounce rather
// than a step. Stay wedged for 250 frames and the pig dies, crushed.
//
// Derivation and addresses: ../../../../pigs-disasm/movement/notes.md.

/** The exe keeps these as 1/4096 fixed point; here they are the fractions. */
const FIXED = 4096

/** Standing on open ground (exe 0x400 / 0xa66). */
export const FRICTION_FREE = 0x400 / FIXED
export const RESTITUTION_FREE = 0xa66 / FIXED
/** Wedged in a wall (exe 0x266 / 0xd99) — slipperier and far bouncier. */
export const FRICTION_STUCK = 0x266 / FIXED
export const RESTITUTION_STUCK = 0xd99 / FIXED
/** Per frame, easing between the two (exe 0x15e / 0x199). */
const FRICTION_STEP = 0x15e / FIXED
const RESTITUTION_STEP = 0x199 / FIXED

/** Below this bounciness a landing does not bounce at all (exe 0xcc). */
export const RESTITUTION_MIN = 0xcc / FIXED

/**
 * The original counts logic frames, not seconds. Its rate is not in the
 * disassembly; 12.5 Hz is the PlayStation-era figure that puts the 25-frame
 * eject at the two seconds the game visibly takes. Treat as calibration,
 * not as a finding.
 */
export const FRAME_SECONDS = 1 / 12.5
/** Frames wedged in a wall before the pig is thrown out (exe `cmp eax,19h`). */
export const EJECT_SECONDS = 25 * FRAME_SECONDS
/** …and before it is crushed instead (exe `cmp eax,0FAh`). Not modelled yet:
 * there is no damage system to kill it with. */
export const CRUSH_SECONDS = 250 * FRAME_SECONDS

/** How far the eject lifts the pig first (exe `add eax,64h`). */
export const EJECT_LIFT = 100
/** The hop's angle above the horizontal (exe pitch 0x3b6 of 0x1000). */
export const EJECT_PITCH = ((0x3b6 / FIXED) * Math.PI) / 2

export interface Bounciness {
  friction: number
  restitution: number
}

export const FREE: Bounciness = { friction: FRICTION_FREE, restitution: RESTITUTION_FREE }

/**
 * How bouncy the pig is after `seconds`: sliding towards the wedged values
 * while `inWall`, back to the free ones once it is out and back on its feet.
 *
 * The exe gates the snap-back on a pig flag at +0x21c that is not decoded
 * yet; holding the raised values until the landing is what produces the
 * bounce that comes off a wall, so `settled` is the caller's stand-in.
 */
export function easeBounciness(current: Bounciness, inWall: boolean, settled: boolean, seconds: number): Bounciness {
  if (!inWall) return settled ? FREE : current
  const frames = seconds / FRAME_SECONDS
  const towards = (value: number, target: number, step: number): number =>
    value < target ? Math.min(target, value + step * frames) : Math.max(target, value - step * frames)
  return {
    friction: towards(current.friction, FRICTION_STUCK, FRICTION_STEP),
    restitution: towards(current.restitution, RESTITUTION_STUCK, RESTITUTION_STEP)
  }
}

/**
 * The upward speed a landing at `impact` bounces back with, or 0 for a
 * landing that just stops.
 *
 * The exe computes `(impact >> 3) * restitution / 4096`. That `>> 3` is a
 * conversion between its impact measure and its launch speed, two units
 * neither of which is ours, so only the restitution carries over — applied
 * here to our own vertical speed.
 */
export function bounceSpeed(impact: number, restitution: number): number {
  return restitution > RESTITUTION_MIN ? impact * restitution : 0
}
