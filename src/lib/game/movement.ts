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
//   2. the destination is inside a wall — refuse, and stay put
//   3. the ground there is more than STEP_DOWN below — walk off and fall
//   4. otherwise walk, and take the ground height with you
//
// Step-up and sidestep are deliberately absent: they belong to the object
// collision path, and there are no objects in the scene yet. Their rules are
// recorded in ../../../../pigs-disasm/movement/notes.md for when there are.

import { WORLD_LIMIT, fromExeY } from './terrain'
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
  /** A wall — the pig is where it started. */
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
  const clamp = (v: number): number => Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, v))
  const wantX = x + Math.sin(heading) * distance
  const wantZ = z + Math.cos(heading) * distance
  const toX = clamp(wantX)
  const toZ = clamp(wantZ)
  if (toX !== wantX || toZ !== wantZ) return { outcome: 'limit', x, z }
  if (!query.walkable(toX, toZ)) return { outcome: 'blocked', x, z }
  // Game-space heights grow DOWNWARD, so a bigger height is lower ground.
  const drop = query.height(toX, toZ) - query.height(x, z)
  if (drop > STEP_DOWN && !query.isWater(toX, toZ)) return { outcome: 'falling', x: toX, z: toZ }
  return { outcome: 'moved', x: toX, z: toZ }
}
