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

export interface MapProps {
  /** Add to the battle's game-space root; not converted on its own. */
  group: THREE.Group
  /** Records that got geometry. The rest are the `*_ME` spawn markers,
   * which have no model in the map's archive. */
  placed: number
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
  for (const object of objects) {
    const model = built.get(object.name)
    if (!model) continue
    const mesh = new THREE.Mesh(model.geometry, model.materials)
    mesh.name = object.name
    mesh.position.set(object.x, -object.y, object.z)
    mesh.rotation.y = modelRotationY(object.yaw)
    group.add(mesh)
    placed++
  }

  return {
    group,
    placed,
    dispose() {
      group.clear()
      for (const { geometry, materials } of built.values()) disposeMesh(geometry, materials)
    }
  }
}
