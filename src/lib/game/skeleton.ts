// The bone chain, walked: where every joint of a posed pig actually is.
//
// The last thing the rules could not work out for themselves. A shot starts at
// the muzzle, a swing sweeps a blade and the rifle camera sits on the hand, and
// all three are points in a BONE's own frame — so until this existed, every one
// of them had to ask the renderer to pose a skeleton and read the answer off a
// mesh (`three/bonePose.ts`, now gone). A battle with nothing drawing it could
// walk and drop in but could not fire a shot.
//
// Nothing here is a guess: it is the same composition three does — world =
// parent · translate(bone) · rotate(clip) — and the same conventions the
// renderer's own pose was built on, in one place instead of two.
//
// Game space (Y-down) out; VTX units in, so the model scale rides here.

import type { Bone } from '../formats/hir'
import { MODEL_SCALE } from './scale'
import { aboutY, multiply, turn } from './quaternion'
import type { Quat } from './quaternion'
import type { Point } from './pose'

/**
 * The model's own forward axis — chosen so a pig FACES where it walks (π had
 * them strolling sideways like crabs; π/2 had them moonwalking).
 *
 * It sits here rather than beside the art because a bone's world position
 * depends on it, and that is a rule's question now.
 */
export const PIG_HEADING_OFFSET = -Math.PI / 2

/** One bone, placed: where its origin sits in model space and which way its
 * own frame is turned. */
export interface Joint {
  at: Point
  facing: Quat
}

/**
 * Every joint of the skeleton, given each bone's own turn (lib/game/clipPose).
 *
 * Parents come before children in the file (verified: pig.HIR), so one pass
 * down the list is enough — the root's parent is the model itself.
 */
export function poseSkeleton(bones: Bone[], turns: Quat[]): Joint[] {
  const joints: Joint[] = []
  bones.forEach((bone, index) => {
    const own = turns[index] ?? turns[turns.length - 1]
    if (index === 0) {
      joints.push({ at: { x: bone.x, y: bone.y, z: bone.z }, facing: own })
      return
    }
    const parent = joints[bone.parentIndex]
    const step = turn(parent.facing, { x: bone.x, y: bone.y, z: bone.z })
    joints.push({
      at: { x: parent.at.x + step.x, y: parent.at.y + step.y, z: parent.at.z + step.z },
      facing: multiply(parent.facing, own)
    })
  })
  return joints
}

/** Where a pig's art is standing, as the scene stands it. */
export interface Stood {
  /** The pig's own place, game space — `y` is its FEET. */
  at: Point
  heading: number
  /** Bind-pose distance from the model origin down to the soles: the art hangs
   * off the origin, not off the ground (lib/game/body.ts). */
  footOffset: number
}

/**
 * An offset in one bone's frame, in GAME space.
 *
 * The scene bolts a pig's art on with exactly this: scale by the model's,
 * turn by its heading plus the art's own forward axis, and stand the origin a
 * foot's height over where its soles are.
 */
export function jointToWorld(joint: Joint, offset: Point, stood: Stood): Point {
  const local = turn(joint.facing, offset)
  const model = {
    x: (joint.at.x + local.x) * MODEL_SCALE,
    y: (joint.at.y + local.y) * MODEL_SCALE,
    z: (joint.at.z + local.z) * MODEL_SCALE
  }
  const placed = turn(aboutY(stood.heading + PIG_HEADING_OFFSET), model)
  return {
    x: stood.at.x + placed.x,
    y: stood.at.y - stood.footOffset + placed.y,
    z: stood.at.z + placed.z
  }
}
