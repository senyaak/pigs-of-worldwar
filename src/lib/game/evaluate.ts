// The PRICE LIST: every item in the kit against every target, one currency —
// health points — one winner. docs/ai.md's HP differential, first full pass.
//
// The brain does not know what a MEDIC is, or a SAPPER, or a GRUNT: it knows
// what the pig CARRIES, and every carried thing is priced the same way —
// what would this do to the world's health, ours counted negative, theirs
// positive, a finished pig worth a KILL_BONUS on top because a dead pig
// loses every future turn. Class flavour is whatever the kit happens to
// hold; there is no behaviour tree behind it and there must never be one.
//
// Three layers are priced today, the grunt's whole kit and most others':
//   GUN   — a straight shot at one pig, worth what it takes off that pig.
//   MELEE — the same worth, standing next to him.
//   LOB   — the parabola DRY-RUN through the engine's own ballistics
//           (lib/game/grenade.ts is pure): solve the gauge for the throw,
//           land it, and price the BLAST over everyone the falloff touches —
//           friends and the thrower subtracted at full weight. This is where
//           "thirty into two pigs beats forty into one" becomes arithmetic.
//
// What an option that needs WALKING pays: APPROACH_TAX, a flat few points —
// the walk spends the turn's clock and stands the pig somewhere new, and
// without the tax a bayonet (10) three tiles away would outbid nothing and
// a grenade (30) would always be worth a hike. `[deliberate]` — a brain
// weight, not an engine fact, and a knob the levels will turn.
//
// Deterministic: the dry-run's rng is a CONSTANT — the fuse it jitters is
// not read — so the battle's own stream is never touched (docs/ai.md).

import type { AiWorld, Seen } from './ai'
import { damageOf, projectileOf, rangeOf } from './projectile'
import { meleeOf } from './melee'
import { advanceLob, blastRange, blastShare, isPlanted, lob, lobOf } from './grenade'
import { GAUGE_FULL } from './gauge'

/** What FINISHING a pig is worth on top of the health it takes — the kill
 * bonus docs/ai.md prices whole turns at. In health points, so a kill
 * outbids any wound the kit can deal instead. */
export const KILL_BONUS = 50

/** How much of a gun's range to close to before shooting: near enough to
 * hit something, not so near it walks into the bayonet. */
export const CLOSE_TO = 0.6

/** Standing distance for a blade — the strike lane is ~170 long and the
 * body another 30 (lib/game/strikes.ts); the brain aims to stand inside
 * it. `[deliberate]`. */
export const MELEE_NEAR = 180

/** What having to WALK first costs an option, in points. `[deliberate]` —
 * the level knob for patience. */
export const APPROACH_TAX = 10

/** Where the hand is over the soles when a thing is thrown — the brain's
 * own model of the throw height, not the engine's bone. `[deliberate]`. */
export const THROW_RISE = 120

/** The least gauge the brain will throw at: under this the thing lands on
 * its own boots. `[deliberate]`. */
export const LEAST_CHARGE = 0.15

/** How much of a crate's gain the DUMBEST brain actually feels — the
 * grunt barely bothers with pickups, by request: "он должен очень в редких
 * случаях тогда брать ящики". A NECESSITY is exempt: a pig with no weapon
 * at all takes a weapon crate at full worth. `[deliberate]` — the greed
 * knob the levels will turn. */
export const CRATE_APPETITE = 0.25

/** Standing this near a crate collects it — the walk-through hand-over
 * (lib/game/scenery.ts). */
export const COLLECT_NEAR = 40

/** The dry-run's step and its longest flight — a lob's fuse is ~6 s and
 * nothing flies that long. */
const SIM_STEP = 1 / 30
const SIM_SECONDS = 6

/** One choice, priced. `score` is what the selection compares — worth less
 * the approach tax; `worth` is the undiscounted HP differential. */
export interface Option {
  skill: number
  kind: 'gun' | 'melee' | 'lob' | 'plant' | 'crate'
  target: Seen
  score: number
  worth: number
  /** Stand this near the target before firing. */
  reach: number
  /** …and past THIS it is not worth trying at all (the gun's whole range,
   * the throw's whole arc): grounded beyond it means pass. */
  limit: number
  /** For a lob: the gauge fraction to hold (0..1), solved for the throw —
   * present only when the target is already inside the arc. */
  charge?: number
}

/** What one hit of `damage` at this pig is WORTH, kill bonus included. */
export const worthOf = (damage: number, pig: Seen): number =>
  Math.min(damage, pig.health) + (damage >= pig.health ? KILL_BONUS : 0)

const distance2d = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z)

/** The flight of one throw from `from` at `charge` (gauge units), along
 * `heading`, at the weapon's own 45° come-up: where it comes down. The
 * ground is the world's; the rng is constant — the fuse is not read. */
const flight = (
  world: AiWorld,
  skill: number,
  heading: number,
  charge: number
): { x: number; z: number } => {
  const me = world.acting
  const shot = lob(
    skill,
    { x: me.x, y: me.y - THROW_RISE, z: me.z },
    heading,
    512,
    charge,
    () => 0
  )!
  for (let seconds = 0; seconds < SIM_SECONDS; seconds += SIM_STEP) {
    if (advanceLob(shot, SIM_STEP)) break
    // Y-DOWN: at or below the ground when y has grown past it.
    if (shot.y >= world.groundAt(shot.x, shot.z)) break
  }
  return { x: shot.x, z: shot.z }
}

/** The blast at `landing`, priced over EVERYONE: foes positive, friends and
 * the thrower negative, kill bonuses on both sides of the ledger. A PLANTED
 * charge spares the self term — the plan is to be gone before it goes off
 * (lib/game/grunt.ts, the flee). */
const blastWorth = (
  world: AiWorld,
  landing: { x: number; z: number },
  damage: number,
  range: number,
  spareSelf = false
): number => {
  const me = world.acting
  let total = 0
  for (const foe of world.foes) {
    total += worthOf(damage * blastShare(distance2d(foe, landing), range), foe)
  }
  const own: Seen[] = [...world.friends]
  if (!spareSelf) own.push({ x: me.x, y: me.y, z: me.z, health: me.health })
  for (const friend of own) {
    const share = blastShare(distance2d(friend, landing), range)
    if (share > 0) total -= worthOf(damage * share, friend)
  }
  return total
}

/** What a skill is worth as a weapon, whatever family it is — the crate
 * comparison's one number. */
const weaponPoints = (skill: number): number =>
  damageOf(skill) || (lobOf(skill)?.damage ?? 0) / 128 || (meleeOf(skill)?.damage ?? 0)

const gunOption = (world: AiWorld, skill: number): Option | null => {
  const row = projectileOf(skill)
  if (!row) return null
  const damage = damageOf(skill)
  const me = world.acting
  let best: Option | null = null
  for (const foe of world.foes) {
    const away = distance2d(me, foe)
    const worth = worthOf(damage, foe)
    const score = worth - (away > rangeOf(row) * CLOSE_TO ? APPROACH_TAX : 0)
    if (!best || score > best.score || (score === best.score && away < distance2d(me, best.target))) {
      best = {
        skill,
        kind: 'gun',
        target: foe,
        score,
        worth,
        reach: rangeOf(row) * CLOSE_TO,
        limit: rangeOf(row)
      }
    }
  }
  return best
}

const meleeOption = (world: AiWorld, skill: number): Option | null => {
  const blade = meleeOf(skill)
  if (!blade) return null
  const me = world.acting
  let best: Option | null = null
  for (const foe of world.foes) {
    const away = distance2d(me, foe)
    const worth = worthOf(blade.damage, foe)
    const score = worth - (away > MELEE_NEAR ? APPROACH_TAX : 0)
    if (!best || score > best.score || (score === best.score && away < distance2d(me, best.target))) {
      best = { skill, kind: 'melee', target: foe, score, worth, reach: MELEE_NEAR, limit: MELEE_NEAR }
    }
  }
  return best
}

const lobOption = (world: AiWorld, skill: number): Option | null => {
  const row = lobOf(skill)
  if (!row) return null
  const me = world.acting
  const damage = row.damage / 128
  const spread = blastRange(row)
  // The whole arc, measured by throwing FLAT OUT at each foe's bearing —
  // near enough for "can I reach him at all", and re-derived every decision.
  let best: Option | null = null
  for (const foe of world.foes) {
    const away = distance2d(me, foe)
    const heading = Math.atan2(foe.x - me.x, foe.z - me.z)
    const farthest = flight(world, skill, heading, GAUGE_FULL)
    const arc = distance2d(me, farthest)
    if (away <= arc) {
      // In the arc: SOLVE the gauge — the landing grows with the charge, so
      // halve the interval on which side of the foe it comes down.
      let low = LEAST_CHARGE * GAUGE_FULL
      let high = GAUGE_FULL
      for (let i = 0; i < 14; i++) {
        const mid = (low + high) / 2
        if (distance2d(me, flight(world, skill, heading, mid)) < away) low = mid
        else high = mid
      }
      const charge = (low + high) / 2
      const landing = flight(world, skill, heading, charge)
      const worth = blastWorth(world, landing, damage, spread)
      if (!best || worth > best.score) {
        best = {
          skill,
          kind: 'lob',
          target: foe,
          score: worth,
          worth,
          reach: away,
          limit: arc,
          charge: charge / GAUGE_FULL
        }
      }
    } else {
      // Out of the arc: price the throw AS IF it lands on him — the walk
      // closes the gap and the next decision solves it for real.
      const worth = blastWorth(world, foe, damage, spread)
      const score = worth - APPROACH_TAX
      if (!best || score > best.score) {
        best = { skill, kind: 'lob', target: foe, score, worth, reach: arc * 0.8, limit: arc }
      }
    }
  }
  return best
}

/** PLANTING a charge where the pig STANDS — no approach is planned, so the
 * option only exists when a foe already stands inside the blast: walk up
 * carrying a lit bomb is a bigger brain's game. The self term is spared —
 * the four hurried seconds after planting are the flee (lib/game/grunt.ts). */
const plantOption = (world: AiWorld, skill: number): Option | null => {
  const row = lobOf(skill)
  if (!row || world.foes.length === 0) return null
  const me = world.acting
  const worth = blastWorth(world, me, row.damage / 128, blastRange(row), true)
  if (worth <= 0) return null
  return {
    skill,
    kind: 'plant',
    // The spot IS the target: nothing to walk to, nothing to face.
    target: { x: me.x, y: me.y, z: me.z, health: 0 },
    score: worth,
    worth,
    reach: Infinity,
    limit: Infinity
  }
}

/** A crate weighed against the greed knob: a NECESSITY (no weapon at all)
 * at full worth, an upgrade or a top-up at CRATE_APPETITE of it. */
const crateOption = (
  world: AiWorld,
  crate: { x: number; z: number; skill: number | null; amount: number }
): Option | null => {
  const me = world.acting
  const have = world.acting.carrying.reduce(
    (best, slot) => (slot.amount !== 0 ? Math.max(best, weaponPoints(slot.skill)) : best),
    0
  )
  const gain =
    crate.skill === null
      ? crate.amount * CRATE_APPETITE
      : have === 0
        ? weaponPoints(crate.skill)
        : Math.max(0, weaponPoints(crate.skill) - have) * CRATE_APPETITE
  const away = distance2d(me, crate)
  const score = gain - (away > COLLECT_NEAR ? APPROACH_TAX : 0)
  if (score <= 0) return null
  return {
    skill: crate.skill ?? SKILLLESS,
    kind: 'crate',
    target: { x: crate.x, y: 0, z: crate.z, health: 0 },
    score,
    worth: gain,
    reach: COLLECT_NEAR,
    limit: Infinity
  }
}

/** A crate option's `skill` when the crate is health — nothing is ever held
 * off it, the walk itself collects. */
export const SKILLLESS = -1

/**
 * The kit priced whole — and the ground too: the best (item × target) pair
 * or the best crate walk, or null when nothing scores above zero (then the
 * pass is the honest move — a negative option is never taken just for
 * being the only one). Ties go to the kit's own order — deterministic,
 * like everything here.
 */
export function priceKit(world: AiWorld): Option | null {
  let best: Option | null = null
  const keep = (option: Option | null): void => {
    if (option && option.score > 0 && (!best || option.score > best.score)) best = option
  }
  for (const slot of world.acting.carrying) {
    if (slot.amount === 0) continue
    keep(
      isPlanted(slot.skill)
        ? plantOption(world, slot.skill)
        : (gunOption(world, slot.skill) ??
            lobOption(world, slot.skill) ??
            meleeOption(world, slot.skill))
    )
  }
  for (const crate of world.crates) keep(crateOption(world, crate))
  return best
}
