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

/**
 * The rate the clips play at.
 *
 * It is NOT the rate they would have to play at for the hooves to stay put:
 * the run clip's planted hoof sweeps about 38 units a frame, so at 25 it
 * carries a body some 960 units a second while the exe walks 1560, and the
 * pig slides by half as much again. Driving playback off the walking speed
 * instead was tried and read plainly WRONG in play — the legs whirl. So the
 * original slid its pigs too, and this stays a flat 25.
 * (`../pigs-disasm/movement/stride.js` has the measurement.)
 */
const CLIP_FPS = 25
const BONE_COUNT = 15

/**
 * Which bones the weapon channel takes, and which it leaves to whatever is
 * playing underneath: the two ARMS, and nothing else.
 *
 * WHICH branches is the remake's own; the SHAPE is not. The engine holds the
 * two channels as key-frame LISTS of six entries each and counts the leading
 * non-null ones (0x440edf); six is exactly the skeleton's branch count — hip,
 * spine+head, each arm, each leg (docs/formats.md) — so the split is per
 * branch. The mask itself is inside `wh32lib.dll`'s `afGetKeyFrameList` and
 * has not been read.
 *
 * The head is the one that had to be settled in play, and the aiming clip
 * explains why it is touchy: its hip carries a yaw of 0.58 rad where an
 * idle's is flat and its head carries −0.68 back against it, so the pose is a
 * bladed rifle stance with the head turned out of it — three numbers that
 * only add up to "looking where you point" if you take all three. Taking the
 * spine and head WITHOUT the hip leaves the counter-turn bare and the pig
 * stares 39° off. Taking the hip as well was tried next and reads worse still
 * — it swings the legs with it, since they hang off it. So the arms alone,
 * and the pig keeps its own head.
 */
const OVERLAY_BONES = [3, 4, 5, 6, 7, 8]

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

/** How long a clip runs at `CLIP_FPS`, in seconds. */
export const clipSeconds = (clip: Clip | null | undefined): number =>
  clip ? clip.frameCount / CLIP_FPS : 0

export interface Player {
  /** Apply one clip in a loop; null returns to the bind pose. */
  play(clip: Clip | null): void
  /**
   * Play a clip through ONCE and hold its last frame.
   *
   * This is what the original means by a repeat count of 1: `Pig::SetAnim`'s
   * third argument counts LOOPS, not frames — the exe only decrements it on
   * the frame the clip's own cursor wraps past 0x1000 (0x46e27f..0x46e2cb) —
   * and the two places it matters most are gated on the clip finishing
   * rather than on a timer. The jump does not leave the ground until the
   * wind-up has run out (0x46e8e2 calls `StartFalling`), and a landing wears
   * the get-up until it is done.
   *
   * Holding the last frame is the remake's own: the exe hands the pig to its
   * idle sequence the moment the loop is spent, and until that sequence is
   * decoded a clamped final pose is a great deal better than snapping back
   * to frame 0 — which is what a LOOPING player faked with a timer does, and
   * it reads as a bounce.
   */
  playOnce(clip: Clip | null): void
  /**
   * Lay a clip's UPPER BODY over whatever is playing, held at one point of
   * it — `phase` runs 0..1 from its first frame to its last. Null clears it.
   *
   * This is the weapon channel. A pig has TWO animation slots, not one:
   * `Pig::SetAnim` (0x471ef0) writes one block of fields and 0x471f50 writes
   * a second, identical one beside it, and it is the second that carries
   * getting a weapon out and holding the aim — the first goes on running,
   * walking or idling underneath. That is why the original's pig can charge
   * with a bayonet and still hold it: one clip in the legs, another in the
   * arms (../../../pigs-disasm/weapons/notes.md).
   *
   * The angle is a cursor rather than a playback: the aiming clips are one
   * 65-frame sweep from full up to full down, and `Pig::ChangeAimAngle`
   * hands 0x471f50 a fixed frame worked out from it.
   */
  overlay(clip: Clip | null, phase: number): void
  /** Whether a `playOnce` is still running. False for a looping clip. */
  running(): boolean
  /** Advance time; call once per frame. */
  update(delta: number): void
}

export function createPlayer(pig: Pig): Player {
  let mixer: THREE.AnimationMixer | null = null
  /** Seconds left of a one-shot, or 0 when a loop (or nothing) is playing. */
  let left = 0

  const start = (clip: Clip | null, once: boolean): void => {
    mixer?.stopAllAction()
    mixer = null
    left = 0
    if (!clip) {
      for (const bone of pig.bones) bone.rotation.set(0, 0, 0)
      return
    }
    const boneCount = Math.min(BONE_COUNT, pig.bones.length)
    const times = Array.from({ length: clip.frameCount }, (_, frame) => frame / CLIP_FPS)

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
    if (once) {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      left = clipSeconds(clip)
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity)
    }
    action.play()
  }

  // Scratch for the overlay, which runs every frame and allocates nothing.
  const a = new THREE.Quaternion()
  const b = new THREE.Quaternion()
  let overlaid: { clip: Clip; phase: number } | null = null

  /** Write the overlay's bones. Runs AFTER the mixer, which writes all of
   * them — otherwise the clip underneath would put the arms straight back. */
  const applyOverlay = (): void => {
    if (!overlaid) return
    const { clip, phase } = overlaid
    const at = Math.max(0, Math.min(1, phase)) * (clip.frameCount - 1)
    const first = Math.floor(at)
    const second = Math.min(clip.frameCount - 1, first + 1)
    const between = at - first
    for (const bone of OVERLAY_BONES) {
      if (bone >= pig.bones.length) continue
      const one = (first * BONE_COUNT + bone) * 3
      const two = (second * BONE_COUNT + bone) * 3
      decodeRotation(clip.rotations[one], clip.rotations[one + 1], clip.rotations[one + 2], a)
      decodeRotation(clip.rotations[two], clip.rotations[two + 1], clip.rotations[two + 2], b)
      pig.bones[bone].quaternion.copy(a).slerp(b, between)
    }
  }

  return {
    play: (clip) => start(clip, false),
    playOnce: (clip) => start(clip, true),
    overlay(clip, phase) {
      overlaid = clip && clip.frameCount > 0 ? { clip, phase } : null
      applyOverlay()
    },
    running: () => left > 0,
    update(delta) {
      mixer?.update(delta)
      applyOverlay()
      if (left > 0) left = Math.max(0, left - delta)
    }
  }
}
