// A clip, sampled: what every bone is turned by at one moment of it.
//
// This was the mixer's job (`three/clips.ts`), which meant the pose only
// existed once something drew it — and the muzzle, the blade and the scope's
// eye all hang off the pose. It is arithmetic over the parsed clip, so it
// belongs where the rules are, and the renderer now WRITES the answer onto its
// bones rather than working out its own.
//
// The MCAP rotation convention, settled by analysis of the shipped data
// (anim/, three independent tests):
//
//   local = Rx(-x) · Ry(-y) · Rz(-z),  applied PARENT-RELATIVE.
//
// * NEGATED — the game's matrices are row-major (row-vector × matrix), the
//   transpose of three's convention; for a rotation, transpose = negate. Only
//   negated do the arms hang down out of the T-pose bind instead of sticking
//   up (solve-convention.js).
// * PARENT-RELATIVE, not absolute model space — in "Turning on Spot" the hip
//   is all zeros while the limbs move, so the body yaw is not baked into every
//   bone (solve-hierarchy.js).
// * XYZ order (lib/game/quaternion.ts).

import { CLIP_FPS } from './clips'
import type { ClipTiming } from './clips'
import { NO_TURN, fromEulerXYZ, multiply, slerp } from './quaternion'
import type { Quat } from './quaternion'

/** How many bones a keyframe carries (lib/formats/mcap.ts). */
export const BONE_COUNT = 15

/** A clip with its rotations — what a pose needs, where `ClipTiming` is all
 * the turn clock needs. */
export interface ClipFrames extends ClipTiming {
  /** frameCount × 15 × 3 floats: per-bone euler angles, radians. */
  rotations: Float32Array
}

/**
 * Which bones the weapon channel takes: **0..8**, the hip up through both
 * arms, leaving 9..14 — the legs — to whatever is playing underneath.
 *
 * Not a judgement call. `Data/_d3d.dll` builds the pose at 0x10012050 and the
 * split is two hard-coded loop counts: nine bones from the weapon channel
 * starting at keyframe offset +0x20, then six from the primary starting at
 * +0xb0. A keyframe is 2 + 30 + 15×16 bytes, so rotations start at +0x20 and
 * +0xb0 is 0x20 + 9×0x10 — bone 0 and bone 9 exactly, 9 + 6 = 15. When the
 * weapon channel's clip is −1 both halves read the primary, which is the
 * unarmed case.
 *
 * The hip has to be in it, and the aiming clip shows why: its hip carries a
 * yaw of 0.58 rad where an idle's is flat and its head carries −0.68 back
 * against it — a bladed rifle stance with the head turned out of it, three
 * numbers that only add up to "looking where you point" if you take all three.
 */
const OVERLAY_BONES = [1, 2, 3, 4, 5, 6, 7, 8]

/**
 * …with the hip's share of it FOLDED INTO THE SPINE instead of written to the
 * hip, which is the one place this departs from the loop counts above.
 *
 * The library writes its two halves into two separate pose arrays — the weapon
 * channel's nine into 0x11cc0b40, the primary's six into 0x11cc0a30 — and then
 * puts the PRIMARY channel's bone 0 into the second array's own bone-0 slot
 * (0x1001223f). So the model's root is the primary's, and the weapon channel's
 * bone 0 is the root of the upper chain alone. Written straight onto the hip it
 * tilts the pig entire, legs and all, as the aim sweeps; composed into the
 * spine it leans only the torso and still lets the head's −0.68 cancel the
 * stance's +0.58 yaw.
 */
const SPINE = 1

/** One bone's turn on one frame of a clip. */
function frameTurn(clip: ClipFrames, frame: number, bone: number): Quat {
  const at = (frame * BONE_COUNT + bone) * 3
  return fromEulerXYZ(-clip.rotations[at], -clip.rotations[at + 1], -clip.rotations[at + 2])
}

/** Where in a clip `seconds` lands: the frame before, the one after, and how
 * far between them. */
function cursor(clip: ClipFrames, seconds: number): { first: number; second: number; between: number } {
  const last = Math.max(0, clip.frameCount - 1)
  const at = Math.max(0, Math.min(last, seconds * CLIP_FPS))
  const first = Math.floor(at)
  return { first, second: Math.min(last, first + 1), between: at - first }
}

/** One bone, `seconds` into a clip — the two frames it falls between, slerped
 * the short way (three's own keyframe track does exactly this). */
export function turnAt(clip: ClipFrames, bone: number, seconds: number): Quat {
  if (clip.frameCount <= 0) return NO_TURN
  const { first, second, between } = cursor(clip, seconds)
  return slerp(frameTurn(clip, first, bone), frameTurn(clip, second, bone), between)
}

export interface PoseRequest {
  /** What is worn, and how far into it. Null is the bind pose. */
  clip: ClipFrames | null
  seconds: number
  /** The weapon channel laid over the top, held at one point of it — a cursor
   * rather than a playback (lib/game/aim.ts). Null is nothing over. */
  overlay: ClipFrames | null
  /** 0..1 through the overlay. */
  phase: number
}

/**
 * Every bone's own turn, parent-relative — the whole pose, in one array of 15.
 *
 * This is what the skeleton walks (lib/game/skeleton.ts) and what the renderer
 * writes onto its bones. Neither of them decides any of it.
 */
export function poseTurns(request: PoseRequest): Quat[] {
  const { clip, seconds, overlay, phase } = request
  const turns: Quat[] = []
  for (let bone = 0; bone < BONE_COUNT; bone++) {
    turns.push(clip ? turnAt(clip, bone, seconds) : NO_TURN)
  }
  if (!overlay || overlay.frameCount <= 0) return turns
  // The overlay is held at a POINT of its clip, so its cursor is a fraction of
  // the whole rather than a time.
  const held = Math.max(0, Math.min(1, phase)) * ((overlay.frameCount - 1) / CLIP_FPS)
  const hip = turnAt(overlay, 0, held)
  for (const bone of OVERLAY_BONES) {
    const over = turnAt(overlay, bone, held)
    turns[bone] = bone === SPINE ? multiply(hip, over) : over
  }
  return turns
}
