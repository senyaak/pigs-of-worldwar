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
import { buildingKind } from './buildings'
import { isRamp } from './ramps'
import type { MapObject } from '../formats/pog'

export interface Spot {
  x: number
  y: number
  z: number
}

/**
 * The boxes worth asking about: everything solid enough to hide something, which
 * is the same test the collision world makes, **less the BUILDINGS**. Built once.
 *
 * **A RAMP is not in the way either.** Play: "просвечивание включается на рампе —
 * не должно, ведь она за свином, не между ним и камерой." A ramp's box is the
 * whole triangular prism (lib/game/ramps.ts) and a pig standing on its LOW end
 * has its middle well below the box's top, so a camera behind and above looks
 * down THROUGH the slab to reach it. It is a walkway, not a wall: you stand on
 * it, and what you stand on is never between you and anything.
 *
 * Play: "просвечивать должны стены, которые мы взрываем — не бомбоубежище." And a
 * building is the one case where fading is not merely unwanted but pointless: a
 * pig inside one is not DRAWN at all (`indoors.ts`, and it is the exe's own rule —
 * `[pig+0x30] = 0` is the draw loop's gate), so there is nothing behind the wall
 * for the wall to be in front of. The eighteen pieces of the house are ordinary
 * breakable scenery and go on fading, which is the half play asked to keep.
 */
/**
 * What a record's ART fills, model-local units scaled to the world and
 * measured about the record's own centre — the renderer computes it off the
 * mesh it actually draws (three/battle.ts). Y-DOWN like everything here:
 * `topOffset` is the highest vertex's offset from the centre (negative for
 * anything reaching up), `bottomOffset` the lowest.
 */
export interface ArtExtent {
  halfX: number
  halfZ: number
  topOffset: number
  bottomOffset: number
}

export const sightBlockers = (
  objects: MapObject[],
  /**
   * The drawn art's own extents by MODEL NAME (upper case), where somebody
   * has them. The COLLISION box is the wrong box for a sight test and play
   * found where: "текстуры листвы не делаются прозрачными когда свин закрыт
   * ими" — a tree's collider is its TRUNK (192 across on a TREEG), the crown
   * is four times that, and a ray from the camera to the pig went through
   * the leaves without ever touching the box. What hides a pig is what is
   * DRAWN, so where the art is known each box grows to cover it — never
   * shrinks, since the majority-silhouette test above is what keeps a fat
   * box beside the pig from fading.
   */
  artOf?: (name: string) => ArtExtent | null
): Obstacle[] =>
  objects
    .filter((one) => isSolid(one) && buildingKind(one.name) === null && !isRamp(one.name))
    .map((one) => {
      const box = boxOf(one)
      const art = artOf?.(one.name.toUpperCase()) ?? null
      if (!art) return box
      const centre = (box.top + box.bottom) / 2
      return {
        ...box,
        halfX: Math.max(box.halfX, art.halfX),
        halfZ: Math.max(box.halfZ, art.halfZ),
        // Y-DOWN: the smaller number is the higher face.
        top: Math.min(box.top, centre + art.topOffset),
        bottom: Math.max(box.bottom, centre + art.bottomOffset)
      }
    })

/**
 * The pig's own SILHOUETTE, sampled: the rows up his body and the columns
 * across it that a sight line is drawn to.
 *
 * Y-DOWN, so a row is measured UP from the soles as a fraction of his height —
 * and **the soles themselves are deliberately not among them**: a ray that ends
 * at his feet ends inside whatever he is standing on, which is how the bridge
 * under him went see-through ("мост пропадает когда встаю на него"). A column
 * is a fraction of his RADIUS, across the line of sight.
 */
export const SIGHT_ROWS = [1, 0.66, 0.33]
export const SIGHT_COLUMNS = [-1, 0, 1]

/** Which of them the segment `from`→`to` passes through, by record id — each box
 * grown by `margin` first. */
export function crossedBy(
  boxes: readonly Obstacle[],
  from: Spot,
  to: Spot,
  margin = 0
): number[] {
  const out: number[] = []
  for (const box of boxes) if (crosses(box, from, to, margin)) out.push(box.id)
  return out
}

/**
 * The same, over SEVERAL points on the thing being looked at — and it takes a
 * MAJORITY of them, not any one.
 *
 * Three reports, and they pull in opposite directions. First: "текстура наверху
 * прозрачная, а внизу еле-еле" — one ray to the pig's middle fades the piece
 * that middle is behind and nothing else, and a wall is built of pieces stacked
 * up the wall. Then, with three rays and ANY of them counting: "манекен
 * пропадает когда я подхожу вплотную… колючая проволока пропадает когда стоит за
 * мной — но ни кусочек свина не загорожен, камера его полностью видит." Then,
 * with the majority in and every box still GROWN by half a tile first: "всё ещё
 * становятся прозрачными вещи, которые не перекрывают свина — то есть стоят не
 * между ним и камерой."
 *
 * All three are the same question asked properly: **does this box hide the pig,
 * or does it stand near him?** A wall panel between the camera and the pig
 * covers most of his silhouette; a dummy at his shoulder, a coil of wire at his
 * heel or a tree beside him covers a corner of it. So: the rays go to the
 * silhouette (`silhouetteOf`), the boxes are tested at their true size — the
 * margin that used to fatten every one of them by 256 is what was fading the
 * things standing beside him — and half the points or more have to be crossed.
 */
export function crossedTowards(
  boxes: readonly Obstacle[],
  from: Spot,
  targets: readonly Spot[],
  margin = 0
): number[] {
  const out: number[] = []
  const enough = Math.max(1, Math.ceil(targets.length / 2))
  for (const box of boxes) {
    let hit = 0
    for (const to of targets) {
      if (crosses(box, from, to, margin)) hit++
      if (hit >= enough) break
    }
    if (hit >= enough) out.push(box.id)
  }
  return out
}

/**
 * Where the sight line STOPS: the pig's own near side rather than his middle.
 *
 * Play: "думаю надо сделать проверку от задней части свина." Right — a segment
 * that runs to the middle of him goes on THROUGH his front half, so anything
 * standing at his chest is "in the way" although the camera can see all of him
 * over it. Ending the line where his body starts is the difference between
 * "between the camera and the pig" and "near the pig".
 *
 * `back` is how much of him to leave out: half his own length
 * (lib/game/obstacles.ts, `PIG_HOLD`).
 */
export function nearSideOf(from: Spot, at: Spot, back: number): Spot {
  const dx = from.x - at.x
  const dy = from.y - at.y
  const dz = from.z - at.z
  const span = Math.hypot(dx, dy, dz)
  if (span <= back || span === 0) return { x: at.x, y: at.y, z: at.z }
  const t = back / span
  return { x: at.x + dx * t, y: at.y + dy * t, z: at.z + dz * t }
}

/**
 * WHERE THE SIGHT LINES GO: the pig's silhouette as the camera sees it, nine
 * points of it — three rows up his body by three columns across it.
 *
 * This is what replaced the margin, and it is the same want done honestly. What
 * the margin was for is that a box hiding HALF of him has to fade even when a
 * ray to his middle misses it; what it did instead was fatten every box in the
 * world by half a tile in every direction, so a dummy or a tree standing beside
 * him counted as being in front of him. Sampling his own outline asks the
 * question the fade is actually about — how much of him this box covers — and a
 * box only has to be as big as it is.
 *
 * `feet` is his position (game space, the model's origin), `radius` how wide he
 * is (`PIG_RADIUS`) and `back` how much of him to leave out of the line
 * (`nearSideOf`). The columns are laid ACROSS the line of sight, so the
 * silhouette faces the camera wherever it stands.
 */
export function silhouetteOf(
  from: Spot,
  feet: Spot,
  height: number,
  radius: number,
  back: number
): Spot[] {
  const dx = feet.x - from.x
  const dz = feet.z - from.z
  const span = Math.hypot(dx, dz)
  // Straight overhead there is no across to speak of; any axis will do.
  const acrossX = span === 0 ? 1 : -dz / span
  const acrossZ = span === 0 ? 0 : dx / span
  const out: Spot[] = []
  for (const row of SIGHT_ROWS) {
    for (const column of SIGHT_COLUMNS) {
      out.push(
        nearSideOf(
          from,
          {
            x: feet.x + acrossX * radius * column,
            y: feet.y - height * row,
            z: feet.z + acrossZ * radius * column
          },
          back
        )
      )
    }
  }
  return out
}

/**
 * One box against one segment — the ordinary slab test, done in the box's OWN
 * frame so an oriented box needs no special case.
 *
 * `top`/`bottom` are already Y-DOWN (the top is the SMALLER y), which is why the
 * vertical slab reads back to front against the other two.
 */
export function crosses(box: Obstacle, from: Spot, to: Spot, margin = 0): boolean {
  const a = local(box, from)
  const b = local(box, to)
  let near = 0
  let far = 1
  const slabs: readonly [number, number, number, number][] = [
    [a.x, b.x, -box.halfX - margin, box.halfX + margin],
    [a.y, b.y, box.top - margin, box.bottom + margin],
    [a.z, b.z, -box.halfZ - margin, box.halfZ + margin]
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
