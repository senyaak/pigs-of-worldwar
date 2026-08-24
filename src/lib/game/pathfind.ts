// The route round the world: the searches brains walk by, on the grid model
// in lib/game/pathgrid.ts.
//
// TWO of them, and the difference is what the caller is asking:
//
//   route()  — A* to ONE goal. What a walk somewhere is made of, and the
//              cheaper answer when only one point matters.
//   flood()  — Dijkstra out of ONE START, to a budget. What EVERY point
//              within a turn's walking costs, in one search: the plan asks
//              "where can I shoot him from" of thirty-odd marks at once
//              (lib/game/plan.ts), and thirty A* runs a turn is the hitch
//              play felt ("подвисает ход", the [perf] frames of
//              `_tmp/telemetry-2026-08-24T21-00-24.log`).
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

import { makeGrid, GRID_STEP, SWIM_COST, WAYS } from './pathgrid'
import type { Grid, RouteAsk } from './pathgrid'

// The grid model's own surface, re-exported: a caller that routes should not
// have to know the model lives next door.
export {
  BODY_CLEAR,
  BODY_EXEMPT,
  GRID_STEP,
  SWIM_COST,
  createWaterMemo,
  makeGrid
} from './pathgrid'
export type { Ground, RouteAsk, Standing, WaterMemo } from './pathgrid'

/** The search gives up after this many nodes taken off the open list — a
 * whole 193×193 world is ~37k, so this is "the map, roughly once". */
const EXPANDED_CAP = 40000

/** A small binary heap on f — the open list of both searches. */
const makeHeap = (): {
  push(k: number, f: number): void
  pop(): { k: number; f: number }
  size(): number
} => {
  const heap: { k: number; f: number }[] = []
  return {
    size: () => heap.length,
    push(k, f) {
      heap.push({ k, f })
      let i = heap.length - 1
      while (i > 0) {
        const up = (i - 1) >> 1
        if (heap[up].f <= heap[i].f) break
        ;[heap[up], heap[i]] = [heap[i], heap[up]]
        i = up
      }
    },
    pop() {
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
  }
}

/** The chain of cells back from a settled one, as world points, start first
 * — what the string-pulling is handed. */
const spineOf = (
  grid: Grid,
  parent: Map<number, number>,
  end: number
): { x: number; z: number }[] => {
  const spine: { x: number; z: number }[] = []
  for (let k: number | undefined = end; k !== undefined; k = parent.get(k)) {
    spine.push({ x: grid.at(grid.cellX(k)), z: grid.at(grid.cellZ(k)) })
  }
  spine.reverse()
  return spine
}

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
  const grid = makeGrid(ask, from)
  const startX = grid.gx(from.x)
  const startZ = grid.gx(from.z)
  const goalX = grid.gx(to.x)
  const goalZ = grid.gx(to.z)
  if (!grid.inside(startX, startZ)) return null

  const heuristic = (cx: number, cz: number): number =>
    Math.hypot(cx - goalX, cz - goalZ) * GRID_STEP

  // A* proper: g-scores, the feet's height per settled cell, parents, and a
  // small binary heap on f.
  const gScore = new Map<number, number>()
  const feet = new Map<number, number>()
  const parent = new Map<number, number>()
  const heap = makeHeap()

  const startKey = grid.key(startX, startZ)
  gScore.set(startKey, 0)
  feet.set(startKey, grid.startFoot)
  heap.push(startKey, heuristic(startX, startZ))

  /** The nearest approach so far — what best-effort hands back. */
  let bestKey = startKey
  let bestNear = heuristic(startX, startZ)
  let expanded = 0

  while (heap.size() > 0 && expanded < EXPANDED_CAP) {
    const { k } = heap.pop()
    const g = gScore.get(k)!
    const foot = feet.get(k)!
    const cx = grid.cellX(k)
    const cz = grid.cellZ(k)
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
      const landing = grid.step(foot, nx, nz)
      if (landing === null) continue
      // No cutting corners: a diagonal wants BOTH its orthogonal shoulders
      // open, or the walk it stands for brushes through the refused cell.
      if (
        way.dx !== 0 &&
        way.dz !== 0 &&
        (grid.step(foot, cx, nz) === null || grid.step(foot, nx, cz) === null)
      ) {
        continue
      }
      const nk = grid.key(nx, nz)
      // The stride's TIME: its length, times the swim's slowness when the
      // landing is wet. The heuristic below prices every unit at the walk's
      // 1, which stays admissible — no step is ever cheaper than that.
      const stride = way.dx !== 0 && way.dz !== 0 ? GRID_STEP * Math.SQRT2 : GRID_STEP
      const cost = g + stride * (landing.wade ? SWIM_COST : 1)
      const known = gScore.get(nk)
      if (known !== undefined && known <= cost) continue
      gScore.set(nk, cost)
      feet.set(nk, landing.foot)
      parent.set(nk, k)
      heap.push(nk, cost + heuristic(nx, nz))
    }
  }

  return grid.pull(spineOf(grid, parent, bestKey), (point) =>
    feet.get(grid.key(grid.gx(point.x), grid.gx(point.z)))
  )
}

/**
 * **WHAT EVERY POINT WITHIN A BUDGET COSTS TO WALK TO** — one search, asked
 * as many times as the plan likes.
 *
 * The turn's plan searches for a place to shoot FROM (play's correction:
 * "точка стрельбы лежит по дороге к цели — это неверно… надо идти от
 * обратного: найти цель, выбрать оружие, найти позицию откуда можно
 * стрелять"), and a ring of marks round each of three foes is thirty-odd
 * questions. Asked of `route` that is thirty A* searches; asked of this it
 * is one flood and thirty map lookups.
 */
export interface Reach {
  /**
   * How far the LEGS go to a point — the walk's own length in world units,
   * the water's slowness priced in (`SWIM_COST`), or **Infinity** when the
   * ground does not go there inside the budget. Not the crow line, and not
   * a best effort either: this one answers the question honestly, because
   * "can I even stand there" is exactly what the plan is asking.
   */
  walk(to: { x: number; z: number }): number
  /** The corners of the walk to a point, or null when it is out of reach —
   * the same legs `route` hands back, pulled the same way. */
  corners(to: { x: number; z: number }): { x: number; z: number }[] | null
  /** How many cells the flood settled — what a `[perf]` line is read
   * against. */
  cells: number
}

/**
 * The flood out of `from`, settling every cell reachable within `budget`
 * walked units. Cheaper than it looks: the budget is a turn's walking, not
 * the map, and the battle's water memo means the second flood of a battle
 * pays for arithmetic only.
 */
export function flood(
  ask: RouteAsk,
  from: { x: number; z: number; y?: number },
  budget: number
): Reach | null {
  const grid = makeGrid(ask, from)
  const startX = grid.gx(from.x)
  const startZ = grid.gx(from.z)
  if (!grid.inside(startX, startZ)) return null

  const gScore = new Map<number, number>()
  const feet = new Map<number, number>()
  const parent = new Map<number, number>()
  const heap = makeHeap()

  const startKey = grid.key(startX, startZ)
  gScore.set(startKey, 0)
  feet.set(startKey, grid.startFoot)
  heap.push(startKey, 0)
  let expanded = 0

  while (heap.size() > 0 && expanded < EXPANDED_CAP) {
    const { k, f } = heap.pop()
    const g = gScore.get(k)!
    // A stale heap entry: this cell has been settled cheaper since.
    if (f > g) continue
    if (g > budget) break
    const foot = feet.get(k)!
    const cx = grid.cellX(k)
    const cz = grid.cellZ(k)
    expanded++

    for (const way of WAYS) {
      const nx = cx + way.dx
      const nz = cz + way.dz
      const landing = grid.step(foot, nx, nz)
      if (landing === null) continue
      if (
        way.dx !== 0 &&
        way.dz !== 0 &&
        (grid.step(foot, cx, nz) === null || grid.step(foot, nx, cz) === null)
      ) {
        continue
      }
      const stride = way.dx !== 0 && way.dz !== 0 ? GRID_STEP * Math.SQRT2 : GRID_STEP
      const cost = g + stride * (landing.wade ? SWIM_COST : 1)
      if (cost > budget) continue
      const nk = grid.key(nx, nz)
      const known = gScore.get(nk)
      if (known !== undefined && known <= cost) continue
      gScore.set(nk, cost)
      feet.set(nk, landing.foot)
      parent.set(nk, k)
      heap.push(nk, cost)
    }
  }

  /** The settled cell a point falls in, or null. */
  const cellKey = (to: { x: number; z: number }): number | null => {
    const cx = grid.gx(to.x)
    const cz = grid.gx(to.z)
    if (!grid.inside(cx, cz)) return null
    const k = grid.key(cx, cz)
    return gScore.has(k) ? k : null
  }

  return {
    cells: gScore.size,
    walk(to) {
      const k = cellKey(to)
      if (k === null) return Infinity
      // The cell's own cost, plus the last stride from its centre to the
      // asked point — under half a cell, but a mark is a mark.
      const cx = grid.at(grid.cellX(k))
      const cz = grid.at(grid.cellZ(k))
      return gScore.get(k)! + Math.hypot(to.x - cx, to.z - cz)
    },
    corners(to) {
      const k = cellKey(to)
      if (k === null) return null
      return grid.pull(spineOf(grid, parent, k), (point) =>
        feet.get(grid.key(grid.gx(point.x), grid.gx(point.z)))
      )
    }
  }
}
