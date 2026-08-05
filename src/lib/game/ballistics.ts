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

/**
 * The GROUND's material, which the solver multiplies the pig's by — and it
 * is not one pair but one PER TERRAIN TYPE.
 *
 * The collision manager's constructor (exe 0x414f50) gives the landscape
 * body 0.2 / 0.7 as a default, but the landscape collider replaces it at
 * every contact: `0x415590` reads the tile type out of the map and calls the
 * same setter with a pair looked up from the table at 0x4c0088, two uint16s
 * per type scaled by 0x4bc2e0 = 1/4096. Only the first twelve entries are
 * the table; past type 11 the bytes are something else.
 *
 * The body carrying that material is `[4de9d0]+0ch`, the one `TryMove`'s
 * dispatch compares its single hit against — which is how the landscape got
 * identified in the first place.
 */
export const TILE_MATERIALS: Bounciness[] = [
  { friction: 1638 / FIXED, restitution: 1638 / FIXED },
  { friction: 2048 / FIXED, restitution: 1638 / FIXED },
  { friction: 2457 / FIXED, restitution: 1802 / FIXED },
  { friction: 2048 / FIXED, restitution: 1802 / FIXED },
  { friction: 3686 / FIXED, restitution: 409 / FIXED },
  { friction: 2457 / FIXED, restitution: 1802 / FIXED },
  { friction: 2457 / FIXED, restitution: 1802 / FIXED },
  { friction: 2457 / FIXED, restitution: 409 / FIXED },
  { friction: 409 / FIXED, restitution: 819 / FIXED },
  { friction: 819 / FIXED, restitution: 819 / FIXED },
  { friction: 2457 / FIXED, restitution: 409 / FIXED },
  { friction: 3686 / FIXED, restitution: 409 / FIXED }
]

/** What the landscape becomes where `Map::IsBlocked` says yes (exe 0x41564c):
 * all but frictionless, and all but perfectly elastic. This is what throws a
 * pig back out of a wall — not a refusal, a surface. */
export const WALL_MATERIAL: Bounciness = { friction: 0.01, restitution: 0.99 }

/** The constructor's default, before any tile replaces it (exe 0x41537e). */
export const GROUND_DEFAULT: Bounciness = { friction: 0.2, restitution: 0.7 }

/** The ground a pig is standing on, by tile type and whether it is a wall. */
export function groundMaterial(tileType: number, blocked: boolean): Bounciness {
  if (blocked) return WALL_MATERIAL
  return TILE_MATERIALS[tileType & 0x1f] ?? GROUND_DEFAULT
}

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
 * KNOWN DIVERGENCE — contact softening.
 *
 * The original never snaps a body to the surface. It lets it penetrate and
 * pushes it back out by a correction vector scaled by a per-contact bias:
 * born at 0.2 (exe 0x40f0c0, called from the contact constructor at
 * 0x40f161), losing 0.005 a solve down to a floor of 0.02 (0x410685), and
 * applied through `vec3 * scalar` at 0x404f60. A contact that persists is
 * separated by less and less, which is what keeps a resting body from
 * buzzing.
 *
 * Here a landing pins the pig to the ground height instead, so there is no
 * penetration to correct and no bias to decay. Everything else on this page
 * is the exe's; this one is not modelled at all. Doing it properly means
 * changing how a landing resolves, not adding a constant.
 */

/**
 * An exe speed in ours. The original's are distances per logic frame — its
 * own `m_nPigJumpSpeed = |nDist| * 3 / 2` is built straight out of the
 * per-frame walking step — so a per-second figure is that over FRAME_SECONDS.
 */
export const fromExeSpeed = (perFrame: number): number => perFrame / FRAME_SECONDS

/**
 * Below this closing speed a landing is a landing, not a bounce.
 *
 * The exe's own, and not where it was first looked for: the impact handler
 * tests it at 0x4711d8 (`cmp di,19h`) and sends anything under 25 to
 * `0x471350` to get up, anything at or over it to the bounce at 0x471247.
 * The solver has no such threshold — that much was true — but the caller
 * does, and this is it.
 */
export const BOUNCE_CUTOFF = fromExeSpeed(0x19)

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
export function bounceOff(v: Velocity, pig: Bounciness, ground: Bounciness, normal: Velocity): Velocity {
  // Both coefficients are the PRODUCT of the two bodies' — `fmul [ebx+5ch]`
  // and `fmul [ebx+58h]` at 0x40f690.
  const restitution = pig.restitution * ground.restitution
  const friction = pig.friction * ground.friction
  const vn = v.x * normal.x + v.y * normal.y + v.z * normal.z
  // Leaving the surface already: nothing to respond to.
  if (vn >= 0) return v
  // Below a crawl there is no bounce left, only contact. Without this a
  // discrete step bounces a pig forever: each landing returns a little, the
  // next frame's gravity takes it back, and the pair never quite reaches
  // zero.
  //
  // The threshold is the exe's — see BOUNCE_CUTOFF. The SOLVER has none, and
  // that is a separate mechanism worth keeping in mind: every contact is
  // born with 0.2 at +0xbc (exe 0x40f0c0, from the contact constructor),
  // loses 0.005 a solve down to 0.02 (0x410685), and that scalar scales the
  // correction vector (0x404f60), so a contact that persists is pushed apart
  // by less and less. That part is still not modelled here — there is no
  // positional correction to decay.
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
  //
  // The angle this holds to is atan(friction): about 14 degrees on its feet,
  // 8.5 fresh off a wall. The exe MULTIPLIES the two bodies' coefficients,
  // and the ground's own material is not decoded — if it is not 1, both
  // angles are shallower than this.
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
