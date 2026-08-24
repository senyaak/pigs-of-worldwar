// **THE TURN'S PLAN — decided whole, before a step is taken.**
//
// Play's verdict on the brain that re-elected a winner every mull, and the
// model that replaces it (2026-08-24): "оценить весь ход ДО того, как идти."
// A turn-based world stands still on your own turn — "мир не меняется! свин
// меняет мир своими действиями" — so a turn is ONE decision: which target,
// with which weapon, from WHICH MARK, along which route. The mulls after it
// are not thinking, they are walking.
//
// What that fixes, and each of them is a thing play watched:
//
//   - "думает каждые несколько секунд… выглядит как дебил" — the election
//     ran on every corner of the walk, and a tie-break flipping as the
//     distances shifted read as a pig changing its mind.
//   - "1 шажочек вперёд, 1 поворот, и так зациклено" — the route was
//     recomputed from the pig's new spot each mull, and the string-pulling's
//     first leg out of a fresh start is often one cell long. A route decided
//     ONCE is walked corner to corner, and the corners are long.
//   - the [perf] frames — `priceKit` and a fistful of A* searches, fifteen
//     times a turn instead of once.
//
// The plan is dropped, never edited, and only when the WORLD changed under
// it: the target died, the kit changed (a pickup is the pig changing the
// world), or the legs were refused. Everything else the brain re-derives is
// EXECUTION — the next corner, the charge for the distance actually reached.

import type { AiWorld, Seen } from './ai'
import type { Option, Walked } from './evaluate'
import { crateErrand, crateFallback, priceKit } from './evaluate'
import { WALK_SPEED } from './movement'

/**
 * The seconds an errand must LEAVE ON THE CLOCK past its own walking — the
 * turning, the pitch, the gauge and the mulls of the shot that has to come
 * after the crate ("взять ящик И ударить после" — the second half is the
 * point). `[deliberate]` — play's dial.
 */
export const ERRAND_SPARE = 12

/**
 * **AND THE ERRAND HAS TO BE ON THE WAY.** The clock alone is not a bound:
 * a first-map turn is 99 seconds and `WALK_SPEED` covers four maps in one,
 * so "does it fit" said yes to everything. Play watched the result on
 * 2026-08-25 — DEN's own plan line reads `-> -1792,5376 (errand) walk
 * 24931`, which is the whole island for one health crate, and NOBBY ran
 * 4496 for another rather than shoot: "третий побежал за аптечкой — хотя
 * мог гранату кинуть во врага; тупой так и должен был сделать."
 *
 * So the DETOUR is what is measured — the walk to the crate plus the walk
 * onward, LESS the walk the turn was going to make anyway — and it may add
 * no more than this fraction of the direct walk, plus `ERRAND_REACH` so a
 * crate at the trotters is always worth the step. `[deliberate]`.
 */
export const ERRAND_DETOUR = 0.25

/** …and the detour every errand is allowed whatever the walk, in world
 * units — four tiles, near enough to be genuinely on the way. Without it a
 * blow that needs NO walk would allow no detour at all, and a crate a stride
 * away would be stepped over. `[deliberate]`. */
export const ERRAND_REACH = 4 * 512

/**
 * How far ahead the plan floods the ground: this turn's walking and one
 * more turn's. A plan may honestly want a walk that outlasts the clock —
 * the pig carries it on next turn — but nothing beyond that is a plan, it
 * is a wish, and flooding the whole map to price one costs what the search
 * used to. `[deliberate]`.
 */
export const PLAN_TURNS = 2

/** One turn, decided. */
export interface Plan {
  /** The blow the turn is FOR. */
  option: Option
  /**
   * …and the crate collected on the WAY to it, when the clock affords both
   * — play's rule at the top of the wits scale: "если хватает времени взять
   * ящик и ударить после — ящик конечно же важнее всего для самого умного."
   * A pickup spends no turn, the weapon does, so the crate is a prefix and
   * never an alternative. Collecting it changes the kit, which drops the
   * plan and re-opens the election on a richer kit — no memory needed.
   */
  errand: Option | null
  /** Where the legs are going: the crate's spot while there is an errand,
   * the blow's own mark after. */
  goal: { x: number; z: number }
  /** …and the corners of the walk there, computed ONCE (lib/game/
   * pathfind.ts). Empty when the pig already stands at the mark. */
  route: { x: number; z: number }[]
  /** How many cells the turn's one flood settled — what a `[perf]` line is
   * read against. */
  cells: number
}

/** Whether a plan is still about a world that exists: its target alive, its
 * errand still on the ground. The KIT is the brain's own business (a
 * pickup is a fresh election), and so is a refused walk. */
export const stillStands = (plan: Plan, world: AiWorld): boolean => {
  if (plan.option.kind !== 'crate' && plan.option.kind !== 'plant') {
    const target = plan.option.target
    const alive = world.foes.some((foe) =>
      foe.id !== undefined && target.id !== undefined
        ? foe.id === target.id
        : foe.x === target.x && foe.z === target.z
    )
    if (!alive) return false
  }
  if (plan.errand) {
    const crate = plan.errand.target
    if (!world.crates.some((one) => one.x === crate.x && one.z === crate.z)) return false
  }
  return true
}

/**
 * **THE WHOLE TURN, DECIDED.**
 *
 * The order is play's own: "найти цель, выбрать оружие, найти позицию
 * откуда можно стрелять; если нет — пару орудий попробовать; потом другая
 * цель." The price list runs that sweep whole (lib/game/evaluate.ts — every
 * carried thing against every foe, each pair asking the ground for a mark it
 * could be struck from), and this adds the two things a TURN needs on top:
 * the legs to the mark, and the crate that is worth picking up on the way.
 *
 * Null when nothing at all is worth doing — then the pass is the honest
 * move, and the brain says so.
 */
export function makePlan(
  world: AiWorld,
  /** The brain's own reading of a score (lib/game/grunt.ts, `MISJUDGE`). */
  judge: (option: Option) => number,
  /** Every option priced, winners and losers — the telemetry's copy. */
  note: (option: Option) => void,
  /** The crates this turn already walked onto and did not collect. */
  skip?: (crate: { x: number; z: number }) => boolean
): Plan | null {
  // ONE flood, and every mark the sweep asks about is a lookup off it.
  const ground = world.reach(WALK_SPEED * world.turnSeconds * PLAN_TURNS)
  const walked: Walked | undefined = ground ? (to) => ground.walk(to) : undefined

  // The blow: the best (item × target) the ground actually allows. Failing
  // every weapon, a crate is a NECESSITY — a pig with nothing in reach still
  // has a job (lib/game/evaluate.ts, `crateFallback`).
  const option = priceKit(world, note, judge, walked) ?? crateFallback(world, skip)
  if (!option) return null

  /**
   * The corners to a goal: off the flood when it reaches, and the one
   * best-effort A* when it does not (a crate past the budget, a mark behind
   * a bay — the walk then honestly ends short and the brain re-plans).
   *
   * The EXACT goal is added as a last corner when the flood did reach it,
   * because a route's corners are cell CENTRES and a crate is collected by
   * being walked OVER: half a cell short of one is not standing on it
   * (`COLLECT_NEAR` is 40 against a 128 grid).
   */
  const legsTo = (goal: { x: number; z: number }): { x: number; z: number }[] => {
    const reached = ground?.corners(goal) ?? null
    const legs = reached ?? world.route(goal) ?? []
    if (reached === null) return legs
    const last = legs[legs.length - 1]
    if (!last || Math.hypot(last.x - goal.x, last.z - goal.z) > 1) legs.push({ ...goal })
    return legs
  }

  // THE ERRAND. A PLANT never detours — a foe is standing in the blast —
  // and a crate is never an errand on the way to another crate.
  let errand: Option | null = null
  if (option.kind !== 'plant' && option.kind !== 'crate') {
    const found = crateErrand(world, judge, walked, skip)
    if (found) {
      // The onward leg is the crow line — one flood is one start, and the
      // slack in `ERRAND_SPARE` is what covers its optimism.
      const onward = Math.hypot(
        option.stand.x - found.target.x,
        option.stand.z - found.target.z
      )
      const together = found.walk + onward
      // ON THE WAY (ERRAND_DETOUR), and then IN THE CLOCK: the walk there,
      // the walk onward, and the spare the blow itself wants.
      const detour = together - option.walk
      const allowed = option.walk * ERRAND_DETOUR + ERRAND_REACH
      if (detour <= allowed && together / WALK_SPEED + ERRAND_SPARE <= world.timeLeft) {
        errand = found
      }
    }
  }

  const goal = errand ? { x: errand.target.x, z: errand.target.z } : option.stand
  return { option, errand, goal, route: legsTo(goal), cells: ground?.cells ?? 0 }
}

/** The plan's target as the telemetry names it. */
export const aimedAt = (plan: Plan): Seen => plan.option.target
