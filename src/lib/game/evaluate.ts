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
// What an option that needs WALKING pays: APPROACH_TAX flat plus
// TAX_PER_TILE for the length of the hike — the walk spends the turn's
// clock and stands the pig somewhere new, and without the toll a +2 finish
// bonus bought a march across the whole map (`approachTax`). `[deliberate]`
// — brain weights, not engine facts, and knobs the levels will turn.
//
// Deterministic: the dry-run's rng is a CONSTANT — the fuse it jitters is
// not read — so the battle's own stream is never touched (docs/ai.md).

import type { AiWorld, Candidate, Seen } from './ai'
import { damageOf, projectileOf, rangeOf } from './projectile'
import { meleeOf } from './melee'
import { advanceLob, blastRange, blastShare, isPlanted, lob, lobOf } from './grenade'
import { GAUGE_FULL } from './gauge'
import { AIM_LOB } from './aim'
import { TILE_STEP } from '../formats/pmg'

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

/** What having to WALK first costs an option, in points — the flat half:
 * spending the clock on an approach at all. `[deliberate]` — the level knob
 * for patience. */
export const APPROACH_TAX = 10

/**
 * …and the toll PER TILE of that walk, because a flat tax is distance-blind
 * and the telemetry caught what that buys (GINGER, 2026-08-24): a +2 finish
 * bonus on a nearly-dead foe 23 tiles away outbid a healthy foe 4 tiles
 * away, both walks costing the same ten — "пошёл через всю карту к тому кто
 * почти умер". Linear keeps both ends of the wits dial honest: the dumb
 * pig's ~+2 bonus never pays for a march, the sharp pig's KILL_BONUS ~+50
 * still does — and crossing a map to make a kill PERMANENT is the sharp
 * play. `[deliberate]`.
 */
export const TAX_PER_TILE = 0.5

/** The whole cost of getting `away` down to `reach`: nothing when already
 * there, the flat tax plus the per-tile toll when not. */
const approachTax = (away: number, reach: number): number =>
  away <= reach ? 0 : APPROACH_TAX + ((away - reach) / TILE_STEP) * TAX_PER_TILE

/**
 * What distance may NOT do to a weapon: argue it out of existence. The toll
 * ranks a far option under a near one; a sliver of the worth survives it, so
 * a pig whose ONLY foe is across the map still goes to fight rather than
 * passing forever — the first cut let the tax run a lone rifle below zero
 * and the brain sat down. Crates deliberately keep the hard tax: they have
 * their own two lanes (the errand and the necessity fallback).
 */
export const FAR_FLOOR = 0.05

const taxedScore = (worth: number, away: number, reach: number): number =>
  worth <= 0 ? worth : Math.max(worth * FAR_FLOOR, worth - approachTax(away, reach))

/** Where the hand is over the soles when a thing is thrown — the brain's
 * own model of the throw height, not the engine's bone. `[deliberate]`. */
export const THROW_RISE = 120

/** The least gauge the brain will throw at: under this the thing lands on
 * its own boots. `[deliberate]`. */
export const LEAST_CHARGE = 0.15

/** From this wits up a pig TUNES the throw's pitch — play's order, and
 * play's boundary: "для умных — подстраивание для точного попадания — но
 * только для умных". Below it the come-up stays the exe's 45° start and
 * only the charge is played. The original's grenade AI is undecoded, so
 * the whole tune is `[deliberate]` — a level knob like CRATE_APPETITE. */
export const TUNE_PITCH_WITS = 0.5

/** The come-ups a tuning pig tries, flattest first: 45° (the range
 * maximum, everyone's start), then 56.25°, 67.5° and 78.75° in the aim's
 * own 4096-a-turn units. The steeper rungs trade reach for CLEARANCE —
 * both arcs of one range land the same spot, and the high one is the one
 * that goes over a hill. The ladder stops at the first landing within
 * PITCH_SLACK of the foe, so flat ground never climbs past 45° and the
 * dumb pig's cost is exactly what it was. */
const LOB_AIMS = [AIM_LOB, 640, 768, 896]
const PITCH_SLACK = 64

/** How much of a crate's gain the DUMBEST brain feels — the grunt barely
 * bothers with pickups, by request: "он должен очень в редких случаях
 * тогда брать ящики". The WITS dial slides it from here to a full 1
 * (lib/game/wits.ts): the sharpest machine values a crate at face. A
 * NECESSITY is exempt at every level: a pig with no weapon at all takes a
 * weapon crate at full worth. `[deliberate]` — the first level knob. */
export const CRATE_APPETITE = 0.25

/** The appetite this brain actually feels, its wits applied. */
const appetiteOf = (world: AiWorld): number =>
  CRATE_APPETITE + (1 - CRATE_APPETITE) * world.wits

/** Standing this near a crate collects it — the walk-through hand-over
 * (lib/game/scenery.ts). */
export const COLLECT_NEAR = 40

/** The dry-run's step and its longest flight — a lob's fuse is ~6 s and
 * nothing flies that long. */
const SIM_STEP = 1 / 30
const SIM_SECONDS = 6

/** One choice, priced. `score` is what the selection compares — worth less
 * the approach tax; `worth` is the undiscounted HP differential. A
 * `Candidate` (lib/game/ai.ts) plus what the carrying-out needs. */
export interface Option extends Candidate {
  /** Stand this near the target before firing. */
  reach: number
  /** …and past THIS it is not worth trying at all (the gun's whole range,
   * the throw's whole arc): grounded beyond it means pass. */
  limit: number
  /** For a lob: the gauge fraction to hold (0..1), solved for the throw —
   * present only when the target is already inside the arc. */
  charge?: number
  /** For a lob: the come-up to take before firing, in aim units — present
   * only when a TUNED pitch beat the 45° start (TUNE_PITCH_WITS). */
  aim?: number
}

/**
 * What one hit of `damage` at this pig is WORTH — and the kill bonus is
 * WEIGHED BY WITS, because valuing a finished pig above the points it costs
 * is thinking a turn ahead (docs/ai.md, the HORIZON knob: "shoot now" at the
 * bottom, futures at the top). Play caught the dumbest brain sniping the
 * low-hp pig across the field like a veteran: "для такого уровня слишком
 * разборчиво цель выбрал — вместо ближнего того, у кого хп мало." With the
 * bonus scaled away, equal damage prices equal and the builders' own
 * tie-break — the NEARER target — is what a dumb pig shoots.
 */
export const worthOf = (damage: number, pig: Seen, wits: number): number =>
  Math.min(damage, pig.health) + (damage >= pig.health ? KILL_BONUS * wits : 0)

const distance2d = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z)

/** The flight of one throw from `from` at `charge` (gauge units), along
 * `heading` at `aim` — the weapon's own 45° come-up unless a tuned pitch
 * asks otherwise: where it comes down. The ground is the world's; the rng
 * is constant — the fuse is not read. */
const flight = (
  world: AiWorld,
  skill: number,
  heading: number,
  charge: number,
  aim = AIM_LOB
): { x: number; z: number } => {
  const me = world.acting
  const shot = lob(
    skill,
    { x: me.x, y: me.y - THROW_RISE, z: me.z },
    heading,
    aim,
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
    total += worthOf(damage * blastShare(distance2d(foe, landing), range), foe, world.wits)
  }
  const own: Seen[] = [...world.friends]
  if (!spareSelf) own.push({ x: me.x, y: me.y, z: me.z, health: me.health })
  for (const friend of own) {
    const share = blastShare(distance2d(friend, landing), range)
    if (share > 0) total -= worthOf(damage * share, friend, world.wits)
  }
  return total
}

/** What a skill is worth as a weapon, whatever family it is — the crate
 * comparison's one number. */
const weaponPoints = (skill: number): number =>
  damageOf(skill) || (lobOf(skill)?.damage ?? 0) / 128 || (meleeOf(skill)?.damage ?? 0)

/** What the telemetry hears: every candidate PRICED, not only the winners —
 * the losers are the whole point (lib/game/ai.ts, `Candidate`). */
type Note = ((option: Option) => void) | undefined

/** Eye and chest over the soles for the line-of-sight test — roughly the
 * muzzle's height, in game units. `[deliberate]` — the brain's own model,
 * not the engine's bone. */
const SIGHT_RISE = 160
/** How often the sight line samples the ground — a quarter tile misses no
 * hill a bullet would meet. */
const LOS_STEP = 128

/**
 * Whether a straight shot from `a` to `b` clears the GROUND — play watched
 * what pricing without it does: "третий свин стрельнул через гору —
 * соответственно пуля попала в землю". The engine's bullet already stops at
 * terrain (lib/game/bullets.ts); this is the brain knowing it. Y-DOWN: a
 * sample at or below the ground is `y >= groundAt`, the dry-run's own test.
 */
const clearShot = (world: AiWorld, a: Seen, b: Seen): boolean => {
  const span = distance2d(a, b)
  const steps = Math.ceil(span / LOS_STEP)
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const x = a.x + (b.x - a.x) * t
    const z = a.z + (b.z - a.z) * t
    const y = a.y - SIGHT_RISE + (b.y - a.y) * t
    if (y >= world.groundAt(x, z)) return false
  }
  return true
}

const gunOption = (world: AiWorld, skill: number, note: Note): Option | null => {
  const row = projectileOf(skill)
  if (!row) return null
  const damage = damageOf(skill)
  const me = world.acting
  const eye: Seen = { x: me.x, y: me.y, z: me.z, health: me.health }
  let best: Option | null = null
  for (const foe of world.foes) {
    const away = distance2d(me, foe)
    const worth = worthOf(damage, foe, world.wits)
    // A shot the ground would swallow scores NOTHING — only judged where
    // the pig would actually fire from (inside its reach); beyond it the
    // walk moves the eye and the next decision re-asks. The option is still
    // noted so the telemetry shows the zero.
    const blocked = away <= rangeOf(row) * CLOSE_TO && !clearShot(world, eye, foe)
    const score = blocked ? 0 : taxedScore(worth, away, rangeOf(row) * CLOSE_TO)
    const option: Option = {
      skill,
      kind: 'gun',
      target: foe,
      score,
      worth,
      reach: rangeOf(row) * CLOSE_TO,
      limit: rangeOf(row)
    }
    note?.(option)
    if (!best || score > best.score || (score === best.score && away < distance2d(me, best.target))) {
      best = option
    }
  }
  return best
}

const meleeOption = (world: AiWorld, skill: number, note: Note): Option | null => {
  const blade = meleeOf(skill)
  if (!blade) return null
  const me = world.acting
  let best: Option | null = null
  for (const foe of world.foes) {
    const away = distance2d(me, foe)
    const worth = worthOf(blade.damage, foe, world.wits)
    const score = taxedScore(worth, away, MELEE_NEAR)
    const option: Option = {
      skill,
      kind: 'melee',
      target: foe,
      score,
      worth,
      reach: MELEE_NEAR,
      limit: MELEE_NEAR
    }
    note?.(option)
    if (!best || score > best.score || (score === best.score && away < distance2d(me, best.target))) {
      best = option
    }
  }
  return best
}

const lobOption = (world: AiWorld, skill: number, note: Note): Option | null => {
  const row = lobOf(skill)
  if (!row) return null
  const me = world.acting
  const damage = row.damage / 128
  const spread = blastRange(row)
  // The whole arc, measured by throwing FLAT OUT at each foe's bearing —
  // near enough for "can I reach him at all", and re-derived every decision.
  // A SMART pig walks a ladder of come-ups (LOB_AIMS): where the 45° arc
  // dies on a hillside, a steeper pitch clears it — and its shorter arc can
  // REACH a foe the flat one cannot.
  const aims = world.wits >= TUNE_PITCH_WITS ? LOB_AIMS : [AIM_LOB]
  let best: Option | null = null
  for (const foe of world.foes) {
    const away = distance2d(me, foe)
    const heading = Math.atan2(foe.x - me.x, foe.z - me.z)
    let solved: { aim: number; charge: number; landing: { x: number; z: number }; miss: number } | null =
      null
    let limit = 0
    for (const aim of aims) {
      const farthest = flight(world, skill, heading, GAUGE_FULL, aim)
      const arc = distance2d(me, farthest)
      if (arc > limit) limit = arc
      if (away > arc) continue
      // In the arc: SOLVE the gauge — the landing grows with the charge, so
      // halve the interval on which side of the foe it comes down.
      let low = LEAST_CHARGE * GAUGE_FULL
      let high = GAUGE_FULL
      for (let i = 0; i < 14; i++) {
        const mid = (low + high) / 2
        if (distance2d(me, flight(world, skill, heading, mid, aim)) < away) low = mid
        else high = mid
      }
      const charge = (low + high) / 2
      const landing = flight(world, skill, heading, charge, aim)
      const miss = distance2d(landing, foe)
      if (!solved || miss < solved.miss) solved = { aim, charge, landing, miss }
      // Near enough is done: flat ground stops on the first rung, so the
      // ladder only costs where the ground actually interferes.
      if (solved.miss <= PITCH_SLACK) break
    }
    if (solved) {
      // A lob that comes down ON WATER is worth nothing at all: the engine
      // DOUSES it at the surface (lib/game/grenade.ts) and there is no
      // blast to price. Without this line a doused throw scored like a dry
      // one, and a brain repeated it every turn forever.
      const { landing } = solved
      const worth = world.wet(landing.x, landing.z) ? 0 : blastWorth(world, landing, damage, spread)
      const option: Option = {
        skill,
        kind: 'lob',
        target: foe,
        score: worth,
        worth,
        reach: away,
        limit,
        charge: solved.charge / GAUGE_FULL,
        ...(solved.aim === AIM_LOB ? {} : { aim: solved.aim })
      }
      note?.(option)
      if (!best || worth > best.score) best = option
    } else {
      // Out of the arc at every pitch: price the throw AS IF it lands on
      // him — the walk closes the gap and the next decision solves it for
      // real.
      const worth = blastWorth(world, foe, damage, spread)
      const score = taxedScore(worth, away, limit * 0.8)
      const option: Option = { skill, kind: 'lob', target: foe, score, worth, reach: limit * 0.8, limit }
      note?.(option)
      if (!best || score > best.score) best = option
    }
  }
  return best
}

/** PLANTING a charge where the pig STANDS — no approach is planned, so the
 * option only exists when a foe already stands inside the blast: walk up
 * carrying a lit bomb is a bigger brain's game. The self term is spared —
 * the four hurried seconds after planting are the flee (lib/game/grunt.ts). */
const plantOption = (world: AiWorld, skill: number, note: Note): Option | null => {
  const row = lobOf(skill)
  if (!row || world.foes.length === 0) return null
  const me = world.acting
  const worth = blastWorth(world, me, row.damage / 128, blastRange(row), true)
  const option: Option = {
    skill,
    kind: 'plant',
    // The spot IS the target: nothing to walk to, nothing to face.
    target: { x: me.x, y: me.y, z: me.z, health: 0 },
    score: worth,
    worth,
    reach: Infinity,
    limit: Infinity
  }
  note?.(option)
  return worth <= 0 ? null : option
}

/** A crate weighed against the greed knob: a NECESSITY (no weapon at all)
 * at full worth, an upgrade or a top-up at CRATE_APPETITE of it. */
const crateOption = (
  world: AiWorld,
  crate: { x: number; z: number; skill: number | null; amount: number },
  note: Note
): Option | null => {
  const me = world.acting
  const have = world.acting.carrying.reduce(
    (best, slot) => (slot.amount !== 0 ? Math.max(best, weaponPoints(slot.skill)) : best),
    0
  )
  const appetite = appetiteOf(world)
  const gain =
    crate.skill === null
      ? crate.amount * appetite
      : have === 0
        ? weaponPoints(crate.skill)
        : Math.max(0, weaponPoints(crate.skill) - have) * appetite
  const away = distance2d(me, crate)
  // The floor reaches crates too (2026-08-24): with the hard tax a crate AT
  // THE TROTTERS priced under zero and died before the brain's dumb eye
  // could ever see it — and "ящик/свин — что ближе — это моя цель" needs it
  // alive. What keeps the dull pig off DISTANT crates is not this gate any
  // more; it is the judgment (nearness fades with the tiles) and the
  // errand's own worth bar (lib/game/grunt.ts).
  const score = taxedScore(gain, away, COLLECT_NEAR)
  const option: Option = {
    skill: crate.skill ?? SKILLLESS,
    kind: 'crate',
    target: { x: crate.x, y: 0, z: crate.z, health: 0 },
    score,
    worth: gain,
    reach: COLLECT_NEAR,
    limit: Infinity
  }
  note?.(option)
  return score <= 0 ? null : option
}

/** A crate option's `skill` when the crate is health — nothing is ever held
 * off it, the walk itself collects. */
export const SKILLLESS = -1

/**
 * What an ERRAND has to read as worth before the walk is made — judged
 * points, so at the bottom of the wits scale a middling crate clears it
 * only on a generous misjudgment ("он должен очень в редких случаях тогда
 * брать ящики") and at the top every real crate does. `[deliberate]` —
 * play's dial.
 */
export const ERRAND_WORTH = 10

/**
 * The crate worth a DETOUR ON THE WAY to the fight — play's rule, given at
 * the top of the wits scale: "если хватает времени взять ящик и ударить
 * после — ящик конечно же важнее всего для самого умного." A pickup spends
 * no turn and the weapon does, so a crate is never really an ALTERNATIVE to
 * the attack — it is a prefix to it, and pricing them against each other
 * (one winner) is what kept every pig off every crate. Whether the clock
 * affords the detour is the brain's question (lib/game/grunt.ts); this
 * answers only which crate is worth it — the same appetite-priced gain as
 * `crateOption`, read through the same judgment, best believer wins.
 */
export function crateErrand(
  world: AiWorld,
  judge?: (option: Option) => number
): Option | null {
  let best: Option | null = null
  let bestJudged = 0
  for (const crate of world.crates) {
    const option = crateOption(world, crate, undefined)
    if (!option) continue
    const judged = judge ? judge(option) : option.score
    if (judged >= ERRAND_WORTH && judged > bestJudged) {
      best = option
      bestJudged = judged
    }
  }
  return best
}

/**
 * The crate as a NECESSITY — full face value, no appetite, nearest first.
 *
 * The appetite knob prices a pickup for a pig that has BETTER things to do;
 * a pig with no PLAYABLE weapon has none, and at mission-one wits the knob
 * priced every crate under zero while the grunt skipped three turns straight
 * standing beside them (telemetry, DEN — play: "это не тупость, это
 * идиотизм"). The weaponless pig's own exemption already says the rule:
 * necessity ignores appetite. This is the same exemption for a pig whose kit
 * cannot REACH anything (lib/game/grunt.ts asks it only then). Nearest wins,
 * because the point is having a job, not maximising it.
 */
export function crateFallback(world: AiWorld): Option | null {
  const me = world.acting
  let best: Option | null = null
  let nearest = Infinity
  for (const crate of world.crates) {
    const gain = crate.skill === null ? crate.amount : weaponPoints(crate.skill)
    if (gain <= 0) continue
    const away = distance2d(me, crate)
    if (away >= nearest) continue
    nearest = away
    best = {
      skill: crate.skill ?? SKILLLESS,
      kind: 'crate',
      target: { x: crate.x, y: 0, z: crate.z, health: 0 },
      score: gain,
      worth: gain,
      reach: COLLECT_NEAR,
      limit: Infinity
    }
  }
  return best
}

/**
 * The kit priced whole — and the ground too: the best (item × target) pair
 * or the best crate walk, or null when nothing scores above zero (then the
 * pass is the honest move — a negative option is never taken just for
 * being the only one). Ties go to the kit's own order — deterministic,
 * like everything here.
 */
export function priceKit(
  world: AiWorld,
  note?: (option: Option) => void,
  /** The brain's own JUDGMENT of a score — misjudgment applied
   * (lib/game/grunt.ts, `MISJUDGE`). The arithmetic above stays exact;
   * what a dumb brain gets wrong is what it makes of the numbers. Absent,
   * the judgment is the truth. */
  judge?: (option: Option) => number
): Option | null {
  let best: Option | null = null
  let bestJudged = 0
  const keep = (option: Option | null): void => {
    if (!option) return
    const judged = judge ? judge(option) : option.score
    if (judged > 0 && (!best || judged > bestJudged)) {
      best = option
      bestJudged = judged
    }
  }
  for (const slot of world.acting.carrying) {
    if (slot.amount === 0) continue
    keep(
      isPlanted(slot.skill)
        ? plantOption(world, slot.skill, note)
        : (gunOption(world, slot.skill, note) ??
            lobOption(world, slot.skill, note) ??
            meleeOption(world, slot.skill, note))
    )
  }
  for (const crate of world.crates) keep(crateOption(world, crate, note))
  return best
}
