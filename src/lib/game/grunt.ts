// The GRUNT: the first real brain, and the bottom of the ladder docs/ai.md
// climbs. One thought at a time, nothing clever on purpose.
//
// THE CHOOSING IS NOT HERE, and since 2026-08-24 neither is the DECIDING.
// The price list weighs every carried thing against every target and finds
// the mark each could be struck from (lib/game/evaluate.ts); the PLAN takes
// that and decides the whole turn before a step is taken — target, weapon,
// mark, route, and the crate worth collecting on the way (lib/game/plan.ts).
// What is left here is the CARRYING OUT:
//
//   1. no plan the world still supports — make one; none to be made, pass.
//   2. corners left on the plan's route — walk the next one.
//   3. the plan's weapon not in hand — take it out.
//   4. a friend on a GUN's firing line — step aside instead of shooting
//      through him. A lob arcs over friends and a blade never reaches one:
//      their own risks are already in the price.
//   5. facing off — turn onto the bearing.
//   6. a GUN pitches at the target once — soles to soles, which is chest to
//      chest; what the clamp refuses stays refused. A lob keeps its 45°
//      come-up unless the price list tuned one: the CHARGE is the aim.
//   7. fire, at the option's own charge.
//
// **THE PLAN IS DROPPED, NEVER EDITED.** Play's model: "мир не меняется!
// свин меняет мир своими действиями — его передвижение не меняет его
// намерений." So a mull is not a re-election. The plan goes when the world
// actually moved under it — the target died, the kit changed (a pickup is
// the pig changing the world), the legs were refused — and a fresh one is
// made from where the pig now stands.
//
// A `blocked` walk twice over — or a route already walked to its end — flips
// the one bit of memory: stop trying to close in, shoot if the option still
// reaches, pass otherwise. Better a poor shot than a pig grinding a wall
// until the clock takes the turn away.

import type { AiWorld, Brain, Seen, Thought } from './ai'
import type { Order } from './orders'
import { ARRIVE_WITHIN, shortest } from './actuator'
import { AIM_UNITS } from './aim'
import type { Option } from './evaluate'
import { BLAST_CORE } from './grenade'
import { GRID_STEP } from './pathfind'
import type { Plan } from './plan'
import { makePlan, stillStands } from './plan'
import { SKILL } from './skills'
import { TILE_STEP } from '../formats/pmg'

/** Close enough on the heading to trust the shot — under two turn steps. */
export const FACING = 0.02

/** A friend within this of the firing line is IN THE WAY (a pig's body is
 * ~32 across; the lane is wider because the grunt is careful, not precise). */
export const FRIEND_CLEARANCE = 60

/** How far aside the grunt steps to clear a friend off the line. */
export const SIDE_STEP = 150

/** The pitch is corrected when it is off by more than this (aim units) —
 * twice the actuator's own arrival tolerance, so a wanted angle it has
 * already reached is never re-asked. */
export const PITCH_WITHIN = 12

/** How far a pig runs from a charge it has planted before it stops
 * worrying — TNT's own rim is ~1700 (lib/game/grenade.ts, `blastReach`),
 * and the margin is a stride. `[deliberate]`. */
export const FLEE_CLEAR = 1900

/** Under this speed (units/s) a thrown grenade counts as DOWN to the brain
 * and the detonator is pressed — four exe-units a frame, a crawl. The
 * renderer's own `resting` bar is 1/frame, low enough that a missed throw
 * rolled until its fuse beat the press (see the thrown arm). `[deliberate]`.
 * The FALLBACK bar: a priced throw carries a PLAN instead (`flight`). */
export const SETTLED = 60

/** How long past the PLANNED landing the press waits, seconds — the dry run
 * lands on its first ground contact and the real throw's charge is wobbled,
 * so pressing dead on the plan can burst in the air short of the spot. A
 * beat late is a landed grenade; early is a wasted one. `[deliberate]`. */
export const PRESS_GRACE = 0.2

/**
 * How badly the DUMBEST brain misjudges what a thing is worth — the
 * docs/ai.md knob table's "estimate error", applied to the JUDGMENT: the
 * price list's arithmetic stays exact and what a low-wits brain gets wrong
 * is what it makes of the numbers, so its odd choices are honest mistakes,
 * not dice ("the pig genuinely aimed with a bad estimate, it did not roll a
 * die"). Play asked for it in as many words: "умность слишком большая — они
 * всегда выбирали бить свиней гранатами, и никогда ящик или винтовку."
 *
 * Each (kind, skill) pair is misjudged ONCE PER TURN — the factor is rolled
 * lazily off the battle's one stream and held until `reset` — because a
 * judgment re-rolled every mull flip-flops the plan mid-carry (the
 * rifle-skip-rifle class of bug, already paid for once). At wits 0 a score
 * reads anywhere in ±MISJUDGE of itself; at wits 1 the judgment is the
 * truth. `[deliberate]` — play's dial.
 */
export const MISJUDGE = 0.75

/**
 * How far off the SHOT itself lands at the bottom of the wits scale — the
 * docs/ai.md "actuator noise" knob ("over-turns the aim, over-holds the
 * gauge"), asked for by play in one line: "слишком сильно точно стреляет".
 * A heading error in radians and a gauge error as a fraction, both scaled
 * by (1 − wits) and both rolled ONCE PER TURN like the misjudgment — a
 * wobble re-rolled every decision is a pig endlessly re-turning to a
 * bearing that will not sit still. `[deliberate]` — play's dials.
 */
export const AIM_WOBBLE = 0.08
export const CHARGE_WOBBLE = 0.15

/**
 * **THE DUMB EYE: at the bottom of the scale a judgment is NEARNESS AND
 * CHANCE, and the worth is not in it at all.**
 *
 * Play's model, in play's words (2026-08-24): "я тупой = что ближе всего —
 * ящик/свин — это моя цель. вижу цель — стреляю. чем умнее — тем больше свин
 * думает." And the two corrections that finished it a day later, both about
 * the same thing — that a three-year-old does not READ VALUES:
 *
 *   - "50 очков. но тупой это не различает." A health crate is fifty points
 *     and a rifle shot is twenty, and the dumb pig cannot tell which is the
 *     better of them. It does not need a rule: `NEAR_POINTS` is sized so
 *     that at the bottom of the scale the eye SWAMPS the arithmetic — sixty
 *     points at the trotters against a shot worth twenty — so the worth is
 *     in the sum and is not what decides.
 *
 *     **Taking it out of the sum ALTOGETHER was built and measured and it
 *     does not work**: with the worth gone the machine could not finish
 *     mission 1 at all — no verdict in 3600 simulated seconds against 402
 *     with it, thirty shots for three kills — because a brain that cannot
 *     tell a foe from a box has no reason to close on anything. Nearness
 *     that DOMINATES is play's rule; nearness ALONE is a pig that never
 *     finishes the battle.
 *   - "я б сделал своего рода рандом — тупой может и ящик взять, может и
 *     тупо стрельнуть." Nearness sets the ODDS; the misjudgment factor
 *     (`MISJUDGE`, rolled once a turn off the battle's own stream) is what
 *     turns them into an answer. Two things about equally near come out a
 *     toss, and the same world still answers the same way twice — which
 *     lockstep needs and a die would break.
 *
 * The bonus is `(1 − wits) · NEAR_POINTS / (1 + tiles / NEAR_HALF)`. An
 * option the price list KILLED (a blocked shot's 0, a doused lob) earns no
 * bonus — nearness must never resurrect the unplayable, and that is the one
 * thing the dumbest pig still tells apart. `[deliberate]` — play's dial.
 *
 * **BOTH NUMBERS WERE RESIZED 2026-08-25 off a play session, and the old ones
 * are why the eye did nothing.** Play: "второй свин побежал мимо двух которые
 * ближе, к третьему у которого хп поменьше — я ж говорил, просто ближайшего
 * тупой берёт, откуда у него мысли про добивания?" The log
 * (`_tmp/telemetry-2026-08-25T17-03-25.log`) says it was never a thought about
 * finishing anybody off — the kill bonus is `KILL_BONUS · wits`, under two
 * points at mission one — and it was not arithmetic either. It was that the
 * eye had no weight left at map range: GINGER's three grenade options scored
 * 28, 28 and 27, every foe about thirty tiles off across the bay, and
 * `60 / (1 + 30)` is under two points of separation between the nearest and
 * the furthest. What actually chose was `MISJUDGE`, whose spread at these wits
 * is ±72 per cent — a toss, over a field where nearness was noise.
 *
 * So the eye is sized against the SCORE SCALE rather than against nothing (a
 * shot is worth about twenty and a health crate fifty), and it FALLS OFF on
 * the map's own scale rather than the tile's: `NEAR_HALF` is the distance at
 * which the pull is halved, eight tiles, so an option ten tiles off still
 * outbids one thirty tiles off by fifty-odd points instead of by three. The
 * old `1 + tiles` had halved it at a single tile, which on a map fifty tiles
 * across meant every option outside spitting distance looked equally far.
 */
export const NEAR_POINTS = 240

/** Where the dumb eye's pull is HALVED, in tiles — the map's scale, not the
 * tile's (see NEAR_POINTS). `[deliberate]` — play's dial. */
export const NEAR_HALF = 8

/**
 * How near a corner the NEXT one is taken up — a stride and a half, which is
 * about what the legs cover while the turn rate swings them a quarter of a
 * circle. Small enough that the cut never leaves the corridor the route
 * threaded, big enough that the pig rounds a bend instead of arriving at it,
 * stopping and turning. `[deliberate]` — play's dial.
 */
export const TURN_IN = 384

/** How many refusals in a row before the grunt stops trying to close in. A
 * body steps aside, a wall does not, and one re-plan is what tells them
 * apart (play: "он не обходит свина, а толкается в него"). `[deliberate]`. */
export const REFUSALS_BEFORE_GROUNDED = 2

/** The nearest DRY ground, by ring search off the crow line: what a pig
 * with no business in the water swims for. An ocean with no shore in reach
 * is watched to its end. */
const shore = (world: AiWorld): Order => {
  const me = world.acting
  for (const radius of [250, 450, 700, 1000, 1400]) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * 2 * Math.PI
      const x = me.x + Math.sin(angle) * radius
      const z = me.z + Math.cos(angle) * radius
      if (!world.wet(x, z)) return { kind: 'walkTo', x, z }
    }
  }
  return { kind: 'watch' }
}

/** The friend most in the way of a shot from `at` toward `target`, or null
 * for a clear lane. Flat geometry: distance from the segment, 2D. */
const inTheWay = (
  at: { x: number; z: number },
  target: Seen,
  friends: Seen[]
): { across: number } | null => {
  const dx = target.x - at.x
  const dz = target.z - at.z
  const span = Math.hypot(dx, dz)
  if (span === 0) return null
  const ux = dx / span
  const uz = dz / span
  for (const friend of friends) {
    const along = (friend.x - at.x) * ux + (friend.z - at.z) * uz
    if (along <= 0 || along >= span) continue
    const across = (friend.x - at.x) * uz - (friend.z - at.z) * ux
    if (Math.abs(across) < FRIEND_CLEARANCE) return { across }
  }
  return null
}

export function createGruntBrain(): Brain {
  /** Walking has been refused for good: stop trying to close in. */
  let grounded = false
  /** …and how many refusals it has taken so far this turn. */
  let refusals = 0
  /** The pitch has been set (or refused by the clamp): do not chase it. */
  let pitched = false
  /** The PLANNED press: seconds after the release the priced throw comes
   * down (the dry-run's own clock, wobble applied), or null for a throw
   * fired without a plan. */
  let press: number | null = null
  /** The last decision explained — telemetry's copy, never read back. */
  let thought: Thought | null = null
  /** This turn's misjudgments, one factor per (kind, skill) — rolled once,
   * held to the handover, so a bad judgment is a bad PLAN, not a wobble. */
  const judgments = new Map<string, number>()
  /** This turn's aim — a heading error and a gauge error, rolled once
   * (AIM_WOBBLE, CHARGE_WOBBLE). Held for the same reason: a bearing that
   * moved between decisions is a pig re-turning forever. */
  let shaky: { heading: number; charge: number } | null = null
  /** **THE TURN'S PLAN** (lib/game/plan.ts) and how much of its route is
   * already behind us. Made once, dropped whole, never edited. */
  let plan: Plan | null = null
  let leg = 0
  /** The crates this turn walked onto and could not collect — struck off so
   * the next plan does not send the pig back to the same one (see the crate
   * rung below). */
  const tried = new Set<string>()
  /** What the kit looked like when the plan was made — a pickup or a spent
   * slot is the pig CHANGING the world, and that re-opens the election. */
  let kitSign = ''

  // Passing takes the hands (SKIP TURN is fired like any skill), and
  // swimming hands are EMPTY — the engine strips them (lib/game/battle.ts)
  // — so a pass decided in the water becomes the swim out of it.
  const pass = (world: AiWorld): Order =>
    world.swimming
      ? shore(world)
      : world.acting.holding === SKILL.SKIP_TURN
        ? { kind: 'fire' }
        : { kind: 'hold', skill: SKILL.SKIP_TURN }

  const signOf = (world: AiWorld): string =>
    world.acting.carrying.map((slot) => `${slot.skill}:${slot.amount}`).join(',')

  return {
    decide(world) {
      // The account of THIS decision, filled as the ladder runs: `say` stamps
      // which rung answered, the price list pours its candidates in below.
      const told: Thought = { rung: '?', candidates: [], chose: null }
      thought = told
      const say = (rung: string, order: Order): Order => {
        told.rung = rung
        return order
      }

      // A REFUSAL is the world saying no. The first one drops the plan — the
      // ground is not what the route thought it was, or a body is standing
      // in it — and the second gives up on closing in altogether.
      if (world.previous === 'blocked') {
        refusals++
        plan = null
        if (refusals >= REFUSALS_BEFORE_GROUNDED) grounded = true
      }

      // IN THE WATER a non-swimmer has exactly one thought: THE SHORE.
      // Water kills it by degrees, the engine strips the weapon from
      // swimming hands, and pricing a kit mid-drowning is how a pig once
      // stood in the bay re-taking its grenade every second until it died
      // (the log is in the commit). A SWIMMER falls through: the water is
      // not killing it, so the plan below carries on — transit only, the
      // gate past the price list keeps the hands out of it.
      if (world.swimming && !world.swims) return say('shore', shore(world))

      // A grenade of OURS is in the air or rolling: the fire key is the
      // detonator now, and timing it is the whole decision. Set it off the
      // moment it stops, or the moment it rolls inside the CORE of a foe —
      // full damage, no reason to let it roll away again. Otherwise watch.
      if (world.thrown !== null) {
        const thrown = world.thrown
        // **THE DETONATION WINDOW IS THE WITS DIAL.** Play's spec, whole:
        // "нажимать взрыв — тупёж это плохо, надо в радиусе свина нажимать;
        // тупняк только насколько далеко — на самом краю, что единичку
        // снесёт, или в центре; чем тупее, тем ближе к краю." So everybody
        // presses inside the blast's own radius of a foe — the dumbest the
        // moment it grazes the RIM (a point or two), the sharpest not until
        // the CORE (full damage). A grenade that never comes near anybody
        // is still set off the moment it rests, at every level.
        const trigger = BLAST_CORE + (thrown.rim - BLAST_CORE) * (1 - world.wits)
        const near = world.foes.some(
          (foe) => Math.hypot(foe.x - thrown.x, foe.z - thrown.z) <= trigger
        )
        // THE PLAN, not the sensors (play: "траектория уже должна быть у
        // мозга и он точно должен знать когда нажать"): the dry run that
        // priced the throw already flew it, so the press is a CLOCK — the
        // planned flight, wobble applied, plus PRESS_GRACE — with the
        // near-a-foe window still allowed to fire it early. The sensors
        // (`resting`, SETTLED) stay only for a throw that never carried a
        // plan.
        const due =
          press !== null
            ? thrown.age >= press + PRESS_GRACE
            : thrown.resting || thrown.speed < SETTLED
        return due || near
          ? say('detonate', { kind: 'fire' })
          : say('fuse', { kind: 'watch' })
      }

      const me = world.acting

      // A charge of OURS is armed in the ground: BE SOMEWHERE ELSE. Run out
      // of its rim — away from it, or straight backwards when it lies at
      // our own feet (the pig plants facing its target; backwards is away
      // from both). The turn was hurried to four seconds by the planting
      // (lib/game/spend.ts); this is what they are for.
      if (world.planted !== null) {
        const charge = world.planted
        const away = Math.hypot(me.x - charge.x, me.z - charge.z)
        if (away >= FLEE_CLEAR) return say('fled', { kind: 'watch' })
        const dirX = away < 1 ? -Math.sin(me.heading) : (me.x - charge.x) / away
        const dirZ = away < 1 ? -Math.cos(me.heading) : (me.z - charge.z) / away
        const corners = world.route({
          x: charge.x + dirX * FLEE_CLEAR,
          z: charge.z + dirZ * FLEE_CLEAR
        })
        const next = corners?.find(
          (corner) => Math.hypot(corner.x - me.x, corner.z - me.z) > GRID_STEP / 2
        )
        return say('flee', next ? { kind: 'walkTo', x: next.x, z: next.z } : { kind: 'watch' })
      }

      // The brain's own reading of a score (see MISJUDGE): wide at the
      // bottom of the wits scale, the truth at the top.
      const spread = MISJUDGE * (1 - world.wits)
      const judge = (one: Option): number => {
        const key = `${one.kind}:${one.skill}`
        let factor = judgments.get(key)
        if (factor === undefined) {
          factor = 1 + spread * (2 * world.roll() - 1)
          judgments.set(key, factor)
        }
        // The dumb eye (NEAR_POINTS above): the nearest thing pulls the
        // judgment toward itself, harder the lower the wits — and not at
        // all for an option the price list already killed.
        //
        // **HOW FAR IS WHAT THE LEGS PAY**, not what the crow flies: the
        // greater of the walk to the mark and the line to the target itself.
        // Play watched a pig cross half a map for a crate past every enemy
        // ("второй свин побежал через пол карты за ящиком — мимо всех
        // врагов"), and the log says why — the crate was 31 tiles off in a
        // straight line and NINETY-NINE round the bay (`walk 50855, legs
        // 23`), so by the crow's line it looked about as near as the foes.
        // The line to the target is still in it, because a foe you can shoot
        // from where you stand costs no walk at all and must still read as
        // near or far.
        const away = Math.max(
          Math.hypot(one.target.x - me.x, one.target.z - me.z),
          Number.isFinite(one.walk) ? one.walk : 0
        )
        const near =
          one.score <= 0 ? 0 : ((1 - world.wits) * NEAR_POINTS) / (1 + away / TILE_STEP / NEAR_HALF)
        one.believed = one.score * factor
        // **THE MISJUDGMENT IS ABOUT THE VALUE, NEVER ABOUT THE DISTANCE** —
        // which is why the eye is ADDED to the misjudged score instead of
        // being misjudged with it. A three-year-old cannot tell fifty points
        // from twenty; it can tell what is under its nose. With the eye
        // inside the product a generous factor multiplied the nearness too,
        // and that is exactly what play watched: NOBBY judged a grenade at a
        // foe seven tiles off 257 and a rifle at one HALF A TILE away 227,
        // because the grenade's roll came up 1.7 and scaled its 121 points of
        // nearness with it (`_tmp/telemetry-2026-08-25T18-16-01.log`). Added
        // instead, the near foe wins 227 to 172 — and the toss still decides
        // between things that are equally near, which is what it was for.
        one.judged = one.believed + near
        return one.judged
      }

      // **THE PLAN.** Kept while the world it was made about still stands;
      // a pickup or a spent slot is the pig having CHANGED that world, and
      // re-opens the election on the kit it now holds.
      const sign = signOf(world)
      if (kitSign !== sign) {
        plan = null
        kitSign = sign
      }
      if (plan !== null && !stillStands(plan, world)) plan = null
      if (plan === null) {
        plan = makePlan(
          world,
          judge,
          (one) => told.candidates.push(one),
          (crate) => tried.has(`${crate.x},${crate.z}`)
        )
        leg = 0
      } else {
        // The plan HOLDS, and `candidates` stays EMPTY on purpose: the price
        // list is what a turn spends its time on, and re-running it to fill
        // a log is the bill the plan was made to stop paying. The kit line
        // was written the decision the plan was made.
        told.held = true
      }
      told.chose = plan?.option ?? null
      if (plan === null) return say('pass-nothing', pass(world))

      const option = plan.option
      const target = option.target
      const dx = target.x - me.x
      const dz = target.z - me.z
      const distance = Math.hypot(dx, dz)

      // **WALK THE PLAN'S OWN ROUTE**, corner to corner. The corners were
      // pulled into long legs ONCE (lib/game/pathgrid.ts) and they are not
      // re-derived: re-routing from the pig's new spot every mull is what
      // made the first leg one cell long over and over — "1 шажочек вперёд,
      // 1 поворот, и так зациклено".
      while (
        leg < plan.route.length &&
        Math.hypot(plan.route[leg].x - me.x, plan.route[leg].z - me.z) <=
          // A corner with another behind it is handed over a stride EARLY
          // (TURN_IN), so the swing onto the next leg starts before the
          // corner instead of at it — play: "надо чтобы по дороге можно
          // было выворачивать на них". The LAST corner is the mark the blow
          // is struck from and gets no such licence: arriving at it is the
          // point.
          (leg + 1 < plan.route.length ? TURN_IN : GRID_STEP / 2)
      ) {
        leg++
      }
      /**
       * **THE ZONE THE LEGS ARE AIMED INTO**, and it is the same number this
       * loop hands a corner over on, so the hands and the brain cannot
       * disagree about what "arrived" means (lib/game/actuator.ts,
       * `Order.walkTo.within`). Play's shape: "чем точнее надо встать, тем
       * меньше зона."
       *
       * A corner with another behind it is a WAYPOINT — anywhere inside
       * `TURN_IN` of it is on the route. The last one is where the job
       * happens, and how tight it has to be is what the job says: a crate is
       * COLLECTED by being walked over, so it takes the floor, while a firing
       * mark is a grid cell whose shot the search already cleared, so half a
       * cell is the same cell and the shot still stands.
       */
      const zone =
        leg + 1 < plan.route.length
          ? TURN_IN
          : plan.errand !== null || plan.option.kind === 'crate'
            ? ARRIVE_WITHIN
            : GRID_STEP / 2
      const walking = !grounded && leg < plan.route.length
      told.plan = {
        goal: plan.goal,
        walk: plan.errand ? plan.errand.walk : plan.option.walk,
        legs: plan.route.length - leg,
        errand: plan.errand !== null,
        cells: plan.cells
      }

      // A SWIMMER mid-crossing: TRANSIT ONLY. Nothing is done IN the water
      // — the hands are empty and the engine keeps them so — the fight
      // starts on dry ground, and the route chose the water exactly when
      // crossing was QUICKER than walking round (lib/game/pathfind.ts,
      // time cost: a stroke is SWIM_COST of a stride). Play's rule: "в
      // воде делать нечего — максимум сократить путь."
      if (world.swimming) {
        return walking
          ? say('transit', {
              kind: 'walkTo',
              x: plan.route[leg].x,
              z: plan.route[leg].z,
              within: zone
            })
          : say('shore', shore(world))
      }

      if (walking) {
        // The ERRAND leg and the fighting leg are the same walk to the
        // hands; the rung is named apart only so a log reads as a story.
        return say(plan.errand ? 'errand' : 'walk', {
          kind: 'walkTo',
          x: plan.route[leg].x,
          z: plan.route[leg].z,
          within: zone
        })
      }

      // AT THE CRATE. The hand-over is the walk itself (lib/game/scenery.ts),
      // so there is nothing to hold, face or fire: the pickup changes the
      // kit and the next decision re-plans on the richer one. Standing on
      // one that never arrived (somebody else took it, or the legs ended
      // short) is a plan the world no longer supports — drop it and think
      // again on the next beat.
      if (plan.errand !== null || option.kind === 'crate') {
        const errand = plan.errand ?? option
        // The legs are done with it and the kit did not change — it is not
        // a crate this pig can use (a health crate at full health), or
        // somebody else took it first, or the walk honestly ended short.
        // Struck off for the rest of the turn so the next plan does not walk
        // straight back to it, and the plan is dropped: there is a whole
        // other turn to spend.
        tried.add(`${errand.target.x},${errand.target.z}`)
        const rung = plan.errand ? 'errand-done' : 'crate-done'
        plan = null
        return say(rung, { kind: 'watch' })
      }

      // Only a GUN's shot travels the flat line a friend can stand in; a lob
      // clears heads (and its blast already paid for whoever it lands near),
      // a blade never reaches past arm's length.
      const friend = option.kind === 'gun' ? inTheWay(me, target, world.friends) : null

      // Past the option's whole limit with no walking left, or a friend in
      // the way with nowhere to step, is a pass — and it is asked BEFORE the
      // hands: asked after, a grounded pig flip-flopped forever between
      // taking the option's weapon and taking SKIP TURN to pass (measured:
      // 249 hold decisions in one battle, rifle-skip-rifle-skip).
      const hopeless = distance > option.limit || (friend !== null && grounded)
      if (hopeless) return say('pass-hopeless', pass(world))

      if (me.holding !== option.skill) return say('hold', { kind: 'hold', skill: option.skill })

      // PLANTING happens where the pig already stands: press, and the flee
      // above takes over next decision.
      if (option.kind === 'plant') return say('plant', { kind: 'fire' })

      if (friend !== null) {
        // Step off the line the OTHER way from where the friend leans.
        const ux = dx / distance
        const uz = dz / distance
        const side = -Math.sign(friend.across) * SIDE_STEP
        return say('sidestep', { kind: 'walkTo', x: me.x + uz * side, z: me.z - ux * side })
      }

      // THE HANDS SHAKE at the bottom of the wits scale (AIM_WOBBLE,
      // CHARGE_WOBBLE): the bearing is off by a held per-turn error, the
      // gauge over- or under-held by another. Rolled lazily, once.
      if (shaky === null) {
        const swing = 1 - world.wits
        shaky = {
          heading: (2 * world.roll() - 1) * AIM_WOBBLE * swing,
          charge: (2 * world.roll() - 1) * CHARGE_WOBBLE * swing
        }
      }
      const bearing = Math.atan2(dx, dz) + shaky.heading
      if (Math.abs(shortest(bearing - me.heading)) > FACING) {
        return say('turn', { kind: 'turnTo', heading: bearing })
      }

      // The pitch, GUNS only: Y-DOWN, so standing ABOVE the target means my
      // y is the smaller and the barrel goes DOWN — atan2 of the drop over
      // the reach, in the aim's own 4096-a-turn units. Once. A lob's pitch
      // is its 45° come-up and its aim is the charge — UNLESS the price
      // list tuned one (evaluate.ts, TUNE_PITCH_WITS): a smart pig's throw
      // over a hill carries the come-up its charge was solved at.
      if (option.kind === 'gun' && !pitched) {
        const wanted = Math.round(
          (Math.atan2(me.y - target.y, distance) / (2 * Math.PI)) * AIM_UNITS
        )
        if (Math.abs(wanted - me.aim) > PITCH_WITHIN) {
          pitched = true
          return say('pitch', { kind: 'aimTo', angle: wanted })
        }
      }
      if (option.kind === 'lob' && option.aim !== undefined && !pitched) {
        if (Math.abs(option.aim - me.aim) > PITCH_WITHIN) {
          pitched = true
          return say('pitch', { kind: 'aimTo', angle: option.aim })
        }
      }
      // A lob's press is PLANNED here, before the button goes down: the
      // dry-run's flight, stretched by the same shake the charge takes —
      // time of flight scales with the launch speed, so the wobble is
      // accounted once, not sensed later.
      if (option.kind === 'lob' && option.flight !== undefined) {
        press = option.flight * (1 + shaky.charge)
      }
      return say(
        'fire',
        option.charge === undefined
          ? { kind: 'fire' }
          : // The solved gauge, over- or under-held by the turn's own shake.
            { kind: 'fire', charge: Math.max(0, Math.min(1, option.charge * (1 + shaky.charge))) }
      )
    },
    explain: () => thought,
    reset() {
      grounded = false
      refusals = 0
      pitched = false
      press = null
      thought = null
      judgments.clear()
      shaky = null
      plan = null
      leg = 0
      tried.clear()
      kitSign = ''
    }
  }
}
