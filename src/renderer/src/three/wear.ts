// Wearing the engine's pose.
//
// The renderer used to keep an animation mixer per pig and a clock to drive it
// — a second source of truth for something the rules measure blades and
// muzzles against. The pose is the ENGINE's now (lib/game/bonePose.ts), turn
// by turn, and this walks the squad once a frame and writes it onto the bones.
//
// `alpha` is what keeps it smooth: the rules step in fixed quanta and the
// screen does not, so the clip is sampled part of a step ahead of where the
// engine's own cursor stands — the same tween everything else on screen gets
// (three/tween.ts).

import { STEP_SECONDS } from '../../../lib/game/engine'
import type { Anim } from '../../../lib/game/anim'
import type { BonePose } from '../../../lib/game/bonePose'
import type { Squad } from './squad'

export interface Wear {
  /** Pose every pig drawn, `alpha` of the way into the step that has not run
   * yet. Once a frame. */
  apply(alpha: number): void
}

export function createWear(squad: Squad, anim: Anim, pose: BonePose): Wear {
  return {
    apply(alpha) {
      // Where the clip stands ON SCREEN: the engine's cursor is the boundary
      // that has already run, so the picture is that much of a step further on.
      const ahead = Math.max(0, Math.min(1, alpha)) * STEP_SECONDS
      for (const soldier of squad.members) {
        const worn = anim.wornBy(soldier.pig)
        soldier.pose(pose.poseOf(soldier.pig, worn.elapsed + ahead).turns)
      }
    }
  }
}
