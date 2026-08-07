// How much a pig has to spend, and what a hit costs it.
//
// Everything that can be hurt in the original answers the same two virtual
// slots — `[vtbl+0x34]` TakeDamage and `[vtbl+0x38]` Heal — so a pig and a
// training dummy take a hit by the same rule with different numbers. The read
// is `../../../pigs-disasm/damage/notes.md`.
//
// **The engine counts health in 128ths of a point** and every amount it is
// given arrives as points shifted left seven (`Pig::GiveSkill` 0x465984, and
// `Pig::HitByHandToHand` 0x478618). Nothing in the game ever produces a
// fractional point, so this module counts POINTS and the thresholds come out
// exact: the exe's "dead at `<= 0x7f`" is 127 of 128 — anything below one
// whole point — which over whole points is simply `<= 0`.
//
// Pure: numbers in, numbers out.

/**
 * What a pig of each class starts with, and its ceiling.
 *
 * The constructor reads it out of a 128-byte record per class at 0x4d02e0
 * (0x466a9d), multiplies by `[0x4d1008] & 0xff` — which is 2 — and halves it,
 * so the table stands as written. It is the SAME record the walking speed
 * comes from: `+0x04` is the thirteen `Pig::Walk` grants of the requested 64
 * (lib/game/movement.ts), so one table describes a class and health is its
 * first field.
 *
 * **A grunt has fifty, not a hundred**, which is five bayonet swings.
 */
export const CLASS_HEALTH = [50, 75, 90, 120, 130, 80, 100, 120, 75, 90, 120, 60]

/** What a pig of this class starts and tops out at. A class off the end of
 * the table is a grunt, the same fallback its art takes (three/soldiers.ts). */
export const maxHealthFor = (pigClass: number): number =>
  CLASS_HEALTH[pigClass] ?? CLASS_HEALTH[0]

/**
 * How far past dead a pig comes apart (0x467cb1: `< -0x1e00`, −7680 in
 * 128ths). Only some kinds of damage can reach it and hand-to-hand is not
 * one of them, so nothing here produces it yet — it is written down because
 * it is the other half of the same test.
 */
export const GIB_BELOW = -60

/**
 * What the training ground floors a pig at (0x467c85 writes 0x80, one point).
 *
 * The same flag that makes every skill unlimited there (lib/game/pickups.ts)
 * also makes a pig unkillable: CAMP is a place to practise, and that includes
 * being hit.
 */
export const TRAINING_FLOOR = 1

/** What happened to a body that was hit. */
export type HitOutcome =
  /** Still standing. */
  | 'hurt'
  /** Health ran out. */
  | 'died'
  /** Sixty points past it (GIB_BELOW) — a messier death, not reachable yet. */
  | 'gibbed'
  /** The training ground would not let it die. */
  | 'spared'

/** Anything with health: a pig, and the training ground's dummies. */
export interface Body {
  health: number
}

/**
 * Take `damage` points off, and say what became of it.
 *
 * The order is the exe's: subtract first, then the training floor, then the
 * two death tests. Health is left where it fell rather than clamped to zero —
 * `Pig::TakeDamage` only zeroes it on the way out through the death path
 * (0x467d96), and how far under it went is what tells the two deaths apart.
 */
export function hurt(body: Body, damage: number, training: boolean): HitOutcome {
  body.health -= damage
  if (training && body.health < TRAINING_FLOOR) {
    body.health = TRAINING_FLOOR
    return 'spared'
  }
  if (body.health < GIB_BELOW) {
    body.health = 0
    return 'gibbed'
  }
  if (body.health <= 0) {
    body.health = 0
    return 'died'
  }
  return 'hurt'
}

/**
 * Put `amount` points back — and there is NO ceiling.
 *
 * `Pig::Heal` (0x467fd0) adds and stops; nothing in it compares against the
 * maximum the constructor worked out and kept at `[pig+0x3b8]`. A 50-point
 * crate on a 50-point grunt leaves it at a hundred, and the original allows
 * it. That is why `maxHealthFor` is a STARTING value here and not a clamp.
 */
export function heal(body: Body, amount: number): void {
  if (amount <= 0) return
  body.health += amount
}

/** Whether a body is out of it. The exe's own test is `<= 0x7f` — under one
 * whole point — which over points is this. */
export const isDead = (body: Body): boolean => body.health <= 0
