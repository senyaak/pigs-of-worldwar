// The DISGUISE a hidden pig wears — a bush, a tree or a crate out of the
// map's own model set, standing where the pig does (lib/game/hide.ts).
//
// The engine says which model and where (`BattleSnapshot.decoys`); this
// module only stands the art up and takes it down again, the way the boots'
// does (three/remains.ts). Game space (Y-down), under the battle's converted
// root.

import * as THREE from 'three'
import { MODEL_SCALE } from '../../../lib/game/scale'
import type { DecoyShot } from '../../../lib/game/snapshot'
import type { SpawnModel } from './mineArt'

/** Above every map record's own renderOrder, so a decoy standing among the
 * props it imitates does not z-fight them (three/props.ts gives records
 * their ids; this clears the whole range). */
const DECOY_ORDER = 100000

export interface DecoyArt {
  /** Shape exactly what the engine says is standing. Once a frame. */
  draw(decoys: readonly DecoyShot[]): void
  /** How many disguises stand — what a spec counts (a debug read is not a
   * paint check; the e2e side counts nodes). */
  standing(): number
  dispose(): void
}

export function createDecoyArt(root: THREE.Object3D, spawn: SpawnModel): DecoyArt {
  /** One mesh per hidden pig, by pig id. */
  const worn = new Map<number, THREE.Mesh>()
  /** Origin-to-underside per model name, measured off the geometry once —
   * a POG record places a model's CENTRE and the engine hands the pig's
   * SOLES, so the art lifts itself (three/remains.ts is the pattern). */
  const lifts = new Map<string, number>()

  return {
    draw(decoys) {
      const stale = new Set(worn.keys())
      for (const decoy of decoys) {
        stale.delete(decoy.pig)
        let mesh = worn.get(decoy.pig)
        if (!mesh) {
          // A map whose archive lacks the model shows nothing — the same
          // honest refusal the boots make (three/remains.ts says why a
          // stand-in from another archive is worse).
          const spawned = spawn(decoy.model)
          if (!spawned) continue
          mesh = spawned
          mesh.renderOrder = DECOY_ORDER
          root.add(mesh)
          worn.set(decoy.pig, mesh)
        }
        let lift = lifts.get(decoy.model)
        if (lift === undefined) {
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
          lift = mesh.geometry.boundingBox?.max.y ?? 0
          lifts.set(decoy.model, lift)
        }
        mesh.scale.setScalar(MODEL_SCALE)
        mesh.position.set(decoy.x, decoy.y - lift * MODEL_SCALE, decoy.z)
        // The pig's own heading, raw: which way a bush "faces" is not a
        // question, and the exe simply copies the yaw across.
        mesh.rotation.y = decoy.yaw
      }
      for (const gone of stale) {
        const mesh = worn.get(gone)
        if (mesh) root.remove(mesh)
        worn.delete(gone)
      }
    },
    standing: () => worn.size,
    dispose() {
      // The geometry and materials are the map's shared ones (three/props.ts
      // owns their teardown); only the meshes are this module's.
      for (const mesh of worn.values()) root.remove(mesh)
      worn.clear()
    }
  }
}
