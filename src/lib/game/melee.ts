// Swinging what is in hand.
//
// Five skills are resolved by CONTACT rather than by a projectile — 1 TROTTER,
// 2 KNIFE, 3 BAYONET, 4 SWORD, 5 CATTLE PROD — and the exe treats them as one
// thing throughout: one jump-table arm in the fire dispatcher, one in the
// animation picker, one in the strike, one in the damage.
// `../../../pigs-disasm/weapons/melee.md` is the read; every number here cites
// the site it came off.
//
// Pure, like the rest of lib/game: it takes points and gives verdicts. WHERE
// the blade is comes from the scene, which is the only thing that knows where
// a bone ended up this frame.

import { FRAME_SECONDS } from './ballistics'

/** A point in the game's own space (Y-down). */
export interface Point {
  x: number
  y: number
  z: number
}

/** Which of the bank's noises a weapon lands with. The exe names sound
 * INDICES; the names are in `renderer/audio/battle.ts`, as everywhere else. */
export type Impact = 'punch' | 'stab' | 'sword'

export interface MeleeWeapon {
  /**
   * Where the business end is, as an offset from the HAND bone in the model's
   * own space — row of the s16 table at 0x4d0ee0 that `Pig::HandToHandStrike`
   * picks by weapon (0x475a58). The same table the projectile spawner uses.
   *
   * **Model units, not world units, and that is a judgement.** The exe builds
   * the point off the pose matrix at `[pig+0x64]+0x7c` and compares it against
   * pig positions, which are world; whether that matrix carries the model's
   * half draw scale (lib/game/scale.ts) is not read. Taken as world units the
   * bayonet would reach 460 — one and a half times the height of a pig — past
   * a blade drawn half that long, and a bare fist would strike 100 units clear
   * of the knuckles. Taken as model units both land where the art is. So the
   * offset travels with the bone, through the mesh's own scale, and lines up
   * with the weapon the player is looking at.
   */
  reach: Point
  /** Health points off the target — 0x4785c0's own five-way switch. */
  damage: number
  /**
   * The impulse the hit carries, at 45° up along the bearing (0x4a9100).
   * Decoded and NOT applied: only the acting pig has a locomotion state in
   * this engine, so there is nothing to push. Kept because it is the number,
   * and because it is what a struck pig will want when it has one.
   */
  knockback: number
  impact: Impact
  /** The whole-body clip the swing wears, on the PRIMARY channel — the
   * record's +0x20 (0x469696). 21 is "Sword / Knife", 22 "Bayonet". */
  clip: number
}

// skill -> the row (0x4d0ee0), the damage and knockback (0x4785c0), the
// impact noise (0x475a58) and the clip (0x4d7320).
const TABLE: Record<number, MeleeWeapon> = {
  // 1 TROTTER — bare trotters, and what a boot counts as as well: a kick
  // passes weapon 1 whatever is in hand (0x4760cf).
  1: { reach: { x: 0, y: 0, z: 100 }, damage: 15, knockback: 100, impact: 'punch', clip: 21 },
  2: { reach: { x: 200, y: 16, z: 70 }, damage: 15, knockback: 125, impact: 'stab', clip: 21 },
  // 3 BAYONET — the longest reach of the five and the weakest hit, which is
  // the training ground's first weapon all over.
  3: { reach: { x: 32, y: 40, z: 460 }, damage: 10, knockback: 75, impact: 'stab', clip: 22 },
  4: { reach: { x: 420, y: 24, z: 120 }, damage: 25, knockback: 150, impact: 'sword', clip: 21 },
  // 5 CATTLE PROD — the bayonet's row and clip, and the hardest hit of them.
  5: { reach: { x: 32, y: 40, z: 460 }, damage: 25, knockback: 200, impact: 'stab', clip: 22 }
}

/** What a skill is as a melee weapon, or null for everything that is not one. */
export function meleeOf(skill: number | null): MeleeWeapon | null {
  return skill === null ? null : (TABLE[skill] ?? null)
}

/**
 * How long the pig winds up before the swing starts.
 *
 * `Pig::Fire` writes 10 into `[pig+0x231]` (0x46937b) and `Pig::Update`
 * decrements it once a frame, calling `Pig::Attack` on the frame it runs out
 * (0x46dbb1..0x46dbe2). Ten FRAMES — so it rides `FRAME_SECONDS`, the one
 * free number in the whole speed chain.
 */
export const SWING_DELAY_FRAMES = 10
export const SWING_DELAY = SWING_DELAY_FRAMES * FRAME_SECONDS

/** A full pass of a clip, in the engine's animation cursor units. */
export const PHASE_UNITS = 4096

/**
 * The moments in clip 22 the blade is live, as cursor phases — the clip's own
 * key-frame events, ids 61, 62, 62 and 70 (`melee.md`). Four consecutive
 * frames of a 36-frame clip, 11 through 14.
 *
 * Clip 21's are 1615/1700/1785 — one frame later and three rather than four.
 * Both are listed because the sword and the knife use the other one.
 */
export const STRIKE_PHASES: Record<number, number[]> = {
  21: [1615, 1700, 1785],
  22: [1243, 1356, 1469, 1582]
}

/** Half the reach, the exe's way: truncated toward zero (`cdq; sub; sar 1`). */
const half = (v: number): number => Math.trunc(v / 2)

/**
 * The three points the blade is sampled at, as offsets from the hand bone:
 * its full reach, half of it, and the bone itself (0x475afc, 0x475bb2,
 * 0x475bf2). A long weapon is a line, not a point.
 */
export function strikeOffsets(weapon: MeleeWeapon): Point[] {
  const { x, y, z } = weapon.reach
  return [
    { x, y, z },
    { x: half(x), y: half(y), z: half(z) },
    { x: 0, y: 0, z: 0 }
  ]
}

// **The AIM ANGLE has no part in any of this, and that is settled.** The
// strike is the hand BONE and three offsets from it; `Pig::HandToHandStrike`
// never reads `[pig+0x304]`, and for the only two melee weapons that could
// carry an angle 0x46a891 pins it to zero anyway. So a bayonet strikes level
// however the player has pointed it. Steering the blade with the aim was
// built and taken straight back out: the exe not reading a value is not an
// ambiguity to fill in, it IS the behaviour.

/** How far to either side of a sample point a body counts as struck (0xaa). */
export const STRIKE_SPREAD = 170
/** …and how far above or below (0x168). A pig is 320 tall, so this is the
 * whole of one and then some: the vertical almost never refuses. */
export const STRIKE_RISE = 360
/** How far off the attacker's own facing the target may stand: 0x300 of
 * 4096, which is 67.5° either way (0x475ff9). */
export const STRIKE_ARC = (0x300 / PHASE_UNITS) * 2 * Math.PI

/** Shortest signed difference between two headings, in radians. */
function turnBetween(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI)
  if (d > Math.PI) d -= 2 * Math.PI
  if (d < -Math.PI) d += 2 * Math.PI
  return d
}

/**
 * How near a body came, per axis: the SMALLEST distance to any of the blade's
 * sample points, and how far round it stands from the attacker's facing.
 *
 * The axis tests are INDEPENDENT, exactly as 0x475c45..0x475e69 has them: x
 * against any of the three points, then y against any, then z against any. It
 * is the union's bounding box rather than a box round one point, and that is
 * the original's own sloppiness rather than a simplification here. Split out
 * from the verdict so a miss can be READ rather than guessed at — the battle
 * hands the numbers to `pow.debug.strike()`.
 */
export interface StrikeGap {
  x: number
  y: number
  z: number
  /** Radians off the attacker's facing, always positive. */
  off: number
}

export function strikeGap(
  points: Point[],
  attacker: { x: number; z: number; heading: number },
  target: Point
): StrikeGap {
  const nearest = (pick: (p: Point) => number, of: number): number =>
    points.length === 0
      ? Infinity
      : Math.min(...points.map((point) => Math.abs(of - pick(point))))
  // Forward is (sin h, cos h), the same as every step the pig takes
  // (lib/game/movement.ts).
  const bearing = Math.atan2(target.x - attacker.x, target.z - attacker.z)
  return {
    x: nearest((p) => p.x, target.x),
    y: nearest((p) => p.y, target.y),
    z: nearest((p) => p.z, target.z),
    off: Math.abs(turnBetween(bearing, attacker.heading))
  }
}

/** Whether that gap is a hit. */
export const caught = (gap: StrikeGap): boolean =>
  gap.x < STRIKE_SPREAD && gap.y < STRIKE_RISE && gap.z < STRIKE_SPREAD && gap.off <= STRIKE_ARC

/** Whether a body at `target` is caught by a swing sampled at `points`. */
export function struck(
  points: Point[],
  attacker: { x: number; z: number; heading: number },
  target: Point
): boolean {
  return caught(strikeGap(points, attacker, target))
}

/** What a frame of the swing asks the scene to do. */
export type SwingEvent =
  /** The clip starts: the pig is committed and cannot be driven. */
  | 'start'
  /** The whoosh, whether or not anything is there to hit (sound 0x21). */
  | 'whoosh'
  /** Resolve the blade against everyone standing about, now. */
  | 'strike'
  /** The last strike: whoever was hit may be hit again by the next swing. */
  | 'release'
  /** The clip has run out; the pig is its own again. */
  | 'done'

export interface SwingState {
  /** The skill being swung. */
  skill: number
  /** The clip it wears. */
  clip: number
  /** Seconds still to wait before the clip starts. */
  waiting: number
  /** Seconds into the clip, once it has. */
  elapsed: number
  /** How long the clip runs, at whatever rate the renderer plays it. */
  duration: number
  /** How many of the strike phases have been resolved. */
  resolved: number
  /** Whether it has run out. A spent swing yields nothing further, however
   * often it is advanced. */
  spent: boolean
}

/**
 * Float slack on the two deadlines.
 *
 * The exe counts whole frames — `[pig+0x231]` is a byte decremented once a
 * frame — and here the same ten frames arrive as ten additions of
 * `FRAME_SECONDS`, which do not have to sum to `10 * FRAME_SECONDS`. Without
 * this the wind-up lasts eleven frames about half the time.
 */
const SLACK = 1e-6

/**
 * Start a swing, or null when the skill is not one that swings.
 *
 * `duration` is the attack clip's own length in seconds — the scene's, since
 * the remake plays every clip at a flat 25 (three/clips.ts) where the exe
 * counts logic frames.
 */
export function beginSwing(skill: number | null, duration: number): SwingState | null {
  const weapon = meleeOf(skill)
  if (!weapon || skill === null) return null
  return {
    skill,
    clip: weapon.clip,
    waiting: SWING_DELAY,
    elapsed: 0,
    duration,
    resolved: 0,
    spent: false
  }
}

/**
 * Advance one frame. Mutates `state` and returns what the frame crossed, in
 * order — the scene plays the clip, makes the noises and resolves the blade,
 * and nothing else about a swing lives outside this file.
 */
export function advanceSwing(state: SwingState, delta: number): SwingEvent[] {
  const events: SwingEvent[] = []
  if (state.spent) return events
  if (state.waiting > 0) {
    state.waiting -= delta
    if (state.waiting > SLACK) return events
    // The wind-up is out: the clip goes on THIS frame, with the leftover
    // already counted into it.
    events.push('start')
    state.elapsed = -state.waiting
    state.waiting = 0
  } else {
    state.elapsed += delta
  }

  const phases = STRIKE_PHASES[state.clip] ?? []
  const reached = state.duration > 0 ? (state.elapsed / state.duration) * PHASE_UNITS : PHASE_UNITS
  while (state.resolved < phases.length && phases[state.resolved] <= reached) {
    // The first strike carries the whoosh with it (event id 61) and the last
    // clears the once-per-swing guard (event id 70).
    if (state.resolved === 0) events.push('whoosh')
    events.push('strike')
    if (state.resolved === phases.length - 1) events.push('release')
    state.resolved++
  }
  if (state.elapsed >= state.duration - SLACK) {
    state.spent = true
    events.push('done')
  }
  return events
}
