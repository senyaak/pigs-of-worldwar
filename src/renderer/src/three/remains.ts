// The boots a dead pig leaves — `BOOTS`, a model every one of the 61 map
// archives carries (measured 2026-08-20, `grep -l BOOTS Maps/*.MAD`), spawned
// off the map's own model set the way a trodden mine's `WE_APMIN` is
// (three/mineArt.ts).
//
// The engine says WHERE and WHEN (`remains`, lib/game/corpses.ts); this
// module only stands the art up. Game space (Y-down), under the battle's
// converted root.

import * as THREE from 'three'
import { MODEL_SCALE } from '../../../lib/game/scale'
import { PIG_HEADING_OFFSET } from '../../../lib/game/skeleton'
import type { SpawnModel } from './mineArt'

/** The model's name in every map's archive. */
const BOOTS_MODEL = 'BOOTS'

export interface RemainsArt {
  /** Stand a pair on this spot — `at.y` is the dead pig's SOLES, `heading`
   * the way it faced. */
  leave(at: { x: number; y: number; z: number }, heading: number): void
  /** How many pairs stand on the map — what a spec counts. */
  standing(): number
  dispose(): void
}

export function createRemainsArt(root: THREE.Object3D, spawn: SpawnModel): RemainsArt {
  const standing: THREE.Mesh[] = []

  /** How far the model's own origin sits above its underside, model units —
   * measured off the geometry rather than written down, because the geometry
   * is right here. Game space is Y-DOWN, so the underside is the GREATEST
   * local y, the same reading `three/mineArt.ts` pins for `WE_APMIN`. */
  let lift: number | null = null

  return {
    leave(at, heading) {
      // A map whose archive had no BOOTS after all simply leaves nothing —
      // a stand-in from another archive is the thing three/mineArt.ts just
      // stopped doing.
      const mesh = spawn(BOOTS_MODEL)
      if (!mesh) return
      if (lift === null) {
        const geometry = mesh.geometry
        if (!geometry.boundingBox) geometry.computeBoundingBox()
        lift = geometry.boundingBox?.max.y ?? 0
      }
      mesh.scale.setScalar(MODEL_SCALE)
      mesh.position.set(at.x, at.y - lift * MODEL_SCALE, at.z)
      // Facing the way the pig fell, with the model's own forward axis
      // corrected the way every pig's is (lib/game/skeleton.ts).
      mesh.rotation.y = heading + PIG_HEADING_OFFSET
      root.add(mesh)
      standing.push(mesh)
    },
    standing: () => standing.length,
    dispose() {
      // The geometry and materials are the map's shared ones (three/props.ts
      // owns their teardown); only the meshes are this module's.
      for (const mesh of standing) root.remove(mesh)
      standing.length = 0
    }
  }
}
