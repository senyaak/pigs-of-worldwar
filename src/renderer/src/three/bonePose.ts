// The renderer's answer to `lib/game/pose.ts`: where a bone actually is, read
// off the skinned mesh the animation mixer has just posed.
//
// This is an ADAPTER and holds no rules — the offsets, the bone number and
// what is done with the result all belong to the domain. It exists so the
// strike, the shot and the scope can ask ONE question instead of each keeping
// its own copy of `updateMatrixWorld` / `localToWorld` / `worldToLocal`, and so
// that a headless engine can answer the same question with forward kinematics
// over HIR + MCAP without a single caller changing.
//
// The `updateMatrixWorld` is not optional: the mixer writes this frame's bone
// rotations, three folds them into world matrices only when it draws, and
// every caller here runs BEFORE the draw.

import * as THREE from 'three'
import type { Pose } from '../../../lib/game/pose'
import type { Squad } from './squad'

/**
 * Read poses out of `squad`, in the game space `root` defines — the battle's
 * own 180°-X group, which is what every rule in the domain works in.
 */
export function createBonePose(squad: Squad, root: THREE.Object3D): Pose {
  const at = new THREE.Vector3()
  return {
    boneToWorld(pig, bone, offset) {
      const soldier = squad.of(pig)
      if (!soldier) return null
      const joint = soldier.mesh.bones[bone] ?? soldier.mesh.bones[0]
      if (!joint) return null
      joint.updateMatrixWorld(true)
      at.set(offset.x, offset.y, offset.z)
      joint.localToWorld(at)
      root.worldToLocal(at)
      return { x: at.x, y: at.y, z: at.z }
    }
  }
}
