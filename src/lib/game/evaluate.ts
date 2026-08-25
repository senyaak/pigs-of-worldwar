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
// What an option that needs WALKING pays is TURNS, and nothing else: the
// walk and the blow either fit what is left of this turn or they want
// another, and a blow a turn away is worth half (`trueScore`). There is no
// wits in that arithmetic on purpose — play's model, "симуляция всех
// вариантов, а чем умнее тем правильнее выбирает": the price list answers
// what the world would do, and every difference between a clever pig and a
// stupid one is made downstream, in what it MAKES of that number
// (lib/game/grunt.ts) and how steady its hands are.
//
// Deterministic: the dry-run's rng is a CONSTANT — the fuse it jitters is
// not read — so the battle's own stream is never touched (docs/ai.md).

import type { AiWorld, Candidate, Seen } from './ai'
import { damageOf, projectileOf, rangeOf } from './projectile'
import { meleeOf } from './melee'
import {
  advanceLob,
  blastRange,
  blastShare,
  isPlanted,
  lob,
  lobOf,
  skipOffWater,
  skipsOnWater
} from './grenade'
import { GAUGE_FULL } from './gauge'
import { AIM_LOB } from './aim'
import { WALK_SPEED } from './movement'

/** What FINISHING a pig is worth on top of the health it takes — the kill
 * bonus docs/ai.md prices whole turns at. In health points, so a kill
 * outbids any wound the kit can deal instead. */
export const KILL_BONUS = 50

/** How much of a gun's range to close to before shooting: near enough to
 * hit something, not so near it walks into the bayonet. */
export const CLOSE_TO = 0.6

/**
 * From this wits up a pig SHELTERS BEHIND THE ENEMY — it takes its mark
 * right up against the pig it is shooting, so that a blast answering it
 * would catch one of theirs. Play's ruling on self-preservation,
 * 2026-08-24: the answer is not to run away, it is to be so close to one of
 * THEIRS that shelling you costs them their own pig — "встать к нашему
 * свину — так это только умные должны делать". A wits behaviour like the
 * crate appetite and the detonation window. `[play]` for the behaviour,
 * `[deliberate]` for the number.
 */
export const SHELTER_WITS = 0.5

/** …and how close "beside" is, in world units. A pig's own body is 160
 * across (`PIG_RADIUS`), so this is a body's width off — shoulder to
 * shoulder without standing inside him. `[CHECK — remake]`. */
export const SHELTER_NEAR = 240

/**
 * …and how far a pig will WALK to shelter that way: four tiles, no more.
 *
 * The bound is the point. Hugging without one turns every smart shot into a
 * march across the map, which is the very thing the walk's own cost is
 * there to stop — the two rules would be pulling against each other. So
 * this is about where a turn ENDS rather than about how it is spent: a pig
 * already near its target finishes shoulder to shoulder with it, and one
 * across the field fires from its weapon's own mark like anybody else.
 * `[deliberate]`.
 */
export const SHELTER_FROM = 4 * 512

/** Standing distance for a blade — the strike lane is ~170 long and the
 * body another 30 (lib/game/strikes.ts); the brain aims to stand inside
 * it. `[deliberate]`. */
export const MELEE_NEAR = 180

/**
 * A sliver of any positive worth survives whatever the distance costs, so a
 * pig whose ONLY foe is across the map still sets off rather than passing
 * for ever. The first cut let the toll run a lone rifle below zero and the
 * brain simply sat down.
 */
export const FAR_FLOOR = 0.05

/**
 * What ONE TURN of walking costs an option: half. A turn spent walking is a
 * turn the other side also acts in, the target moves, and the shot you were
 * going to take may not be there — so a blow two turns out is worth a
 * quarter of the same blow now. `[deliberate]`, and the one number this
 * whole model has.
 */
export const TURN_DISCOUNT = 0.5

/** Seconds a blow wants after the walk — the turn to face, the gauge to
 * fill, the line to be spoken. `[deliberate]`. */
export const BLOW_SPARE = 6

/**
 * **HOW FAR THE LEGS ACTUALLY GO to reach a spot** — the ROUTE's own length,
 * not the crow's line.
 *
 * The two are different things and the price list needs both: a weapon
 * reaches in a STRAIGHT line (a bullet does not walk round the bay), while
 * getting somewhere costs the walk the ground allows. Priced by the crow
 * line, a foe across a river reads two tiles away when the legs must go
 * fifteen round the head of it — which is play's report: "нельзя подойти к
 * берегу реки и кинуть гранату, он это не принимает."
 *
 * A port rather than a call, because the pathfinder is expensive and the
 * search belongs to whoever knows when a TURN ends — the plan runs ONE
 * flood a turn and answers every mark off it (lib/game/plan.ts,
 * lib/game/pathfind.ts `flood`). Absent, the crow line stands in, and every
 * spec that does not care about ground gets the old arithmetic.
 *
 * **INFINITY means the legs do not go there at all** — off the map, behind
 * the bay, past the flood's own budget. An option whose only mark is
 * unreachable is not expensive, it is impossible, and it prices at nothing.
 */
export type Walked = (to: { x: number; z: number }) => number

/**
 * **HOW MUCH OF A TURN THIS OPTION SPENDS GETTING THERE — continuously.**
 *
 * It used to count WHOLE turns: nothing at all while the walk still fit
 * inside the clock, then a cliff. On the first maps a turn is 99 seconds
 * and `WALK_SPEED` covers the whole island inside it, so every walk was
 * free and a crate 39 tiles off kept its entire worth — which is exactly
 * what play watched ("прошёл мимо кучи свиней за аптечкой, потом через
 * пол-карты за второй"). Play's correction, 2026-08-24: a walk that eats
 * 80 % of a turn costs 0.8 of a turn. So the cost is the FRACTION of a turn
 * the approach spends, and `TURN_DISCOUNT` is raised to it — smooth, with
 * no cliff for a tie-break to flip across.
 *
 * The CLOCK is deliberately not consulted any more. What is left of this
 * turn changes when a blow lands, not what it is worth, and reading it here
 * only made the same walk price differently at the top and the bottom of a
 * turn — an option that flipped under a pig as it walked. Whether the clock
 * affords an ERRAND before the blow is a different question and it is still
 * asked, where it belongs (lib/game/plan.ts).
 */
const turnsAway = (world: AiWorld, walk: number): number => {
  if (walk <= 0) return 0
  const seconds = walk / WALK_SPEED + BLOW_SPARE
  return seconds / Math.max(1, world.turnSeconds)
}

/**
 * **WHAT AN OPTION IS ACTUALLY WORTH — one simulation, one number, and NO
 * WITS IN IT AT ALL.**
 *
 * Play's model, 2026-08-24: "надо просто симуляцию всех вариантов и
 * выбирать наилучший; чем умнее — тем правильнее выбирает". So this answers
 * only the question the world can answer — what would this do, and when —
 * and every difference between a clever pig and a stupid one is made
 * downstream, in how well the pig SEES this number (`judge` and the dumb
 * eye, lib/game/grunt.ts) and how well it then aims and holds the gauge
 * (`AIM_WOBBLE`, `CHARGE_WOBBLE`). One scoring function, one brain, turned
 * up.
 *
 * That replaces a pair of hand-cut penalties — a per-tile "impatience" toll
 * that faded with the wits, and a separate late discount that only the
 * sharp end felt. Both were the same fact said twice and badly: **walking
 * costs TURNS**. Priced in turns, distance needs no opinion about it. The
 * telemetry reading that produced the toll still stands (a flat tax let a
 * +2 finish bonus buy a march across the map); it is the conclusion that
 * was one level too crude.
 */
const trueScore = (
  world: AiWorld,
  worth: number,
  /** How far the LEGS go to the mark the blow is struck FROM — the firing
   * position the search found (`standFor`), never the target's own spot.
   * Play's correction, 2026-08-24: "точка стрельбы лежит по дороге к цели —
   * это неверно; препятствия и вода могут исказить это." */
  walk: number
): number => {
  if (worth <= 0) return worth
  if (!Number.isFinite(walk)) return 0
  return Math.max(worth * FAR_FLOOR, worth * TURN_DISCOUNT ** turnsAway(world, walk))
}

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

/** How much of the arc a mark searched for OUT OF RANGE is placed at — the
 * throw wants room to be solved in, and the very edge of the arc leaves
 * none. `[deliberate]`. */
const LOB_COMFORT = 0.8

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

/** How many hops off the water the dry run will follow. Each one spends a
 * fifth of the travel, so five is already past the point where the next
 * contact douses it — this is a guard, not a rule. */
const SKIP_LIMIT = 8

/** One choice, priced. `score` is what the selection compares — worth less
 * the approach tax; `worth` is the undiscounted HP differential. A
 * `Candidate` (lib/game/ai.ts) plus what the carrying-out needs. */
export interface Option extends Candidate {
  /**
   * **WHERE THE BLOW IS STRUCK FROM** — the mark the search found
   * (`standFor`), and what the plan routes to. It is a SEARCH RESULT, not a
   * point on the crow line: play's correction, 2026-08-24, is that the
   * firing spot does not lie on the way to the target at all when a wall,
   * a hill or a bay is in between.
   */
  stand: { x: number; z: number }
  /** …and how far the LEGS go to it. `Infinity` when no mark was found:
   * the option is impossible, not merely dear. */
  walk: number
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
  /** For a lob: how long the dry-run flew before it came down, seconds —
   * the PLAN the detonator is pressed on (lib/game/grunt.ts): the brain
   * knew the whole trajectory before the throw, so WHEN to press is known
   * before the button goes down, not sensed frame by frame (play: "разбор
   * до нажатия броска идёт — траектория уже должна быть у мозга"). */
  flight?: number
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

/**
 * The tie-break WITHIN one weapon, when two foes price the same: the shorter
 * walk, and failing that the NEARER pig. Both halves earn their keep — the
 * walk is what the search actually found, and the crow line is what tells
 * two marks apart when neither costs a step. Without the second half a pig
 * with two foes in range shot whichever the foe list happened to hold first,
 * which is not what a dumb brain does ("что ближе — это моя цель").
 */
const nearer = (world: AiWorld, one: Option, than: Option): boolean =>
  one.walk !== than.walk
    ? one.walk < than.walk
    : distance2d(world.acting, one.target) < distance2d(world.acting, than.target)

/** The flight of one throw from `from` at `charge` (gauge units), along
 * `heading` at `aim` — the weapon's own 45° come-up unless a tuned pitch
 * asks otherwise: where it comes down. The ground is the world's; the rng
 * is constant — the fuse is not read. */
const flight = (
  world: AiWorld,
  /** The MARK the throw leaves from — the firing position the search found,
   * which is only the pig's own spot when the search chose it. */
  from: { x: number; y: number; z: number },
  skill: number,
  heading: number,
  charge: number,
  aim = AIM_LOB
): { x: number; z: number; seconds: number; doused: boolean } => {
  const shot = lob(
    skill,
    { x: from.x, y: from.y - THROW_RISE, z: from.z },
    heading,
    aim,
    charge,
    () => 0
  )!
  let seconds = 0
  let doused = false
  let skips = 0
  for (; seconds < SIM_SECONDS; seconds += SIM_STEP) {
    if (advanceLob(shot, SIM_STEP)) break
    // Y-DOWN: at or below the ground when y has grown past it. Over water
    // `groundAt` is the SURFACE, so this is the water contact too.
    if (shot.y < world.groundAt(shot.x, shot.z)) continue
    if (!world.wet(shot.x, shot.z)) break
    // **THE SKIP OFF WATER.** Play asked whether the brain knows about it —
    // "можно параллельно воде пустить прожектайл гранаты или базуки и он
    // проскачет" — and it did not: the dry run stopped at the waterline and
    // priced every throw over water as drowned. The engine's own rule is
    // right here (lib/game/grenade.ts, read out of `Projectile::OnHitLandscape`
    // at 0x437c74: fast and GRAZING is kicked a fifth of its travel straight
    // up, steep or slow goes in and never goes off), so the lookahead asks
    // it rather than guessing.
    //
    // What the dry run leaves out is the tile's own material — `bounceLob`,
    // which the engine resolves before the kick. On a flat skim the normal
    // approach is a fraction of the travel and the pair costs about two per
    // cent a hop, so the prediction runs a little long and never short.
    if (skips < SKIP_LIMIT && skipsOnWater(shot)) {
      skipOffWater(shot)
      skips++
      continue
    }
    doused = true
    break
  }
  return { x: shot.x, z: shot.z, seconds, doused }
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
  spareSelf = false,
  /** Where the THROWER will be standing when it goes off — the firing mark,
   * not necessarily where the pig stands now. */
  thrower?: { x: number; z: number }
): number => {
  const me = world.acting
  let total = 0
  for (const foe of world.foes) {
    total += worthOf(damage * blastShare(distance2d(foe, landing), range), foe, world.wits)
  }
  const own: Seen[] = [...world.friends]
  const at = thrower ?? me
  if (!spareSelf) own.push({ x: at.x, y: me.y, z: at.z, health: me.health })
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

/** How many bearings round a target a firing mark is looked for on, and at
 * what fractions of the weapon's own reach. Twelve is a mark every 30°:
 * enough to find the one gap in a wall, few enough that the whole search is
 * a few hundred table lookups off the turn's one flood. `[deliberate]`. */
export const STAND_WAYS = 12
export const STAND_RINGS = [0.9, 0.65, 0.4]

/** Where a blow is struck from, and what the legs pay to get there. */
export interface Stand {
  x: number
  z: number
  walk: number
}

/**
 * **THE FIRING POSITION — SEARCHED FOR, NOT DERIVED.**
 *
 * Play's correction of the shortcut this price list used to rest on
 * (2026-08-24): "точка стрельбы лежит по дороге к цели — это неверно;
 * препятствия и вода могут исказить это. Надо идти от обратного: найти
 * цель, выбрать оружие, найти позицию откуда можно стрелять; если нет —
 * пару орудий попробовать; потом другая цель."
 *
 * So: rings of marks round the TARGET at the weapon's own reach, each kept
 * only if it is dry, if the LEGS actually get there (`walked` — Infinity is
 * "they do not"), and if the shot from it is CLEAR. The cheapest walk wins.
 * Null is the honest answer that this weapon cannot be brought to bear on
 * this target at all, and the election moves on to the next weapon and then
 * the next target — play's own order.
 *
 * Standing STILL is tried first and costs nothing: a pig already in reach
 * with a clear line does not take a step for the sake of the search.
 */
export function standFor(
  world: AiWorld,
  target: { x: number; z: number },
  reach: number,
  /** Whether the blow can be struck from a mark — the ground's own veto
   * (a gun's sight line; a blade and a lob have none of their own). */
  clear: (from: { x: number; y: number; z: number }) => boolean,
  walked?: Walked
): Stand | null {
  const me = world.acting
  // The crow line stands in when nobody hands over a real one (the specs,
  // and any brain without a flood): the rings then price by distance, which
  // is the arithmetic this had before the search existed.
  const legs: Walked = walked ?? ((to) => Math.hypot(to.x - me.x, to.z - me.z))
  if (distance2d(me, target) <= reach && clear({ x: me.x, y: me.y, z: me.z })) {
    return { x: me.x, z: me.z, walk: 0 }
  }
  let best: Stand | null = null
  // Out from the bearing the pig is already ON — the near side of the
  // target before the far one, and a fixed order so ties break the same
  // way on both machines.
  const home = Math.atan2(me.x - target.x, me.z - target.z)
  for (const ring of STAND_RINGS) {
    const radius = reach * ring
    for (let i = 0; i < STAND_WAYS; i++) {
      const turn = ((i + 1) >> 1) * (i % 2 === 0 ? 1 : -1)
      const angle = home + (turn / STAND_WAYS) * 2 * Math.PI
      const x = target.x + Math.sin(angle) * radius
      const z = target.z + Math.cos(angle) * radius
      // A mark in the water is no mark: swimming hands are empty.
      if (world.wet(x, z)) continue
      const walk = legs({ x, z })
      if (!Number.isFinite(walk)) continue
      // Cheaper marks first, and the sight line asked last — it is the
      // dearest test of the three.
      if (best !== null && walk >= best.walk) continue
      if (!clear({ x, y: world.groundAt(x, z), z })) continue
      best = { x, z, walk }
    }
  }
  return best
}

const gunOption = (world: AiWorld, skill: number, note: Note, walked?: Walked): Option | null => {
  const row = projectileOf(skill)
  if (!row) return null
  const damage = damageOf(skill)
  const me = world.acting
  const shy = rangeOf(row) * CLOSE_TO
  let best: Option | null = null
  for (const foe of world.foes) {
    const worth = worthOf(damage, foe, world.wits)
    // A SMART pig takes its mark right beside the foe (SHELTER_*) — and
    // only when it is already near enough that hugging is not a march.
    const reach =
      world.wits >= SHELTER_WITS && distance2d(me, foe) <= SHELTER_FROM
        ? Math.min(shy, SHELTER_NEAR)
        : shy
    // WHERE FROM, before what it is worth: a shot the ground would swallow
    // is not a cheap shot, it is no shot — and the answer to a hill is a
    // different mark, not a lower score (play: "третий свин стрельнул через
    // гору"). No mark at all scores nothing, and the telemetry keeps the
    // zero so a pass has its reason on the line above it.
    const stand = standFor(
      world,
      foe,
      reach,
      (from) => clearShot(world, { ...from, health: me.health }, foe),
      walked
    )
    const score = stand === null ? 0 : trueScore(world, worth, stand.walk)
    const option: Option = {
      skill,
      kind: 'gun',
      target: foe,
      score,
      worth,
      stand: stand ?? { x: me.x, z: me.z },
      walk: stand?.walk ?? Infinity,
      reach,
      limit: rangeOf(row)
    }
    note?.(option)
    if (!best || score > best.score || (score === best.score && nearer(world, option, best))) {
      best = option
    }
  }
  return best
}

const meleeOption = (world: AiWorld, skill: number, note: Note, walked?: Walked): Option | null => {
  const blade = meleeOf(skill)
  if (!blade) return null
  const me = world.acting
  let best: Option | null = null
  for (const foe of world.foes) {
    const worth = worthOf(blade.damage, foe, world.wits)
    // A blade has no sight line of its own to clear — standing there IS the
    // shot — so the search only asks whether the legs get there dry.
    const stand = standFor(world, foe, MELEE_NEAR, () => true, walked)
    const score = stand === null ? 0 : trueScore(world, worth, stand.walk)
    const option: Option = {
      skill,
      kind: 'melee',
      target: foe,
      score,
      worth,
      stand: stand ?? { x: me.x, z: me.z },
      walk: stand?.walk ?? Infinity,
      reach: MELEE_NEAR,
      limit: MELEE_NEAR
    }
    note?.(option)
    if (!best || score > best.score || (score === best.score && nearer(world, option, best))) {
      best = option
    }
  }
  return best
}

const lobOption = (world: AiWorld, skill: number, note: Note, walked?: Walked): Option | null => {
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
    const here = { x: me.x, y: me.y, z: me.z }
    // The whole arc, measured by throwing FLAT OUT at the foe's bearing —
    // near enough for "can I reach him from here at all".
    const bearing = Math.atan2(foe.x - me.x, foe.z - me.z)
    let limit = 0
    for (const aim of aims) {
      limit = Math.max(limit, distance2d(me, flight(world, here, skill, bearing, GAUGE_FULL, aim)))
    }
    // **THE MARK FIRST, THE THROW FROM IT.** Under the arc already, the mark
    // is where the pig stands and costs nothing; past it, the mark is
    // searched for round the foe at a comfortable throwing distance — and
    // the whole parabola is then solved FROM THAT MARK, so the landing, the
    // water under it and the blast over the squad are all priced where the
    // throw will really be made. It used to be priced as if the grenade
    // landed on the foe from here, and the walk was assumed to fix the
    // difference.
    const stand: Stand | null =
      away <= limit
        ? { x: me.x, z: me.z, walk: 0 }
        : standFor(world, foe, limit * LOB_COMFORT, () => true, walked)
    const dead = (reach: number): void => {
      const option: Option = {
        skill,
        kind: 'lob',
        target: foe,
        score: 0,
        worth: 0,
        stand: { x: me.x, z: me.z },
        walk: Infinity,
        reach,
        limit
      }
      note?.(option)
    }
    if (stand === null) {
      dead(limit * LOB_COMFORT)
      continue
    }
    const from =
      stand.walk === 0 ? here : { x: stand.x, y: world.groundAt(stand.x, stand.z), z: stand.z }
    const throwAway = distance2d(from, foe)
    const heading = Math.atan2(foe.x - from.x, foe.z - from.z)
    // A SMART pig walks a ladder of come-ups (LOB_AIMS): where the 45° arc
    // dies on a hillside, a steeper pitch clears it — and its shorter arc
    // can REACH a foe the flat one cannot.
    let solved: {
      aim: number
      charge: number
      landing: { x: number; z: number; seconds: number; doused: boolean }
      miss: number
    } | null = null
    for (const aim of aims) {
      const arc = distance2d(from, flight(world, from, skill, heading, GAUGE_FULL, aim))
      if (throwAway > arc) continue
      // In the arc: SOLVE the gauge — the landing grows with the charge, so
      // halve the interval on which side of the foe it comes down.
      let low = LEAST_CHARGE * GAUGE_FULL
      let high = GAUGE_FULL
      for (let i = 0; i < 14; i++) {
        const mid = (low + high) / 2
        if (distance2d(from, flight(world, from, skill, heading, mid, aim)) < throwAway) low = mid
        else high = mid
      }
      const charge = (low + high) / 2
      const landing = flight(world, from, skill, heading, charge, aim)
      const miss = distance2d(landing, foe)
      if (!solved || miss < solved.miss) solved = { aim, charge, landing, miss }
      // Near enough is done: flat ground stops on the first rung, so the
      // ladder only costs where the ground actually interferes.
      if (solved.miss <= PITCH_SLACK) break
    }
    if (!solved) {
      dead(throwAway)
      continue
    }
    // A lob the water DOUSED is worth nothing at all — no blast, no damage,
    // the engine sets the quiet flag and it never goes off. But a throw that
    // SKIMMED is worth wherever it finally came down, which may be the far
    // bank: the dry run above follows the hops, so the test is what the
    // flight actually ended in and not merely whether the last spot is wet.
    const { landing } = solved
    const worth = landing.doused
      ? 0
      : blastWorth(world, landing, damage, spread, false, stand)
    const score = trueScore(world, worth, stand.walk)
    const option: Option = {
      skill,
      kind: 'lob',
      target: foe,
      score,
      worth,
      stand: { x: stand.x, z: stand.z },
      walk: stand.walk,
      reach: throwAway,
      limit,
      charge: solved.charge / GAUGE_FULL,
      flight: landing.seconds,
      ...(solved.aim === AIM_LOB ? {} : { aim: solved.aim })
    }
    note?.(option)
    if (!best || score > best.score) best = option
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
    stand: { x: me.x, z: me.z },
    walk: 0,
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
  note: Note,
  walked?: Walked
): Option | null => {
  const me = world.acting
  const have = world.acting.carrying.reduce(
    (best, slot) => (slot.amount !== 0 ? Math.max(best, weaponPoints(slot.skill)) : best),
    0
  )
  const appetite = appetiteOf(world)
  // **A HEALTH CRATE IS WORTH WHAT IT PUTS BACK, not what it holds.** The
  // engine has no ceiling — `Pig::Heal` adds and stops, so 50 points on a
  // 50-point grunt leaves it at a hundred and that stands (lib/game/
  // health.ts) — but a pig already at its class's own starting health has
  // nothing it can NAME to gain, and play watched what pricing the crate's
  // face value instead does: DEN took one at hp50, then crossed the whole
  // map (24 931 units, the plan line says so) for a second at hp100, then a
  // third. "Побежал за аптечкой… а потом за второй побежал."
  const missing = Math.max(0, me.maxHealth - me.health)
  const gain =
    crate.skill === null
      ? Math.min(crate.amount, missing) * appetite
      : have === 0
        ? weaponPoints(crate.skill)
        : Math.max(0, weaponPoints(crate.skill) - have) * appetite
  // The crate IS the mark — it is collected by being walked over
  // (lib/game/scenery.ts), so there is no firing position to search for.
  const walk = walked
    ? walked(crate)
    : Math.max(0, distance2d(me, crate) - COLLECT_NEAR)
  const score = trueScore(world, gain, walk)
  const option: Option = {
    skill: crate.skill ?? SKILLLESS,
    kind: 'crate',
    target: { x: crate.x, y: 0, z: crate.z, health: 0 },
    score,
    worth: gain,
    stand: { x: crate.x, z: crate.z },
    walk,
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
  judge?: (option: Option) => number,
  /** How far the LEGS go to a spot — the route's own length (`Walked`).
   * Absent, the crow line stands in. */
  walked?: Walked,
  /** Crates this turn has already walked onto and NOT collected — a health
   * crate a full-health pig cannot use, one somebody else took first. The
   * plan would otherwise pick the same one again the moment it drops, and
   * the pig would stand on it until the clock ran out. */
  skip?: (crate: { x: number; z: number }) => boolean
): Option | null {
  let best: Option | null = null
  let bestJudged = 0
  for (const crate of world.crates) {
    if (skip?.(crate)) continue
    const option = crateOption(world, crate, undefined, walked)
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
export function crateFallback(
  world: AiWorld,
  /** The crates this turn already stood on and could not collect
   * (`crateErrand`'s own `skip`). */
  skip?: (crate: { x: number; z: number }) => boolean
): Option | null {
  const me = world.acting
  let best: Option | null = null
  let nearest = Infinity
  for (const crate of world.crates) {
    if (skip?.(crate)) continue
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
      stand: { x: crate.x, z: crate.z },
      walk: away,
      reach: COLLECT_NEAR,
      limit: Infinity
    }
  }
  return best
}

/**
 * **THE ELECTION, IN ITS TWO HALVES** — the best BLOW the kit can land, and
 * the best CRATE on the ground, kept apart on purpose.
 *
 * They are not alternatives in general: a pickup spends no turn and the
 * weapon does, so a crate is usually a PREFIX to the attack rather than a
 * replacement for one, and only whoever knows the turn's shape can tell
 * which it is this time (lib/game/plan.ts). What is decided HERE is only
 * what each half is worth.
 *
 * **NOTHING SUPPRESSES A CRATE, AT ANY LEVEL OF WITS**, and that took three
 * readings to get right. "Вижу стреляю" was read here as a gate — a blow in
 * hand pricing every crate to nothing — and play threw it out: "ум 0 — это
 * не верно. он должен ВИДЕТЬ ящик; если ящик ближе чем враг или ещё как — он
 * МОЖЕТ пойти и взять ящик. но это тупой свин — он должен играть как
 * трёхлетний ребёнок."
 *
 * A three-year-old does not weigh a pickup against a shot and decline it. It
 * grabs whatever is NEAREST, crate or pig, and that is already built and did
 * not need help: the dumb eye (lib/game/grunt.ts, `NEAR_POINTS`) adds
 * `(1 − wits) · 60 / (1 + tiles)` to every judgment, which at the bottom of
 * the scale swamps any worth the kit can price and falls away to nothing
 * across the map. So the near crate wins and the far one does not, without a
 * rule saying so.
 *
 * What the wits actually turn is the OTHER end, and only that: at 1 the
 * bonus is zero, the appetite is 1, and a crate is taken exactly when it is
 * worth more than the blow. "Чем умнее тем больше думает."
 */
export function elect(
  world: AiWorld,
  note?: (option: Option) => void,
  /** The brain's own JUDGMENT of a score — misjudgment applied
   * (lib/game/grunt.ts, `MISJUDGE`). The arithmetic above stays exact;
   * what a dumb brain gets wrong is what it makes of the numbers. Absent,
   * the judgment is the truth. */
  judge?: (option: Option) => number,
  /** How far the LEGS go to a spot — the route's own length (`Walked`).
   * Absent, the crow line stands in. */
  walked?: Walked
): { blow: Option | null; crate: Option | null } {
  const rank = (
    running: { best: Option | null; judged: number },
    option: Option | null
  ): void => {
    if (!option) return
    const judged = judge ? judge(option) : option.score
    if (judged > 0 && (!running.best || judged > running.judged)) {
      running.best = option
      running.judged = judged
    }
  }
  const blow = { best: null as Option | null, judged: 0 }
  for (const slot of world.acting.carrying) {
    if (slot.amount === 0) continue
    rank(
      blow,
      isPlanted(slot.skill)
        ? plantOption(world, slot.skill, note)
        : (gunOption(world, slot.skill, note, walked) ??
            lobOption(world, slot.skill, note, walked) ??
            meleeOption(world, slot.skill, note))
    )
  }
  const crate = { best: null as Option | null, judged: 0 }
  for (const one of world.crates) rank(crate, crateOption(world, one, note, walked))
  return { blow: blow.best, crate: crate.best }
}

/**
 * The kit and the ground priced whole, best of the two halves — or null when
 * nothing scores above zero (then the pass is the honest move: a negative
 * option is never taken just for being the only one). Ties go to the kit's
 * own order, deterministic like everything here.
 *
 * The TURN reaches for `elect` instead, because it can do what this cannot:
 * take the crate AND strike after it (lib/game/plan.ts).
 */
export function priceKit(
  world: AiWorld,
  note?: (option: Option) => void,
  judge?: (option: Option) => number,
  walked?: Walked
): Option | null {
  const { blow, crate } = elect(world, note, judge, walked)
  if (!blow) return crate
  if (!crate) return blow
  const read = (one: Option): number => one.judged ?? one.score
  return read(crate) > read(blow) ? crate : blow
}
