// The map's placed objects — the .POG list drawn on the ground.
//
// Game space, Y-down, like everything else under the battle's converted
// root: the reader hands over x and z in the game's own convention and y as
// an ELEVATION, so the one conversion here is negating y.
//
// Geometry and materials are built once per distinct model and shared by
// every record that names it — a map is 148 objects on CAMP and 370 on
// TESTER, but only a couple of dozen models.

import * as THREE from 'three'
import type { MapObject, MapProp, Texture } from '../api'
import { buildModelGeometry, buildTextureMaterials, disposeMesh } from './modelMesh'
import { modelRotationY } from '../../../lib/formats/pog'
import { MODEL_SCALE } from '../../../lib/game/scale'
import { HEIGHT_SCALE } from '../../../lib/game/terrain'

export interface MapProps {
  /** Add to the battle's game-space root; not converted on its own. */
  group: THREE.Group
  /** Records that got geometry. The rest are the `*_ME` spawn markers,
   * which have no model in the map's archive. */
  placed: number
  /** Take one record's art off the map — a crate that has been collected.
   * The geometry is shared with every other record of that model, so only
   * the mesh goes. */
  take(id: number): void
  dispose(): void
}

export function buildMapProps(
  objects: MapObject[],
  props: MapProp[],
  textures: Texture[]
): MapProps {
  const group = new THREE.Group()
  const built = new Map<string, { geometry: THREE.BufferGeometry; materials: THREE.Material[] }>()
  for (const prop of props) {
    built.set(prop.name, {
      geometry: buildModelGeometry(prop.model, textures),
      materials: buildTextureMaterials(prop.model, textures)
    })
  }

  let placed = 0
  /** Every placed mesh by its record's id, so one can be taken away again. */
  const byId = new Map<number, THREE.Mesh>()
  for (const object of objects) {
    const model = built.get(object.name)
    if (!model) continue
    const mesh = new THREE.Mesh(model.geometry, model.materials)
    mesh.name = object.name
    byId.set(object.id, mesh)
    // Stored y is an ELEVATION in the PMG's own height space, so it rides
    // HEIGHT_SCALE exactly as the ground does; game space is Y-down, hence
    // the negation.
    mesh.position.set(object.x, -object.y * HEIGHT_SCALE, object.z)
    mesh.rotation.y = modelRotationY(object.yaw)
    // A VTX unit is half a world unit (lib/game/scale.ts). The record's
    // position is already the world's, so the scale goes on the mesh alone
    // and a prop shrinks about its own origin — which the POG puts at the
    // model's CENTRE, so it stays where it was placed.
    mesh.scale.setScalar(MODEL_SCALE)
    group.add(mesh)
    placed++
  }

  return {
    group,
    placed,
    take(id) {
      const mesh = byId.get(id)
      if (!mesh) return
      group.remove(mesh)
      byId.delete(id)
    },
    dispose() {
      group.clear()
      byId.clear()
      for (const { geometry, materials } of built.values()) disposeMesh(geometry, materials)
    }
  }
}
