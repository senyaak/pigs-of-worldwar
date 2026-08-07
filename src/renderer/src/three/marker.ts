// The pointer over whoever is acting: a slowly bobbing cone.
//
// Game space, Y-down, under the battle's converted root — hence the cone
// turned over to point DOWN. Sized against the pig it sits on, so it halves
// with the model rather than towering over a half-scale one.

import * as THREE from 'three'
import { MODEL_SCALE } from '../../../lib/game/scale'

/** How far over the ground it floats, and how far it bobs either side. */
const LIFT = 700 * MODEL_SCALE
const BOB = 40 * MODEL_SCALE

export interface ActiveMarker {
  /** Park it over a pig standing on ground at `groundY`. */
  moveTo(x: number, groundY: number, z: number): void
  /** The bob, once a frame. */
  bob(time: number): void
  dispose(): void
}

export function buildMarker(root: THREE.Object3D): ActiveMarker {
  const geometry = new THREE.ConeGeometry(60 * MODEL_SCALE, 140 * MODEL_SCALE, 4)
  const material = new THREE.MeshStandardMaterial({ color: 0xd8e08a })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = Math.PI // point down in Y-down space
  root.add(mesh)

  let base = new THREE.Vector3()
  return {
    moveTo(x, groundY, z) {
      base = new THREE.Vector3(x, groundY - LIFT, z)
      mesh.position.copy(base)
    },
    bob(time) {
      mesh.position.y = base.y - Math.sin(time * 3) * BOB
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    }
  }
}
