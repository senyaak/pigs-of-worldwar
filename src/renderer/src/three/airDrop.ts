// A crate's descent, DRAWN: the canopy over it and the record lifted to
// wherever the engine says it has fallen to.
//
// The descent itself is the engine's (`lib/game/airDrop.ts`) — the battle waits
// on it, so it cannot live behind a renderer. What is left here is the canopy
// art, which hangs off the crate's own mesh, and moving that mesh.
//
// Game space, Y-down, under the battle's converted root.

import type * as THREE from 'three'
import type { Descent } from '../../../lib/game/airDrop'
import type { Model, Texture } from '../api'
import { buildCanopies } from './parachute'
import type { Canopies } from './parachute'
import type { MapProps } from './props'

export interface AirDropArt {
  /** Put a canopy over this record and show it. */
  open(id: number): void
  /** Take this one's canopy away — it has landed, or the player cut it. */
  cut(id: number): void
  /** …every one of them. */
  cutAll(): void
  /** Lift each record's art to where its descent has got to. Once a frame, and
   * at the height it is DRAWN at — between the engine's last two steps
   * (three/tween.ts), or a crate coming down steps and the camera watching it
   * shakes. */
  draw(live: readonly Descent[], heightOf: (one: Descent) => number): void
  dispose(): void
}

export function createAirDropArt(
  props: MapProps,
  canopy: { model: Model; textures: Texture[] } | null
): AirDropArt {
  // A map with no `WE_PARA` in its install still drops the crate; it simply
  // has nothing to hang over it. Same call the drop-in makes.
  const canopies: Canopies | null = canopy ? buildCanopies(canopy.model, canopy.textures) : null
  const worn = new Map<number, THREE.Mesh>()

  const cut = (id: number): void => {
    const one = worn.get(id)
    if (one && canopies) canopies.cut(one)
    worn.delete(id)
  }

  return {
    open(id) {
      props.show(id, true)
      const mesh = props.meshOf(id)
      const one = canopies && mesh ? canopies.open(mesh) : null
      if (one) worn.set(id, one)
    },
    cut,
    cutAll() {
      for (const id of [...worn.keys()]) cut(id)
    },
    draw(live, heightOf) {
      for (const one of live) props.raise(one.id, heightOf(one))
    },
    dispose() {
      for (const id of [...worn.keys()]) cut(id)
      canopies?.dispose()
    }
  }
}
