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
const ORDER = 'XYZ' as const
const BONE_COUNT = 15

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
      const times = Array.from({ length: clip.frameCount }, (_, frame) => frame / FPS)
      const tracks: THREE.KeyframeTrack[] = []
      for (let bone = 0; bone < Math.min(BONE_COUNT, pig.bones.length); bone++) {
        const values: number[] = []
        const euler = new THREE.Euler()
        const quaternion = new THREE.Quaternion()
        for (let frame = 0; frame < clip.frameCount; frame++) {
          const o = (frame * BONE_COUNT + bone) * 3
          euler.set(clip.rotations[o], clip.rotations[o + 1], clip.rotations[o + 2], ORDER)
          quaternion.setFromEuler(euler)
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
