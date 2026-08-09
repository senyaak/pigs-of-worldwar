// How big a pig's body is, off the model's own vertices.
//
// Two numbers, and neither is a rendering decision: they are measurements of
// the art, in world units. They lived in `three/pig.ts` because that is where
// the mesh was built, which meant the DOMAIN could not know how tall a pig was
// — and the strike, the shot and the grenade all wanted exactly that, so each
// of them reached into the mesh for `node.position.y` instead. That is the
// whole reason the battle could not be lifted out of the renderer.
//
// Game space is Y-DOWN (lib/game/scale.ts): the LARGEST y in a model is the
// soles and the smallest is the crown, and the model's origin is the hip.

import { MODEL_SCALE } from './scale'

export interface BodyExtent {
  /** Bind-pose distance from the model origin (hip) DOWN to the soles, in
   * world units. A pig standing with its feet at `y` has its origin at
   * `y - footOffset`, which is the point every blow is measured against. */
  footOffset: number
  /** Origin UP to the crown, world units — what anything hanging OVER a pig
   * has to clear. Not the pig's full height, because the origin is the hip. */
  crownRise: number
}

/**
 * Measure a model's body. `positions` is the de-indexed vertex array a model
 * reader hands back (lib/formats/model.ts), three floats a corner.
 */
export function bodyExtent(positions: ArrayLike<number>): BodyExtent {
  let soles = 0
  let crown = 0
  for (let i = 1; i < positions.length; i += 3) {
    if (positions[i] > soles) soles = positions[i]
    if (positions[i] < crown) crown = positions[i]
  }
  return { footOffset: soles * MODEL_SCALE, crownRise: -crown * MODEL_SCALE }
}

/**
 * The ORIGIN of a body standing with its soles at `y` — the hip, and the point
 * every blow in the game is measured against (lib/game/melee.ts, targets.ts).
 * Y-down, so the origin is the SMALLER number.
 */
export function originY(soles: number, body: BodyExtent): number {
  return soles - body.footOffset
}

/** A pig's own body extent, where nothing has measured one. Zero is honest —
 * a body with no art stands with its origin on the ground — and it keeps the
 * domain constructible without any art at all, which is what the pure specs
 * do. */
export const NO_BODY: BodyExtent = { footOffset: 0, crownRise: 0 }
