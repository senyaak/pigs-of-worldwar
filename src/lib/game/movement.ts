// One step of ground movement, following the original's `Pig::TryMove`
// (warhogs_.exe VA 0x478ca0). Pure: it takes a terrain query and a position,
// and says where the pig ends up and in what state.
//
// A pig walks in a STRAIGHT LINE. The exe's collision dispatch decides that:
// hitting the landscape is a success — the pig is simply pinned to the ground
// height, however steep — and only hitting an OBJECT sends it down the
// step-up-then-sidestep path. Terrain height never refuses a step. What stops
// a pig is a wall tile (and the original blocks part of a tile, not all of
// it) or the edge of the world; what makes it leave the ground is nothing
// under its feet.
//
//   1. clamp the candidate to the world limits — nothing left, refuse
//   2. the ground there is more than STEP_DOWN below — walk off and fall
//   3. it is a wall — refuse, and stay put
//   4. otherwise walk, and take the ground height with you
//
// THE ORDER OF 2 AND 3 IS THE WHOLE THING. Height never refuses a step: the
// exe pins a pig to the landscape however steep, which is why a mountainside
// is passable as far as the ground is concerned. What stops a pig is the
// wall flag — not the gradient, which is why "can I climb this" does not
// track steepness. But the lip of a cliff is a wall tile too, so asking
// about the wall first walls a pig IN on top of one: it can neither climb
// down nor step off, and a spawn ringed by cliff edges is a pig that never
// moves again. Asking about the drop first lets it go over the edge.
//
// (`TryMove` itself never calls `Map::IsBlocked` — in the original a wall
// stops a pig through the collision geometry that the object path tests, and
// the tile flag is only consulted about where the pig already IS. With no
// objects in the scene yet, the flag stands in for that geometry.)
//
// Step-up and sidestep are deliberately absent: they belong to the object
// collision path, and there are no objects in the scene yet. Their rules are
// recorded in ../../../../pigs-disasm/movement/notes.md for when there are.

import { clampToWorld, fromExeY } from './terrain'
import type { TerrainQuery } from './terrain'

/** Drop the feet this far looking for ground before declaring a fall
 * (exe 0x4bd340, in its own vertical scale — see `fromExeY`). */
export const STEP_DOWN = fromExeY(32)
/** A fall keeps this much of the walking speed horizontally
 * (exe `|nDist| * 3 / 2`). */
export const FALL_SPEED_FACTOR = 1.5

export type MoveOutcome =
  /** The world limits ate the whole step. */
  | 'limit'
  /** A wall stands there — the pig is where it started. */
  | 'blocked'
  /** Walked off an edge; the caller hands over to ballistics. */
  | 'falling'
  /** Moved. */
  | 'moved'

export interface MoveResult {
  outcome: MoveOutcome
  x: number
  z: number
}

/**
 * Try to walk `distance` world units from (x, z) along `heading`.
 * `distance` is negative walking backwards, as in the original.
 */
export function step(
  query: TerrainQuery,
  x: number,
  z: number,
  heading: number,
  distance: number
): MoveResult {
  const wantX = x + Math.sin(heading) * distance
  const wantZ = z + Math.cos(heading) * distance
  const { x: toX, z: toZ } = clampToWorld(wantX, wantZ)
  if (toX !== wantX || toZ !== wantZ) return { outcome: 'limit', x, z }
  // Game-space heights grow DOWNWARD, so a bigger height is lower ground.
  const drop = query.height(toX, toZ) - query.height(x, z)
  if (drop > STEP_DOWN && !query.isWater(toX, toZ)) return { outcome: 'falling', x: toX, z: toZ }
  if (!query.walkable(toX, toZ)) return { outcome: 'blocked', x, z }
  return { outcome: 'moved', x: toX, z: toZ }
}
