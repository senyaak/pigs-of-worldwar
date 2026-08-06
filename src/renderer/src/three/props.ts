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

export interface MapProps {
  /** Add to the battle's game-space root; not converted on its own. */
  group: THREE.Group
  /** Records that got geometry. The rest are the `*_ME` spawn markers,
   * which have no model in the map's archive. */
  placed: number
  dispose(): void
}

/**
 * A prop's stored yaw, as three's rotation about Y: `-yaw - π/2`. The art
 * faces +X like the pig's does, hence the same quarter turn the pig's
 * `PIG_HEADING_OFFSET` carries; the NEGATION is the part worth keeping
 * evidence for, and two independent pieces of it agree.
 *
 * **The bridge on CAMP.** Seven records lie in a straight line at z −7424:
 * a BRIDGE_S ramp at x −2304, flat deck sections at −1792 and −512 sitting
 * 220 units higher, and a second BRIDGE_S ramp at x 256. The ramp model
 * rises toward its own +X (its far half sits a whole 512 above its near
 * half, Y-down), so for the run to be one continuous walkway the left ramp
 * must rise toward +x and the right one toward −x. Their stored yaws are
 * 270° and 90°: only a negated angle turns those two into opposite ends of
 * the same bridge.
 *
 * **The training dummy on CAMP.** DUMMY is a plank 206 units thick facing
 * its own +X, and the one at (−4352, 5888) is stored at yaw 0 — where the
 * negation cannot help, and the ±90° of the quarter turn decides instead.
 * The green path (tile texture 40) runs up the +z side of it, from the
 * crate at z 8448, so the target must face +z. `−π/2` faces it there;
 * `+π/2` faces it away.
 *
 * Terrain never settled it: the obvious test — a ramp's high end should be
 * uphill — is exactly backwards for a bridge, whose ramps climb OVER the
 * ditch they cross.
 */
export const PROP_YAW_OFFSET = -Math.PI / 2

/** The stored yaw as a rotation about three's Y. See PROP_YAW_OFFSET. */
export const propRotationY = (yaw: number): number => -yaw + PROP_YAW_OFFSET

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
    mesh.rotation.y = propRotationY(object.yaw)
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
