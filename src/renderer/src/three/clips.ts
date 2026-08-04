// MCAP clips → playable animation.
//
// Rotations are per-bone euler angles in the game's Y-down space, applied to
// the bones directly (the Y-up conversion sits above the mesh, pig.ts).
// The euler order and the meaning of the branch positions are still under
// investigation; ORDER is the current best guess, checked visually against
// the game's idle/walk clips.

import * as THREE from 'three'
import type { Clip } from '../api'
import type { Pig } from './pig'

const FPS = 25
const BONE_COUNT = 15

// The MCAP rotation convention, settled by analysis of the shipped data
// (pigs-disasm/anim/, three independent tests):
//
//   local = Rx(-x) · Ry(-y) · Rz(-z),  applied PARENT-RELATIVE.
//
// * NEGATED — the game's matrices are row-major (row-vector × matrix), the
//   transpose of three's convention; for a rotation, transpose = negate.
//   Only negated do the arms hang down out of the T-pose bind instead of
//   sticking up (solve-convention.js).
// * PARENT-RELATIVE, not absolute model space — in "Turning on Spot" the hip
//   is all zeros while the limbs move, so the body yaw is not baked into
//   every bone (solve-hierarchy.js).
// * XYZ order — motion capture is smooth, and XYZ minimises frame-to-frame
//   joint travel by a wide margin over the other five orders
//   (solve-order.js: 10818 vs 11977 for the runner-up).
const EULER_ORDER = 'XYZ' as const
function decodeRotation(x: number, y: number, z: number, out: THREE.Quaternion): void {
  out.setFromEuler(new THREE.Euler(-x, -y, -z, EULER_ORDER))
}

export interface Player {
  /** Apply one clip in a loop; null returns to the bind pose. */
  play(clip: Clip | null): void
  /** Advance time; call once per frame. */
  update(delta: number): void
}

export function createPlayer(pig: Pig): Player {
  let mixer: THREE.AnimationMixer | null = null

  return {
    play(clip) {
      mixer?.stopAllAction()
      mixer = null
      if (!clip) {
        for (const bone of pig.bones) bone.rotation.set(0, 0, 0)
        return
      }
      const boneCount = Math.min(BONE_COUNT, pig.bones.length)
      const times = Array.from({ length: clip.frameCount }, (_, frame) => frame / FPS)

      // Stored rotations are already parent-relative, which is exactly what
      // three's bone hierarchy wants — no conversion needed.
      const tracks: THREE.KeyframeTrack[] = []
      const quaternion = new THREE.Quaternion()
      for (let bone = 0; bone < boneCount; bone++) {
        const values: number[] = []
        for (let frame = 0; frame < clip.frameCount; frame++) {
          const o = (frame * BONE_COUNT + bone) * 3
          decodeRotation(clip.rotations[o], clip.rotations[o + 1], clip.rotations[o + 2], quaternion)
          values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
        }
        // Tracks bind by the bone names pig.ts assigns (bone_0 … bone_14).
        tracks.push(
          new THREE.QuaternionKeyframeTrack(`${pig.bones[bone].name}.quaternion`, times, values)
        )
      }
      const animation = new THREE.AnimationClip('mcap', -1, tracks)
      mixer = new THREE.AnimationMixer(pig.mesh)
      const action = mixer.clipAction(animation)
      action.setLoop(THREE.LoopRepeat, Infinity)
      action.play()
    },
    update(delta) {
      mixer?.update(delta)
    }
  }
}
