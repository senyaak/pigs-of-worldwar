// The opening drop, DRAWN: a canopy over each arriving pig, and the pig's mesh
// following its descent.
//
// The phase itself is the engine's (`lib/game/dropIn.ts`) — the battle runs
// nothing while it lasts, so it cannot sit behind a renderer. What is left here
// is the canopy art and how much of it the camera has to clear.

import type * as THREE from 'three'
import type { Model, Texture } from '../api'
import type { Pig } from '../../../lib/game/game'
import type { Arrival } from '../../../lib/game/dropIn'
import type { Point } from '../../../lib/game/pose'
import { buildCanopies } from './parachute'
import type { Canopies } from './parachute'
import type { Squad } from './squad'

export interface DropInArt {
  /** Hang a canopy over this pig, by id (lib/game/events.ts). */
  open(pig: number): void
  /** Take it away. */
  cut(pig: number): void
  /** How much hangs above this pig that the camera must clear. */
  riseOver(pig: Pig): number
  /**
   * Stand every arriving pig where it is being DRAWN. Once a frame — a pig
   * whose canopy has been cut is still coming down and still on the list.
   *
   * `where` rather than the pig's own position: the descent moves in the
   * engine's quanta and the screen does not, and the camera is watching it
   * come down (three/tween.ts).
   */
  draw(live: readonly Arrival[], where: (one: Arrival) => Point): void
  dispose(): void
}

/** No canopy art in the install — the squad simply stands on its markers. A pig
 * hanging from nothing is worse than one that starts where it was going to end
 * up. */
const NOTHING: DropInArt = {
  open: () => {},
  cut: () => {},
  riseOver: () => 0,
  draw: () => {},
  dispose: () => {}
}

export function createDropInArt(
  squad: Squad,
  canopy: { model: Model; textures: Texture[] } | null
): DropInArt {
  if (!canopy) return NOTHING
  const canopies: Canopies = buildCanopies(canopy.model, canopy.textures)
  const worn = new Map<Pig, THREE.Mesh>()

  return {
    open(pig) {
      const soldier = squad.of(pig)
      if (!soldier) return
      worn.set(soldier.pig, canopies.open(soldier.node))
    },
    cut(pig) {
      const soldier = squad.of(pig)
      if (!soldier) return
      const one = worn.get(soldier.pig)
      if (one) canopies.cut(one)
      worn.delete(soldier.pig)
    },
    riseOver: (pig) => (worn.has(pig) ? canopies.rise : 0),
    draw(live, where) {
      for (const one of live) {
        const at = where(one)
        squad.of(one.pig.id)?.place(at.x, at.y, at.z, one.pig.heading)
      }
    },
    dispose() {
      for (const one of worn.values()) canopies.cut(one)
      worn.clear()
      canopies.dispose()
    }
  }
}
