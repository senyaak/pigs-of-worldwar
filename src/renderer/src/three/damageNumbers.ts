// The damage numbers, PROJECTED.
//
// The list and its ageing are the engine's (`lib/game/damage.ts`); what only
// this side can do is turn a point in the world into a place on the screen,
// because that needs the camera. The projection is the same one the name
// plates use (three/squad.ts), and it goes through the battle's own converted
// root — game space is Y-DOWN, so rising means a SMALLER y.

import * as THREE from 'three'
import { NUMBER_RISE } from '../../../lib/game/damage'
import type { FloatingDamage } from '../../../lib/game/damage'
import type { FloatingNumber } from '../contracts/overlay'

/**
 * Where each of them is on a view this big, oldest first. `root` is the group
 * everything game-space hangs in.
 */
export function projectDamage(
  live: readonly FloatingDamage[],
  camera: THREE.Camera,
  root: THREE.Object3D,
  width: number,
  height: number
): FloatingNumber[] {
  const at = new THREE.Vector3()
  const out: FloatingNumber[] = []
  for (const one of live) {
    at.set(one.x, one.y - NUMBER_RISE * one.age, one.z)
    root.localToWorld(at)
    at.project(camera)
    if (at.z > 1) continue // behind the camera
    out.push({
      x: (at.x * 0.5 + 0.5) * width,
      y: (-at.y * 0.5 + 0.5) * height,
      value: one.value,
      age: one.age,
      style: one.style
    })
  }
  return out
}
