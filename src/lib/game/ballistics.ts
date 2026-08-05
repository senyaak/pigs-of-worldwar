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

/**
 * The exe keeps these as 1/4096 fixed point; here they are the fractions.
 * The same 4096 is a FULL TURN for its angles — 0x400 is a right angle, not
 * a straight one.
 */
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
 * The original counts logic frames, not seconds, and its rate is NOT in the
 * disassembly — it imports timeGetTime but reaches it the same indirect way
 * it reaches the animation library, so no call site says how long a frame
 * is. 30 Hz is the console-port figure and the one that matches play; this
 * is the knob to turn if the wait feels wrong, not a finding.
 */
export const FRAME_SECONDS = 1 / 30
/** Frames wedged in a wall before the pig is thrown out (exe `cmp eax,19h`). */
export const EJECT_SECONDS = 25 * FRAME_SECONDS
/** …and before it is crushed instead (exe `cmp eax,0FAh`). Not modelled yet:
 * there is no damage system to kill it with. */
export const CRUSH_SECONDS = 250 * FRAME_SECONDS

/**
 * A jump costs 15 frames before the next one is allowed: `TryJump` refuses
 * under `[esi+1a4h] < 15`, and the pig update recharges that by one a frame.
 * Spending it can go to -5 or -10 rather than 0 depending on `[esi+4ch]`,
 * which is not decoded — so this is the SHORTEST wait the original allows.
 */
export const JUMP_COOLDOWN_SECONDS = 15 * FRAME_SECONDS

/**
 * The hop's angle above the horizontal (exe pitch 0x3b6 of 0x1000).
 *
 * The exe also lifts the pig 100 units before launching (`add eax,64h`), but
 * that is there because ITS pig is standing inside the wall geometry and has
 * to be got out of it first. Ours is stopped against the wall, never in it,
 * so the lift would only be free height.
 */
export const EJECT_PITCH = (0x3b6 / FIXED) * 2 * Math.PI

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
 * landing that just stops: the exe's `(impact >> 3) * restitution / 4096`.
 *
 * That `>> 3` was at first taken for a unit conversion and dropped, on the
 * grounds that the impact measure and the launch speed need not share units.
 * They do: a bounce keeping 85% of its impact sent pigs flying, and pigs
 * bounce on their behinds. It is damping, and the whole formula carries over.
 */
export function bounceSpeed(impact: number, restitution: number): number {
  return restitution > RESTITUTION_MIN ? (impact / 8) * restitution : 0
}

/**
 * What is left of a sliding pig's speed after `seconds` of ground friction.
 *
 * The NUMBERS are the game's: `Pig::SetPhysicsMaterial` (exe 0x467e70)
 * divides both by 4096 and stores them as plain floats on the body, at +0x58
 * and +0x5c. The LAW is not. Whatever consumes them lives in the generic
 * rigid-body solver at 0x40f110 — 5.9 KB that combines two bodies'
 * coefficients (`fld [edi+5ch]; fmul [ebx+5ch]`) and has not been unpicked.
 *
 * So this reads friction as the fraction a frame takes off, which puts the
 * two values in the right order — a pig fresh off a wall at 0.15 slides
 * further than a normal one at 0.25 — and is otherwise a guess. Replace it
 * when 0x40f110 gives up its integrator.
 */
export function slide(speed: number, friction: number, seconds: number): number {
  return speed * Math.pow(1 - friction, seconds / FRAME_SECONDS)
}

/** Below this the slide has stopped and the pig gets up (world units/sec).
 * Invented: the original's own cutoff is inside 0x40f110 with the rest. */
export const SLIDE_STOP = 40

/** Below this closing speed a landing is contact, not a bounce (world
 * units/sec). Ours, like SLIDE_STOP — see bounceOff. */
export const BOUNCE_CUTOFF = 250

export interface Velocity {
  x: number
  y: number
  z: number
}

/**
 * Hitting a surface, by the original's own rigid-body solver (exe 0x40f110,
 * the impulse at 0x40f690):
 *
 * ```
 * e = restitutionA * restitutionB        ; the coefficients MULTIPLY
 * mu = frictionA * frictionB
 * j = -(1 + e) * vn                      ; vn = closing speed along the normal
 * ```
 *
 * So it is NOT the old velocity plus a standard push. Split the velocity at
 * the contact normal: the part ALONG the normal is reflected and scaled by
 * `e` — that is the bounce — while the part ALONG THE SURFACE is kept whole
 * and only friction eats it. Which is why a pig that lands on a slope keeps
 * the speed it arrived with and carries on down it, and why gravity, still
 * pulling every frame after that, makes the slide accelerate.
 *
 * The ground is immovable, so its own coefficients are 1 and the pig's are
 * the product.
 */
export function bounceOff(v: Velocity, normal: Velocity, restitution: number, friction: number): Velocity {
  const vn = v.x * normal.x + v.y * normal.y + v.z * normal.z
  // Leaving the surface already: nothing to respond to.
  if (vn >= 0) return v
  // Below a crawl there is no bounce left, only contact. Without this a
  // discrete step bounces a pig forever: each landing returns a little, the
  // next frame's gravity takes it back, and the pair never quite reaches
  // zero. The original settles bodies with a countdown of its own — the
  // scalar at +0xbc that the solver compares against 0.02 and walks down by
  // 0.005 a step (exe 0x410685) — which is not decoded; this cutoff is ours.
  const e = -vn > BOUNCE_CUTOFF && restitution > RESTITUTION_MIN ? restitution : 0
  // Tangential first, then the reflected normal part on top of it. The exe's
  // `>> 3` damping rides on the normal part alone — see bounceSpeed.
  const keep = Math.max(0, 1 - friction)
  const along = (c: 'x' | 'y' | 'z'): number => (v[c] - vn * normal[c]) * keep - ((e * vn) / 8) * normal[c]
  return { x: along('x'), y: along('y'), z: along('z') }
}

/**
 * What gravity does to a pig already lying on a slope: the part of it that
 * points along the surface. On the flat this is nothing, which is why a
 * landed pig on level ground just stops.
 */
export function slopePull(normal: Velocity, friction: number, gravity: number, seconds: number): Velocity {
  // Coulomb: friction holds a body still until the slope out-pulls it, so
  // ground shallower than the coefficient gives nothing away and a pig that
  // lands there comes to rest. Without this the pull is a constant that a
  // speed-proportional friction can never balance, and a landed pig creeps
  // downhill for ever — which is what it did.
  if (Math.hypot(normal.x, normal.z) <= friction * Math.abs(normal.y)) {
    return { x: 0, y: 0, z: 0 }
  }
  // Gravity is (0, +g, 0) in game space (Y down). Subtract its normal part.
  const gn = gravity * normal.y
  return {
    x: -gn * normal.x * seconds,
    y: (gravity - gn * normal.y) * seconds,
    z: -gn * normal.z * seconds
  }
}
