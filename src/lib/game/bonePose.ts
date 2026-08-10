// The engine's own answer to `lib/game/pose.ts`: forward kinematics over the
// HIR skeleton and the MCAP clip the pig is wearing.
//
// It needs three things and none of them is a scene: the skeleton, the clips,
// and what each pig is playing and how far into it — which the engine has
// owned since `anim.ts` grew a cursor. `three/bonePose.ts` used to answer this
// by posing a skinned mesh and reading a bone off it, so a battle nobody was
// drawing could not fire a shot.
//
// The renderer draws from the SAME sampler over the same four numbers off the
// snapshot (three/wear.ts), so where the blade swings and where the blade is
// drawn cannot drift apart.

import { poseTurns, rootAt } from './clipPose'
import type { ClipFrames } from './clipPose'
import { clipSeconds } from './clips'
import { jointToWorld, poseSkeleton } from './skeleton'
import type { Joint } from './skeleton'
import type { Quat } from './quaternion'
import type { Anim } from './anim'
import type { Bone } from '../formats/hir'
import type { Pig } from './game'
import type { Point, Pose } from './pose'

export interface BonePoseParts {
  /** The HIR chain. Empty means nothing can be posed. */
  skeleton: Bone[]
  /** Every clip, with its rotations — indexed as the engine's clip numbers. */
  clips: ClipFrames[]
  /** What each pig wears, and how far into it (lib/game/anim.ts). */
  anim: Anim
}

export type BonePose = Pose

export function createBonePose(parts: BonePoseParts): BonePose {
  const { skeleton, clips, anim } = parts

  const framesOf = (index: number | null): ClipFrames | null =>
    index === null || index < 0 ? null : (clips[index] ?? null)

  /**
   * Where the cursor really sits in the clip.
   *
   * A committed clip HOLDS its last frame — the exe's repeat count of one, and
   * the reason a get-up does not snap back to frame 0. A looping one wraps.
   */
  const cursorOf = (clip: ClipFrames | null, seconds: number, once: boolean): number => {
    if (!clip) return 0
    const runs = clipSeconds(clip)
    if (once || runs <= 0) return seconds
    return seconds % runs
  }

  const turnsOf = (pig: Pig, seconds: number): Quat[] => {
    const worn = anim.wornBy(pig)
    const clip = framesOf(worn.index)
    const over = anim.overlayOf(pig)
    return poseTurns({
      clip,
      seconds: cursorOf(clip, Math.max(0, seconds), worn.once),
      overlay: framesOf(over.index),
      phase: over.phase
    })
  }

  const jointsOf = (pig: Pig): Joint[] => {
    const worn = anim.wornBy(pig)
    const clip = framesOf(worn.index)
    // The body's own offset rides on the root, so the blade and the muzzle bob
    // with the pig exactly as the drawn model does (lib/game/clipPose.ts).
    const lift = rootAt(clip, cursorOf(clip, Math.max(0, worn.elapsed), worn.once))
    return poseSkeleton(skeleton, turnsOf(pig, worn.elapsed), lift)
  }

  return {
    boneToWorld(pig: Pig, bone: number, offset: Point): Point | null {
      if (skeleton.length === 0) return null
      const joints = jointsOf(pig)
      const joint = joints[bone] ?? joints[0]
      if (!joint) return null
      return jointToWorld(joint, offset, {
        at: pig.position,
        heading: pig.heading,
        footOffset: pig.body.footOffset
      })
    }
  }
}
