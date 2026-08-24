// The WALKABLE WORLD as a grid — the model both searches in lib/game/
// pathfind.ts stand on, and nothing else. What a cell IS, what standing on
// one costs, and how a chain of cells is pulled back into legs a pig walks.
//
// The cost model is the engine's own, which is to say it is TIME and the
// land has one speed (docs/ai.md): a step costs its distance on any slope,
// because the walk is one speed everywhere. The ONE exception is the
// engine's own too: a swimmer's stroke is a quarter of a stride
// (`SWIM_COST` below — play: "через воду намного медленнее"), so a wet
// step costs its distance times that, and the water is crossed exactly
// when crossing SAVES TIME, never merely distance. Otherwise the world is
// BINARY — walkable, forbidden (wall, void, known mine, a BODY), lethal
// (water for a non-swimmer) — with one real subtlety: the graph is
// DIRECTED. A drop of any height is walked off; the way back up is capped
// by the climb envelope (`WALL_CLIMB`), so an edge down is not an edge up.
//
// THE GROUND IS NOT ALWAYS THE LANDSCAPE. A bridge deck or a ramp is a
// walkway the OBSTRUCTION world holds over the terrain (lib/game/
// obstacles.ts, `standOn`), and the route stands on it exactly the way the
// walk does: the support underfoot is asked for first, within the same
// climb envelope, and only failing that does the landscape answer. On a
// deck the terrain's own verdicts do not apply — water under a bridge is
// scenery, not a grave. What this build carries as a simplification: a cell
// keeps ONE footing per search (whichever the route reached it at), so
// "under the bridge" and "on the bridge" cannot both pass through the same
// cell in one route. At a quarter-tile grid that has not mattered yet; the
// day it does, the node key grows a layer.
//
// Deterministic: fixed neighbour order, no chance, pure over its inputs.

import { WORLD_LIMIT } from './terrain'
import { SWIM_SPEED, WALL_CLIMB } from './locomotion'
import { WALK_SPEED } from './movement'
import { WATER_PROBE } from './actuator'

/**
 * What one swum unit costs in walked ones — the engine's own two speeds,
 * nothing tuned: the walk covers ~4.3 units in the time a stroke covers one
 * (`WALK_SPEED`, `SWIM_SPEED`). This is what makes the water a SHORTCUT
 * only when it truly is one: a swimmer crosses when the dry way round costs
 * more time, and walks round when it does not.
 */
export const SWIM_COST = WALK_SPEED / SWIM_SPEED

/** What the route asks of the landscape — the shape `TerrainQuery` already
 * has, and a spec fakes in ten lines. */
export interface Ground {
  walkable(x: number, z: number): boolean
  height(x: number, z: number): number
  isWater(x: number, z: number): boolean
  hasMine(x: number, z: number): boolean
  /** The WATERLINE at a wet point — where a swimmer's feet actually ride
   * (`TerrainQuery.surface`). Without it a wet cell stands on the SEABED,
   * and climbing out of any real bay reads as a cliff the legs refuse:
   * the swimmer routes in and never out. Optional only for the synthetic
   * grounds whose water has no depth. */
  surface?(x: number, z: number): number
}

/** …and of the prop world: the walkways and the walls
 * (lib/game/obstacles.ts, `Obstruction` — this is its own subset). */
export interface Standing {
  /** The deck underfoot at (x, z) reachable from `footY`, or null. */
  standOn(x: number, z: number, footY: number, reach: number): number | null
  /** Something solid in the way of a body standing at `footY`. */
  blocks(x: number, z: number, footY: number, reach: number): boolean
}

const NOTHING: Standing = { standOn: () => null, blocks: () => false }

/**
 * A battle-long memo of each CELL's water verdicts — bit 1 wade, bit 2
 * refused-to-a-non-swimmer. Water never changes during a battle, and the
 * thirteen texel probes per cell (`wetted` + `guarded`) are what a
 * cross-map search spends its time on: the turn's first decision measured
 * 130 ms cold (2026-08-24, play's "пролаги пока свин думает"). One memo
 * per battle, shared by every route; without one the probes run direct and
 * nothing changes but the bill.
 */
export type WaterMemo = Map<number, number>
export const createWaterMemo = (): WaterMemo => new Map()

export interface RouteAsk {
  ground: Ground
  /** The props — walkways to stand on, walls to refuse. None assumed. */
  obstruction?: Standing
  /** Whether water is a road or a grave (docs/ai.md: only the swimming
   * classes cross) — and a SLOW road at that: a wet step costs `SWIM_COST`
   * of a dry one. */
  swims?: boolean
  /** The battle's water memo (`createWaterMemo`) — optional, cache only. */
  water?: WaterMemo
  /**
   * **THE OTHER PIGS.** Play watched what leaving them out costs: "он не
   * обходит свина, а толкается в него, пока его не сдвинет". A body is a
   * wall the same as a crate is — a cell whose centre lies within
   * `BODY_CLEAR` of one is refused — with one exemption the search cannot
   * do without: bodies pressed up against the START are ignored, or a pig
   * standing shoulder to shoulder with a friend would have no first step
   * at all.
   */
  bodies?: { x: number; z: number }[]
}

/** The grid's pitch, world units — a quarter tile: fine enough to thread a
 * gap one prop wide, coarse enough that a whole-map search stays cheap. */
export const GRID_STEP = 128

/**
 * How near a BODY a route may pass — a pig is ~160 across (`PIG_RADIUS`),
 * and this is that, so two pigs' cells never overlap while a weapon's own
 * standing mark (a blade's 180) still lies outside. `[deliberate]`.
 */
export const BODY_CLEAR = 160

/** …and how near the START a body is ignored: a stride. A friend already
 * inside this was there before the plan and blocking the first cell only
 * strands the pig. `[deliberate]`. */
export const BODY_EXEMPT = 260

export const SIDE = Math.floor((2 * WORLD_LIMIT) / GRID_STEP) + 1
export const HALF = Math.floor(SIDE / 2)

/** Eight ways out of a node, straight before diagonal, order FIXED — the
 * tie-break is part of determinism. */
export const WAYS = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
  { dx: 1, dz: 1 },
  { dx: 1, dz: -1 },
  { dx: -1, dz: 1 },
  { dx: -1, dz: -1 }
]

/** Where the feet land on a cell, and whether they landed in water. */
export interface Landing {
  foot: number
  wade: boolean
}

/** The grid as one search sees it — every question about a cell, and the
 * string-pulling that turns a chain of them back into legs. */
export interface Grid {
  /** World unit to cell index, and back to the cell's centre. */
  gx(x: number): number
  at(g: number): number
  inside(cx: number, cz: number): boolean
  /** The flat index a search keys its maps by, and its inverse. */
  key(cx: number, cz: number): number
  cellX(k: number): number
  cellZ(k: number): number
  /** One step onto (cx, cz) arriving with the feet at `footY`: where the
   * feet land there, or null for refused. */
  step(footY: number, cx: number, cz: number): Landing | null
  /** The feet's height at the START — a walkway when the pig stands on one,
   * the landscape otherwise. */
  startFoot: number
  /**
   * A chain of grid points PULLED into legs. A grid path is made of 45°
   * elbows, and a walk that takes them literally is a pig doing "повернулся
   * — шаг — повернулся — шаг" the whole way (play watched one stall a whole
   * turn on it, turn-then-go having made every elbow a full stop). The
   * brain wants LEGS, not cells: from each point, take the farthest point a
   * straight line reaches — the line sampled at half a cell through the
   * same landing test the search used, feet carried so the climb envelope
   * still holds — and a diagonal across open ground comes back as ONE leg
   * at its true bearing.
   *
   * `spine[0]` is the START's own cell and is never a corner anybody walks
   * to; `feetAt` hands back what the search settled a cell's footing at, so
   * a leg the pull refuses falls back to a step the search itself walked.
   */
  pull(
    spine: { x: number; z: number }[],
    feetAt: (point: { x: number; z: number }) => number | undefined
  ): { x: number; z: number }[]
}

/** How far ahead the string-pulling looks for a straight leg, in spine
 * points — 24 cells is ~3000 units of one bearing, plenty to kill the grid's
 * elbows without paying a quadratic bill on a cross-map route. */
const PULL = 24

/**
 * The grid a search runs on, tied to one START (the footing it begins at,
 * and the bodies it is allowed to ignore).
 */
export function makeGrid(ask: RouteAsk, from: { x: number; z: number; y?: number }): Grid {
  const ground = ask.ground
  const props = ask.obstruction ?? NOTHING
  const swims = ask.swims ?? false

  const gx = (x: number): number => Math.round(x / GRID_STEP)
  const at = (g: number): number => g * GRID_STEP
  const inside = (cx: number, cz: number): boolean =>
    cx >= -HALF && cx <= HALF && cz >= -HALF && cz <= HALF
  const key = (cx: number, cz: number): number => (cx + HALF) * SIDE + (cz + HALF)
  const cellX = (k: number): number => Math.floor(k / SIDE) - HALF
  const cellZ = (k: number): number => (k % SIDE) - HALF

  /** The bodies that actually stand in the way — the ones pressed against
   * the start are not obstacles, they are where the pig already is. */
  const bodies = (ask.bodies ?? []).filter(
    (body) => Math.hypot(body.x - from.x, body.z - from.z) > BODY_EXEMPT
  )
  const bodied = (x: number, z: number): boolean =>
    bodies.some((body) => Math.hypot(body.x - x, body.z - z) < BODY_CLEAR)

  /** Water is asked at the CENTRE and at four shoulders half a cell out —
   * the mask is finer than the grid, and a margin thinner than a cell once
   * let a route thread a "dry" corridor straight through the bay (the
   * actuator's own water guard caught the pig at the line, and the search
   * then stood there shooting across for a simulated hour). The grid has to
   * see the water the way the LEGS do. */
  const wetted = (x: number, z: number): boolean => {
    const half = GRID_STEP / 2
    return (
      ground.isWater(x, z) ||
      ground.isWater(x + half, z) ||
      ground.isWater(x - half, z) ||
      ground.isWater(x, z + half) ||
      ground.isWater(x, z - half)
    )
  }

  /**
   * …and for a NON-SWIMMER the margin grows to the LEGS' OWN GUARD: the
   * actuator refuses a stride with water `WATER_PROBE` ahead of the feet
   * (lib/game/actuator.ts), so a cell the route hands out must hold that
   * probe from anywhere inside it — centre offset plus probe, an eight-point
   * ring. Without this the two disagreed on the seam and the disagreement
   * was a LOOP: telemetry watched a grunt walk the same corner into
   * `blocked(water)` three turns running, passing each time, until it died
   * on the spot (`_tmp/ai-session-2026-08-23.log`, DEN). The route either
   * goes AROUND now or honestly ends short; the swimmer's half-cell `wetted`
   * above is untouched — for it water is a road, priced, not a grave.
   */
  const guarded = (x: number, z: number): boolean => {
    if (wetted(x, z)) return true
    const reach = WATER_PROBE + GRID_STEP / 2
    const diag = reach * Math.SQRT1_2
    return (
      ground.isWater(x + reach, z) ||
      ground.isWater(x - reach, z) ||
      ground.isWater(x, z + reach) ||
      ground.isWater(x, z - reach) ||
      ground.isWater(x + diag, z + diag) ||
      ground.isWater(x + diag, z - diag) ||
      ground.isWater(x - diag, z + diag) ||
      ground.isWater(x - diag, z - diag)
    )
  }

  /** The landing asked at a POINT rather than a cell — what the
   * string-pulling below samples a straight leg with. `water` carries a
   * cell's memoed verdicts when the caller has them; a point sample runs
   * the probes direct. */
  const landAt = (
    footY: number,
    x: number,
    z: number,
    water?: { wade: boolean; refused: boolean }
  ): Landing | null => {
    if (bodied(x, z)) return null
    if (props.blocks(x, z, footY, WALL_CLIMB)) return null
    const deck = props.standOn(x, z, footY, WALL_CLIMB)
    let foot: number
    let wade = false
    if (deck !== null) {
      foot = deck
    } else {
      if (!ground.walkable(x, z)) return null
      wade = water ? water.wade : wetted(x, z)
      if (!swims && (water ? water.refused : wade || guarded(x, z))) return null
      if (ground.hasMine(x, z)) return null
      // A swimmer's feet ride the WATERLINE, not the seabed — measured off
      // the bed, climbing out of a real bay reads as a cliff.
      foot = wade ? (ground.surface?.(x, z) ?? ground.height(x, z)) : ground.height(x, z)
    }
    // The DIRECTED half: landing higher than the envelope reaches is a
    // climb the legs cannot make. Any drop is walked off.
    if (footY - foot > WALL_CLIMB) return null
    return { foot, wade }
  }

  /** A cell's water verdicts, through the battle's memo when there is one
   * (`WaterMemo` above) — the expansion is where the probes multiply. */
  const cellWater = (cx: number, cz: number): { wade: boolean; refused: boolean } => {
    const k = key(cx, cz)
    let bits = ask.water?.get(k)
    if (bits === undefined) {
      const x = at(cx)
      const z = at(cz)
      const wade = wetted(x, z)
      bits = (wade ? 1 : 0) | (wade || guarded(x, z) ? 2 : 0)
      ask.water?.set(k, bits)
    }
    return { wade: (bits & 1) !== 0, refused: (bits & 2) !== 0 }
  }

  const step = (footY: number, cx: number, cz: number): Landing | null => {
    if (!inside(cx, cz)) return null
    return landAt(footY, at(cx), at(cz), cellWater(cx, cz))
  }

  const startFoot =
    from.y ??
    props.standOn(from.x, from.z, ground.height(from.x, from.z), WALL_CLIMB) ??
    ground.height(from.x, from.z)

  /**
   * Whether a straight leg from a point to a point is walkable, and the
   * feet's height at its end — CELL BY CELL, not point by point: the leg is
   * judged in the same currency the search used, every cell the line crosses
   * passes the same `step`, diagonals want both shoulders open, and a WADE
   * refuses the cut outright (a swimmer's detour was priced in TIME, and a
   * straight line through the bay un-prices it).
   */
  const walksTo = (
    fromX: number,
    fromZ: number,
    fromFoot: number,
    to: { x: number; z: number }
  ): number | null => {
    let cx = gx(fromX)
    let cz = gx(fromZ)
    let foot = fromFoot
    const span = Math.hypot(to.x - fromX, to.z - fromZ)
    const strides = Math.max(1, Math.ceil(span / (GRID_STEP / 4)))
    for (let s = 1; s <= strides; s++) {
      const nx = gx(fromX + ((to.x - fromX) * s) / strides)
      const nz = gx(fromZ + ((to.z - fromZ) * s) / strides)
      if (nx === cx && nz === cz) continue
      if (nx !== cx && nz !== cz && (step(foot, cx, nz) === null || step(foot, nx, cz) === null)) {
        return null
      }
      const landing = step(foot, nx, nz)
      if (landing === null || landing.wade) return null
      foot = landing.foot
      cx = nx
      cz = nz
    }
    return foot
  }

  const pull = (
    spine: { x: number; z: number }[],
    feetAt: (point: { x: number; z: number }) => number | undefined
  ): { x: number; z: number }[] => {
    const corners: { x: number; z: number }[] = []
    const cornerFeet: number[] = []
    let pullX = from.x
    let pullZ = from.z
    let pullFoot = startFoot
    // spine[0] is the START's own cell: not a corner anybody walks to.
    for (let i = 1; i < spine.length; ) {
      let take = i
      let foot: number | null = null
      for (let j = Math.min(spine.length - 1, i + PULL); j > i; j--) {
        foot = walksTo(pullX, pullZ, pullFoot, spine[j])
        if (foot !== null) {
          take = j
          break
        }
      }
      // The next spine point is one grid move away and the search itself
      // just walked it, so falling back to it never loses the path.
      if (foot === null) foot = feetAt(spine[take]) ?? pullFoot
      corners.push(spine[take])
      cornerFeet.push(foot)
      pullX = spine[take].x
      pullZ = spine[take].z
      pullFoot = foot
      i = take + 1
    }
    // …and PULL ONCE MORE, over the CORNERS. `PULL` bounds the spine
    // lookahead, so a straight leg LONGER than PULL cells is invisible until
    // the corners exist: GINGER's opening was a 405-unit micro-leg 38° off
    // the bearing, reversed by the very next 3400-unit leg — the direct line
    // was never even tested, 27 cells being past the horizon (telemetry,
    // 2026-08-24, "второй свин всегда начинает свой путь как-то странно").
    // Corners are few and a removal re-tries the same slot, so the pass
    // stays cheap.
    for (let i = 0; i + 1 < corners.length; ) {
      const prevX = i === 0 ? from.x : corners[i - 1].x
      const prevZ = i === 0 ? from.z : corners[i - 1].z
      const prevFoot = i === 0 ? startFoot : cornerFeet[i - 1]
      const foot = walksTo(prevX, prevZ, prevFoot, corners[i + 1])
      if (foot === null) {
        i++
        continue
      }
      corners.splice(i, 1)
      cornerFeet.splice(i, 1)
      cornerFeet[i] = foot
    }
    return corners
  }

  return { gx, at, inside, key, cellX, cellZ, step, startFoot, pull }
}
