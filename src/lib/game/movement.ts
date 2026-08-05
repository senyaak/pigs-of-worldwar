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
//   3. otherwise walk, and take the ground height with you
//
// NOTHING about the ground refuses a step — not its height and not the wall
// flag. The exe pins a pig to the landscape however steep, and the wall flag
// does not block at all: the landscape collider swaps in an almost
// frictionless, almost perfectly elastic material and lets the physics deal
// with it. Refusing at a wall was this remake's invention, and it walled
// pigs IN on top of cliffs — the lip of a cliff is a wall tile too.
//
// Step-up and sidestep are deliberately absent: they belong to the object
// collision path, and there are no objects in the scene yet. Their rules are
// recorded in ../../../../pigs-disasm/movement/notes.md for when there are.

import { FRAME_SECONDS } from './ballistics'
import { clampToWorld, fromExeY } from './terrain'
import type { TerrainQuery } from './terrain'

/** Drop the feet this far looking for ground before declaring a fall
 * (exe 0x4bd340, in its own vertical scale — see `fromExeY`). */
/** How fast a pig walks, world units per second (a tile is 512). */
export const WALK_SPEED = 900

export const STEP_DOWN = fromExeY(32)

/**
 * How far ahead the ground is checked for an edge: one of the original's
 * walking steps. Its `TryMove` runs once a logic frame and moves `nDist`, so
 * the check and the step were the same distance; ours must not shrink with
 * the frame rate.
 */
export const LOOK_AHEAD = WALK_SPEED * FRAME_SECONDS
/** A fall keeps this much of the walking speed horizontally
 * (exe `|nDist| * 3 / 2`). */
export const FALL_SPEED_FACTOR = 1.5

export type MoveOutcome =
  /** The world limits ate the whole step — the only refusal there is. */
  | 'limit'
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

  // The edge is looked for a FIXED distance ahead, not at wherever this
  // frame's step happened to land. The original tests the ground one
  // `nDist` on — one whole walking step at its own frame rate — so a pig
  // running at a drop launches off it. Testing our own step instead makes
  // the look-ahead a function of the frame rate: at 60 Hz it is half as far,
  // no single step ever clears STEP_DOWN, and the pig creeps over the lip
  // and walks down the face while gravity does the work. It should leave the
  // ground.
  const reach = Math.max(Math.abs(distance), LOOK_AHEAD)
  const aheadX = x + Math.sin(heading) * Math.sign(distance) * reach
  const aheadZ = z + Math.cos(heading) * Math.sign(distance) * reach
  // Game-space heights grow DOWNWARD, so a bigger height is lower ground.
  const here = query.height(x, z)
  if (query.height(aheadX, aheadZ) - here > STEP_DOWN && !query.isWater(toX, toZ)) {
    return { outcome: 'falling', x: toX, z: toZ }
  }
  const drop = query.height(toX, toZ) - here
  // No wall refusal, because the original has none. `0x415590` turns the
  // landscape into friction 0.01 / restitution 0.99 wherever
  // `Map::IsBlocked` says yes, and that is the whole of it: the pig walks
  // in, an almost perfectly elastic floor throws it about, and the wedge
  // counter ejects it. Refusing the step was this remake's own idea.
  return { outcome: 'moved', x: toX, z: toZ }
}
