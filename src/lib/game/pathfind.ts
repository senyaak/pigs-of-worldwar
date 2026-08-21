// The route round the world: A* on a coarse grid, for brains to walk by.
//
// The cost model is the engine's own, which is to say THERE ISN'T ONE
// (docs/ai.md): a step costs its distance everywhere, because the walk is
// one speed on any slope. The world is BINARY — walkable, forbidden (wall,
// void, known mine), lethal (water for a non-swimmer) — with one real
// subtlety: the graph is DIRECTED. A drop of any height is walked off; the
// way back up is capped by the climb envelope (`WALL_CLIMB`), so an edge
// down is not an edge up.
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
// BEST EFFORT by design: when the goal cannot be reached — enclosed, over
// water, out of the world — the route returned is to the reachable point
// NEAREST the goal, never null for "no way". A brain wants "get as close as
// you can", and a refusal teaches it nothing; the actuator's own `blocked`
// still guards the difference between the plan and the ground truth
// (lib/game/actuator.ts). Null means only that the START itself stands
// outside the grid's world.
//
// Deterministic: fixed neighbour order, no chance, pure over its inputs.

import { WORLD_LIMIT } from './terrain'
import { WALL_CLIMB } from './locomotion'

/** What the route asks of the landscape — the shape `TerrainQuery` already
 * has, and a spec fakes in ten lines. */
export interface Ground {
  walkable(x: number, z: number): boolean
  height(x: number, z: number): number
  isWater(x: number, z: number): boolean
  hasMine(x: number, z: number): boolean
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

export interface RouteAsk {
  ground: Ground
  /** The props — walkways to stand on, walls to refuse. None assumed. */
  obstruction?: Standing
  /** Whether water is a road or a grave (docs/ai.md: only the swimming
   * classes cross). */
  swims?: boolean
}

/** The grid's pitch, world units — a quarter tile: fine enough to thread a
 * gap one prop wide, coarse enough that a whole-map search stays cheap. */
export const GRID_STEP = 128

/** The search gives up after this many nodes taken off the open list — a
 * whole 193×193 world is ~37k, so this is "the map, roughly once". */
const EXPANDED_CAP = 40000

const SIDE = Math.floor((2 * WORLD_LIMIT) / GRID_STEP) + 1
const HALF = Math.floor(SIDE / 2)

/** Eight ways out of a node, straight before diagonal, order FIXED — the
 * tie-break is part of determinism. */
const WAYS = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
  { dx: 1, dz: 1 },
  { dx: 1, dz: -1 },
  { dx: -1, dz: 1 },
  { dx: -1, dz: -1 }
]

/**
 * The route from `from` to `to`, as the corners of a walk — grid points
 * with collinear runs merged, `from` itself not included. Empty when the
 * start already stands as close as the grid can put it. `from.y` is the
 * feet's height when known (a pig already ON a walkway), the landscape's
 * otherwise.
 */
export function route(
  ask: RouteAsk,
  from: { x: number; z: number; y?: number },
  to: { x: number; z: number }
): { x: number; z: number }[] | null {
  const ground = ask.ground
  const props = ask.obstruction ?? NOTHING
  const swims = ask.swims ?? false

  const gx = (x: number): number => Math.round(x / GRID_STEP)
  const at = (g: number): number => g * GRID_STEP
  const inside = (cx: number, cz: number): boolean =>
    cx >= -HALF && cx <= HALF && cz >= -HALF && cz <= HALF
  const key = (cx: number, cz: number): number => (cx + HALF) * SIDE + (cz + HALF)

  /**
   * One step onto (cx, cz) arriving with the feet at `footY`: where the feet
   * land there, or null for refused. The walk's own order: a walkway within
   * the climb envelope first, the landscape second — and the landscape's
   * verdicts (void, water, mine) are only asked when the landscape is what
   * is stood on. Y-DOWN throughout: higher ground is the SMALLER height.
   */
  const step = (footY: number, cx: number, cz: number): number | null => {
    if (!inside(cx, cz)) return null
    const x = at(cx)
    const z = at(cz)
    if (props.blocks(x, z, footY, WALL_CLIMB)) return null
    const deck = props.standOn(x, z, footY, WALL_CLIMB)
    let foot: number
    if (deck !== null) {
      foot = deck
    } else {
      if (!ground.walkable(x, z)) return null
      if (!swims && ground.isWater(x, z)) return null
      if (ground.hasMine(x, z)) return null
      foot = ground.height(x, z)
    }
    // The DIRECTED half: landing higher than the envelope reaches is a
    // climb the legs cannot make. Any drop is walked off.
    if (footY - foot > WALL_CLIMB) return null
    return foot
  }

  const startX = gx(from.x)
  const startZ = gx(from.z)
  const goalX = gx(to.x)
  const goalZ = gx(to.z)
  if (!inside(startX, startZ)) return null
  const startFoot =
    from.y ??
    props.standOn(from.x, from.z, ground.height(from.x, from.z), WALL_CLIMB) ??
    ground.height(from.x, from.z)

  const heuristic = (cx: number, cz: number): number =>
    Math.hypot(cx - goalX, cz - goalZ) * GRID_STEP

  // A* proper: g-scores, the feet's height per settled cell, parents, and a
  // small binary heap on f.
  const gScore = new Map<number, number>()
  const feet = new Map<number, number>()
  const parent = new Map<number, number>()
  const heap: { k: number; f: number }[] = []
  const push = (k: number, f: number): void => {
    heap.push({ k, f })
    let i = heap.length - 1
    while (i > 0) {
      const up = (i - 1) >> 1
      if (heap[up].f <= heap[i].f) break
      ;[heap[up], heap[i]] = [heap[i], heap[up]]
      i = up
    }
  }
  const pop = (): { k: number; f: number } => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      for (;;) {
        const a = i * 2 + 1
        const b = a + 1
        let least = i
        if (a < heap.length && heap[a].f < heap[least].f) least = a
        if (b < heap.length && heap[b].f < heap[least].f) least = b
        if (least === i) break
        ;[heap[least], heap[i]] = [heap[i], heap[least]]
        i = least
      }
    }
    return top
  }

  const startKey = key(startX, startZ)
  gScore.set(startKey, 0)
  feet.set(startKey, startFoot)
  push(startKey, heuristic(startX, startZ))

  /** The nearest approach so far — what best-effort hands back. */
  let bestKey = startKey
  let bestNear = heuristic(startX, startZ)
  let expanded = 0

  while (heap.length > 0 && expanded < EXPANDED_CAP) {
    const { k } = pop()
    const g = gScore.get(k)!
    const foot = feet.get(k)!
    const cx = Math.floor(k / SIDE) - HALF
    const cz = (k % SIDE) - HALF
    expanded++

    const near = heuristic(cx, cz)
    if (near < bestNear) {
      bestNear = near
      bestKey = k
    }
    if (cx === goalX && cz === goalZ) break

    for (const way of WAYS) {
      const nx = cx + way.dx
      const nz = cz + way.dz
      const landing = step(foot, nx, nz)
      if (landing === null) continue
      // No cutting corners: a diagonal wants BOTH its orthogonal shoulders
      // open, or the walk it stands for brushes through the refused cell.
      if (
        way.dx !== 0 &&
        way.dz !== 0 &&
        (step(foot, cx, nz) === null || step(foot, nx, cz) === null)
      ) {
        continue
      }
      const nk = key(nx, nz)
      const cost = g + (way.dx !== 0 && way.dz !== 0 ? GRID_STEP * Math.SQRT2 : GRID_STEP)
      const known = gScore.get(nk)
      if (known !== undefined && known <= cost) continue
      gScore.set(nk, cost)
      feet.set(nk, landing)
      parent.set(nk, k)
      push(nk, cost + heuristic(nx, nz))
    }
  }

  // Walk the parents back from the nearest approach, then merge collinear
  // runs so the brain gets CORNERS, not every grid point.
  const spine: { x: number; z: number }[] = []
  for (let k: number | undefined = bestKey; k !== undefined; k = parent.get(k)) {
    spine.push({ x: at(Math.floor(k / SIDE) - HALF), z: at((k % SIDE) - HALF) })
  }
  spine.reverse()
  const corners: { x: number; z: number }[] = []
  for (let i = 1; i < spine.length; i++) {
    const back = spine[i - 1]
    const here = spine[i]
    const ahead = spine[i + 1]
    const straightOn =
      ahead !== undefined &&
      ahead.x - here.x === here.x - back.x &&
      ahead.z - here.z === here.z - back.z
    if (!straightOn) corners.push(here)
  }
  return corners
}
