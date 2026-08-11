// WHAT STANDS IN THE WAY of seeing something — the boxes a sight line crosses.
//
// Play: "здание не просвечивает когда свинья внутри." A house in this engine is
// eighteen solid pieces (lib/game/breakable.ts) with the camera outside them, so a
// pig indoors is a pig behind a wall — and `sightline.ts` next door, which swings
// the camera round whatever is in the way, has nowhere to swing to inside a room:
// every heading is a wall. So the wall gets out of the way instead.
//
// The original does nothing of the kind, and `sightline.ts` says why in full: the
// camera's only question about the world is `Map::SampleHeight`. Both files are the
// remake's own, marked, and easy to delete.
//
// This half is the RULES — which records are between two points — and the fading
// itself is art (three/props.ts).
//
// Pure, and game space (Y-DOWN) like the rest of lib/game.

import { boxOf, isSolid } from './obstacles'
import type { Obstacle } from './obstacles'
import type { MapObject } from '../formats/pog'

export interface Spot {
  x: number
  y: number
  z: number
}

/** The boxes worth asking about: everything solid enough to hide something,
 * which is the same test the collision world makes. Built once. */
export const sightBlockers = (objects: MapObject[]): Obstacle[] =>
  objects.filter(isSolid).map(boxOf)

/** Which of them the segment `from`→`to` passes through, by record id. */
export function crossedBy(boxes: readonly Obstacle[], from: Spot, to: Spot): number[] {
  const out: number[] = []
  for (const box of boxes) if (crosses(box, from, to)) out.push(box.id)
  return out
}

/**
 * One box against one segment — the ordinary slab test, done in the box's OWN
 * frame so an oriented box needs no special case.
 *
 * `top`/`bottom` are already Y-DOWN (the top is the SMALLER y), which is why the
 * vertical slab reads back to front against the other two.
 */
export function crosses(box: Obstacle, from: Spot, to: Spot): boolean {
  const a = local(box, from)
  const b = local(box, to)
  let near = 0
  let far = 1
  const slabs: readonly [number, number, number, number][] = [
    [a.x, b.x, -box.halfX, box.halfX],
    [a.y, b.y, box.top, box.bottom],
    [a.z, b.z, -box.halfZ, box.halfZ]
  ]
  for (const [start, end, low, high] of slabs) {
    const step = end - start
    if (Math.abs(step) < 1e-9) {
      // Parallel to this pair of faces: either the whole segment is between them
      // or none of it is.
      if (start < low || start > high) return false
      continue
    }
    const first = (low - start) / step
    const second = (high - start) / step
    near = Math.max(near, Math.min(first, second))
    far = Math.min(far, Math.max(first, second))
    if (near > far) return false
  }
  return true
}

/** A point in the box's own turned frame. A box is never tilted about anything
 * but the vertical, so y goes through unchanged. */
function local(box: Obstacle, at: Spot): Spot {
  const dx = at.x - box.x
  const dz = at.z - box.z
  const cos = Math.cos(box.turn)
  const sin = Math.sin(box.turn)
  return { x: dx * cos - dz * sin, y: at.y, z: dx * sin + dz * cos }
}
