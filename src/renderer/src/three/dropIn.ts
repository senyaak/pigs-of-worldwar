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
import { buildCanopies } from './parachute'
import type { Canopies } from './parachute'
import type { Squad } from './squad'

export interface DropInArt {
  /** Hang a canopy over this pig. */
  open(pig: Pig): void
  /** Take it away. */
  cut(pig: Pig): void
  /** How much hangs above this pig that the camera must clear. */
  riseOver(pig: Pig): number
  /** Stand every arriving pig where the engine says it now is. Once a frame —
   * a pig whose canopy has been cut is still coming down and still on the
   * list. */
  draw(live: readonly Arrival[]): void
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
      worn.set(pig, canopies.open(soldier.node))
    },
    cut(pig) {
      const one = worn.get(pig)
      if (one) canopies.cut(one)
      worn.delete(pig)
    },
    riseOver: (pig) => (worn.has(pig) ? canopies.rise : 0),
    draw(live) {
      for (const { pig } of live) {
        squad.of(pig)?.place(pig.position.x, pig.position.y, pig.position.z, pig.heading)
      }
    },
    dispose() {
      for (const one of worn.values()) canopies.cut(one)
      worn.clear()
      canopies.dispose()
    }
  }
}
