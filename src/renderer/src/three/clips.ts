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

// The MCAP rotation convention is not fully pinned down. The three per-bone
// floats are angles in radians, but which euler order / axis encoding, and
// whether they are parent-relative or absolute model-space, is still under
// investigation — the game applies them in LIMB-ALIGNED bone frames, while
// our bones are world-axis-aligned, so no single reading here is exact yet.
// window.__ROT_MODE__ switches interpretations for eyeballing against the
// real game (values: xyz|zyx|yxz|xzy|yzx|zxy|axis, optional "a" prefix =
// absolute). Default xyz. Removing this needs the game's skeletal-apply
// routine disassembled (statically linked in warhogs_.exe's anim lib).
type RotMode = string
function rotMode(): RotMode {
  return (globalThis as { __ROT_MODE__?: RotMode }).__ROT_MODE__ ?? 'xyz'
}
function isAbsolute(): boolean {
  return rotMode().startsWith('a') && rotMode() !== 'axis'
}
function baseMode(): string {
  const m = rotMode()
  return m.startsWith('a') && m !== 'axis' ? m.slice(1) : m
}
function decodeRotation(x: number, y: number, z: number, out: THREE.Quaternion): void {
  const mode = baseMode()
  if (mode === 'axis') {
    // Rotation vector: direction = axis, length = angle (radians).
    const angle = Math.hypot(x, y, z)
    if (angle < 1e-6) {
      out.set(0, 0, 0, 1)
      return
    }
    out.setFromAxisAngle(new THREE.Vector3(x / angle, y / angle, z / angle), angle)
    return
  }
  out.setFromEuler(new THREE.Euler(x, y, z, mode.toUpperCase() as 'XYZ'))
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
      const parentOf = pig.bones.map((b) => pig.bones.indexOf(b.parent as THREE.Bone))
      const absolute = isAbsolute()
      const times = Array.from({ length: clip.frameCount }, (_, frame) => frame / FPS)

      // Per bone, per frame, the LOCAL quaternion to store.
      const local: THREE.Quaternion[][] = Array.from({ length: boneCount }, () => [])
      const world = new THREE.Quaternion()
      for (let frame = 0; frame < clip.frameCount; frame++) {
        const frameWorld: THREE.Quaternion[] = []
        for (let bone = 0; bone < boneCount; bone++) {
          const o = (frame * BONE_COUNT + bone) * 3
          decodeRotation(clip.rotations[o], clip.rotations[o + 1], clip.rotations[o + 2], world)
          frameWorld[bone] = world.clone()
          if (absolute) {
            const parent = parentOf[bone]
            local[bone].push(
              parent >= 0 && parent < bone
                ? frameWorld[parent].clone().invert().multiply(frameWorld[bone])
                : frameWorld[bone].clone()
            )
          } else {
            local[bone].push(frameWorld[bone].clone())
          }
        }
      }

      const tracks: THREE.KeyframeTrack[] = []
      for (let bone = 0; bone < boneCount; bone++) {
        const values: number[] = []
        for (const q of local[bone]) values.push(q.x, q.y, q.z, q.w)
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
