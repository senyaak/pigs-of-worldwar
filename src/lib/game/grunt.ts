// The GRUNT: the first real brain, and the bottom of the ladder docs/ai.md
// climbs. One thought at a time, nothing clever on purpose.
//
// The CHOOSING is not here any more: the price list is
// (lib/game/evaluate.ts — every carried thing against every target, one
// currency, class-blind). What is here is the CARRYING OUT, re-derived on
// every decision from the world it is shown (almost stateless — "the
// walking has failed me" and "I have set my pitch" are the only memories):
//
//   1. nothing priceable — pass, the stub's old game (SKIP TURN, fire).
//   2. the winning option's weapon not in hand — take it out.
//   3. too far for it — ROUTE to its reach (world.route) and walk the next
//      corner.
//   4. a friend on a GUN's firing line — step aside instead of shooting
//      through him. A lob arcs over friends and a blade never reaches one:
//      their own risks are already in the price.
//   5. facing off — turn onto the bearing.
//   6. a GUN pitches at the target once — soles to soles, which is chest to
//      chest; what the clamp refuses stays refused. A lob keeps its 45°
//      come-up: the CHARGE is the aim, solved by the price list.
//   7. fire, at the option's own charge.
//
// A `blocked` walk — or a route already walked to its best end — flips the
// one bit of memory: stop trying to close in, shoot if the option still
// reaches, pass otherwise. Better a poor shot than a pig grinding a wall
// until the clock takes the turn away.

import type { AiWorld, Brain, Seen, Thought } from './ai'
import type { Order } from './orders'
import { shortest } from './actuator'
import { AIM_UNITS } from './aim'
import { crateErrand, crateFallback, priceKit } from './evaluate'
import type { Option } from './evaluate'
import { WALK_SPEED } from './movement'
import { BLAST_CORE } from './grenade'
import { GRID_STEP } from './pathfind'
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
 * rolled until its fuse beat the press (see the thrown arm). `[deliberate]`. */
export const SETTLED = 60

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
 * The seconds an errand must LEAVE ON THE CLOCK past its own walking — the
 * turning, the pitch, the gauge and the mulls of the shot that has to come
 * after the crate ("взять ящик И ударить после" — the second half is the
 * point). The walking itself is priced over crow distances at the UNSCALED
 * `WALK_SPEED` — the legs actually go `WALK_SCALE` faster — so the speed's
 * own slack covers the crow line's optimism about the path.
 * `[deliberate]` — play's dial.
 */
export const ERRAND_SPARE = 12

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
 * THE DUMB EYE: what standing NEAR a thing adds to its judgment, at the
 * bottom of the wits scale. Play's model, in play's words (2026-08-24): "я
 * тупой = что ближе всего — ящик/свин — это моя цель. вижу цель — стреляю.
 * чем умнее — тем больше свин думает." So the judgment blends TWO
 * currencies: the price list's points, and a proximity bonus of
 * `(1 − wits) · NEAR_POINTS / (1 + tiles away)` — at wits 0 the nearest
 * interesting thing dominates the election almost regardless of worth, at
 * wits 1 the bonus is zero and only the arithmetic speaks. It is a bonus
 * ADDED, not a replacement, so at ONE target the kit still sorts by damage
 * (the dumb pig shoots the near one with its better gun). An option the
 * price list killed (a blocked shot's 0, a doused lob) earns no bonus —
 * nearness must never resurrect the unplayable. `[deliberate]` — play's
 * dial, sized so adjacency (~NEAR_POINTS) outbids any single-kill worth
 * the kit can price.
 */
export const NEAR_POINTS = 60

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
  /** Walking has been refused: stop trying to close in. */
  let grounded = false
  /** The pitch has been set (or refused by the clamp): do not chase it. */
  let pitched = false
  /** The last decision explained — telemetry's copy, never read back. */
  let thought: Thought | null = null
  /** This turn's misjudgments, one factor per (kind, skill) — rolled once,
   * held to the handover, so a bad judgment is a bad PLAN, not a wobble. */
  const judgments = new Map<string, number>()
  /** This turn's aim — a heading error and a gauge error, rolled once
   * (AIM_WOBBLE, CHARGE_WOBBLE). Held for the same reason: a bearing that
   * moved between decisions is a pig re-turning forever. */
  let shaky: { heading: number; charge: number } | null = null
  /** This turn's reachability verdicts by target spot: `playable` runs a
   * whole best-effort route per fresh target, and re-asking it every mull
   * was a visible hitch on the enemy's turn (play: "подвисает ход"). */
  const reachable = new Map<string, boolean>()
  /**
   * THE PLAN — which (kind, skill, target) this turn is about, chosen once
   * and HELD. Play named the model: "мир не меняется! свин меняет мир
   * своими действиями — его передвижение не меняет его намерений." A
   * turn-based world stands still on your own turn, so re-electing a winner
   * every mull only ever CHANGES ANSWERS by accident (a tie-break flipping
   * as the walk shifts the distances). The intent is dropped exactly when
   * the world actually changed: the target is gone, the KIT changed (a
   * pickup — new options deserve a fresh election), or the plan stopped
   * being playable. Everything else re-derives EXECUTION only (the charge
   * for the current distance, the next corner).
   */
  let intent: { kind: string; skill: number; spot: string } | null = null
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

      if (world.previous === 'blocked') grounded = true

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
        // "Stops" is the BRAIN's own bar, not the renderer's: `resting` is
        // set at a crawl so low (15 u/s) that a missed throw rolled about
        // until its own fuse blew it six seconds late — telemetry, GINGER
        // 2026-08-24, one watch and then nothing. A grenade creeping under
        // SETTLED is not rolling anywhere useful; press. `[deliberate]`.
        return thrown.resting || thrown.speed < SETTLED || near
          ? say('detonate', { kind: 'fire' })
          : say('fuse', { kind: 'watch' })
      }

      const me = world.acting

      /** The next corner of the route to a goal, or null standing there. */
      const walkThe = (goal: { x: number; z: number }): Order | null => {
        const corners = world.route(goal)
        const next = corners?.find(
          (corner) => Math.hypot(corner.x - me.x, corner.z - me.z) > GRID_STEP / 2
        )
        return next ? { kind: 'walkTo', x: next.x, z: next.z } : null
      }

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
        return say(
          'flee',
          walkThe({ x: charge.x + dirX * FLEE_CLEAR, z: charge.z + dirZ * FLEE_CLEAR }) ?? {
            kind: 'watch'
          }
        )
      }

      /**
       * Whether an option can ever be FIRED — from here, or from where the
       * route actually ENDS. The route is best effort (lib/game/pathfind.ts):
       * against a bay it stops at the shore, and an option whose target
       * stays outside its own limit from there is a march to a pass.
       * Telemetry watched that march cost fifty seconds before this check
       * existed (DEN, `_tmp/ai-session-2026-08-23.log`).
       */
      const playable = (one: Option): boolean => {
        const away = Math.hypot(one.target.x - me.x, one.target.z - me.z)
        if (away <= one.limit) return true
        // One route per fresh target PER TURN (`reachable`): a full
        // best-effort search every mull was the hitch play felt.
        const spot = `${one.target.x},${one.target.z}:${Math.round(one.limit)}`
        const known = reachable.get(spot)
        if (known !== undefined) return known
        const corners = world.route({ x: one.target.x, z: one.target.z })
        const end =
          corners && corners.length > 0 ? corners[corners.length - 1] : { x: me.x, z: me.z }
        const verdict = Math.hypot(one.target.x - end.x, one.target.z - end.z) <= one.limit
        reachable.set(spot, verdict)
        return verdict
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
        const near =
          one.score <= 0
            ? 0
            : ((1 - world.wits) * NEAR_POINTS) /
              (1 + Math.hypot(one.target.x - me.x, one.target.z - me.z) / TILE_STEP)
        one.judged = (one.score + near) * factor
        return one.judged
      }

      const priced: Option[] = []
      let option = priceKit(
        world,
        (one) => {
          told.candidates.push(one)
          priced.push(one)
        },
        judge
      )
      // THE PLAN HOLDS (see `intent`): the kit unchanged and the chosen
      // (kind, skill, target) still on the table, the turn stays about it —
      // freshly priced (the charge moves with the approach), never
      // re-elected. A pickup re-opens the election; a vanished target or an
      // unplayable plan drops it.
      const spotOf = (one: Option): string => `${one.target.x},${one.target.z}`
      const sign = world.acting.carrying
        .map((slot) => `${slot.skill}:${slot.amount}`)
        .join(',')
      if (kitSign !== sign) {
        intent = null
        kitSign = sign
      }
      if (intent !== null) {
        const held = priced.find(
          (one) =>
            one.kind === intent!.kind &&
            one.skill === intent!.skill &&
            spotOf(one) === intent!.spot
        )
        if (held && held.score > 0 && playable(held)) {
          option = held
          told.held = true
        } else intent = null
      }
      // The winner it CANNOT play is no winner: take the best candidate the
      // ground allows instead, and failing every weapon, a crate is a
      // necessity (lib/game/evaluate.ts, `crateFallback`) — a pig with
      // nothing in reach still has a job.
      if (option && intent === null && !playable(option)) {
        option =
          priced
            .filter((one) => one.score > 0 && one !== option)
            .sort((a, b) => b.score - a.score)
            .find(playable) ??
          crateFallback(world) ??
          null
      }
      if (option) intent = { kind: option.kind, skill: option.skill, spot: spotOf(option) }
      told.chose = option
      if (!option) return say('pass-nothing', pass(world))

      const target = option.target
      const dx = target.x - me.x
      const dz = target.z - me.z
      const distance = Math.hypot(dx, dz)

      /** The DRY point to fight from: the shy mark inside the option's
       * reach when the ground there is dry, else pressed on toward the
       * target until it is. A firing spot in the water is no spot at all —
       * swimming hands are empty — and standing closer than the shy mark
       * only ever helps the shot. The last resort is the target's own feet,
       * wet or not: best effort, same as the route's. */
      const dryApproach = (): { x: number; z: number } => {
        for (const back of [0.8, 0.6, 0.4, 0.2, 0]) {
          const x = target.x - (dx / distance) * option.reach * back
          const z = target.z - (dz / distance) * option.reach * back
          if (!world.wet(x, z)) return { x, z }
        }
        return { x: target.x, z: target.z }
      }

      // A CRATE is walked onto — the hand-over is the walk itself
      // (lib/game/scenery.ts), so there is nothing to hold, face or fire.
      if (option.kind === 'crate') {
        if (!grounded && distance > option.reach) {
          const step = walkThe({ x: target.x, z: target.z })
          if (step) return say('crate', step)
          grounded = true
        }
        // Standing on it (it hands over next step), or unable to get there:
        // either way the next decision sees a different world.
        return grounded ? say('pass-crate', pass(world)) : say('crate-wait', { kind: 'watch' })
      }

      // A SWIMMER mid-crossing: TRANSIT ONLY. Nothing is done IN the water
      // — the hands are empty and the engine keeps them so — the fight
      // starts on dry ground, and the route chose the water exactly when
      // crossing was QUICKER than walking round (lib/game/pathfind.ts,
      // time cost: a stroke is SWIM_COST of a stride). Play's rule: "в
      // воде делать нечего — максимум сократить путь."
      if (world.swimming) {
        const step = grounded ? null : walkThe(dryApproach())
        return step ? say('transit', step) : say('shore', shore(world))
      }

      // **THE ERRAND — the crate comes FIRST when the clock affords both.**
      // Play's rule, given at the top of the wits scale: "если хватает
      // времени взять ящик и ударить после — ящик конечно же важнее всего
      // для самого умного." A pickup spends no turn — the WEAPON does — so
      // a crate worth having is collected on the way to the fight, and the
      // attack follows in the same turn. Worth having is the same judged
      // appetite as everything else (crateErrand): the dumbest brain rarely
      // believes a crate is worth the walk, the sharpest always does. The
      // clock's question: the walk there, the walk onward to the option's
      // own reach, and ERRAND_SPARE for the shot still have to fit. Once
      // collected the crate leaves `world.crates` and the next decision
      // falls straight through to the fight — no memory needed. A PLANT
      // never detours: a foe is standing in the blast.
      if (!grounded && option.kind !== 'plant') {
        const errand = crateErrand(world, judge)
        if (errand) {
          const toCrate = Math.hypot(errand.target.x - me.x, errand.target.z - me.z)
          const onward = Math.max(
            0,
            Math.hypot(target.x - errand.target.x, target.z - errand.target.z) - option.reach
          )
          if ((toCrate + onward) / WALK_SPEED + ERRAND_SPARE <= world.timeLeft) {
            const step = walkThe({ x: errand.target.x, z: errand.target.z })
            if (step) return say('errand', step)
          }
        }
      }

      // Only a GUN's shot travels the flat line a friend can stand in; a lob
      // clears heads (and its blast already paid for whoever it lands near),
      // a blade never reaches past arm's length.
      const friend = option.kind === 'gun' ? inTheWay(me, target, world.friends) : null

      // Grounded and hopeless — past the option's whole limit, or a friend
      // in the way with nowhere left to step — is a pass, and it is asked
      // BEFORE the hands: asked after, a grounded pig flip-flopped forever
      // between taking the option's weapon and taking SKIP TURN to pass
      // (measured: 249 hold decisions in one battle, rifle-skip-rifle-skip).
      const hopeless = (): boolean =>
        grounded && (distance > option.limit || friend !== null)
      if (hopeless()) return say('pass-hopeless', pass(world))

      if (me.holding !== option.skill) return say('hold', { kind: 'hold', skill: option.skill })

      // PLANTING happens where the pig already stands: press, and the flee
      // above takes over next decision.
      if (option.kind === 'plant') return say('plant', { kind: 'fire' })

      if (distance > option.reach && !grounded) {
        // Stop short of the reach mark, so arrival lands INSIDE it — at the
        // DRY approach, and by the ROUTE, not the crow's line: the next
        // corner of the best path round the walls, the water and the known
        // mines. A route with no corner left to walk means this is as close
        // as the ground allows, and the grunt is grounded the same as a
        // refused step.
        const step = walkThe(dryApproach())
        if (step) return say('walk', step)
        grounded = true
      }

      // The walk above may have GROUNDED us: ask hopeless once more before
      // stepping around friends or firing.
      if (hopeless()) return say('pass-hopeless', pass(world))

      if (friend !== null && !grounded) {
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
      pitched = false
      thought = null
      judgments.clear()
      shaky = null
      reachable.clear()
      intent = null
      kitSign = ''
    }
  }
}
