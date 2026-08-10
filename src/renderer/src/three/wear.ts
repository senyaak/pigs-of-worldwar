// Wearing the pose the snapshot describes.
//
// The renderer used to keep an animation mixer per pig and a clock to drive it
// — a second source of truth for something the rules measure blades and
// muzzles against. What a pig is playing and how far into it is the ENGINE's,
// and it arrives as four numbers on the snapshot (lib/game/snapshot.ts); the
// bones come out of the engine's own sampler (lib/game/clipPose.ts), so this is
// the same computation the rules did, not a second one that has to agree.
//
// `alpha` is what keeps it smooth: the rules step in fixed quanta and the
// screen does not, so the clip is sampled part of a step ahead of where the
// engine's own cursor stands — the same tween everything else on screen gets
// (three/tween.ts).

import { poseTurns } from '../../../lib/game/clipPose'
import type { ClipFrames } from '../../../lib/game/clipPose'
import { clipSeconds } from '../../../lib/game/clips'
import { STEP_SECONDS } from '../../../lib/game/engine'
import type { PigShot } from '../../../lib/game/snapshot'
import type { Squad } from './squad'

export interface Wear {
  /** Pose every pig in the snapshot, `alpha` of the way into the step that has
   * not run yet. Once a frame. */
  apply(pigs: readonly PigShot[], alpha: number): void
}

export function createWear(squad: Squad, clips: ClipFrames[]): Wear {
  const framesOf = (index: number | null): ClipFrames | null =>
    index === null || index < 0 ? null : (clips[index] ?? null)

  return {
    apply(pigs, alpha) {
      // Where the clip stands ON SCREEN: the engine's cursor is the boundary
      // that has already run, so the picture is that much of a step further on.
      const ahead = Math.max(0, Math.min(1, alpha)) * STEP_SECONDS
      for (const one of pigs) {
        const soldier = squad.of(one.id)
        if (!soldier) continue
        const clip = framesOf(one.clip)
        const seconds = Math.max(0, one.clipElapsed + ahead)
        const runs = clip ? clipSeconds(clip) : 0
        soldier.pose(
          poseTurns({
            clip,
            // A committed clip HOLDS its last frame — the exe's repeat count of
            // one, and the reason a get-up does not snap back to frame 0. A
            // looping one wraps (lib/game/bonePose.ts says the same thing for
            // the pose the rules measure).
            seconds: one.clipOnce || runs <= 0 ? seconds : seconds % runs,
            overlay: framesOf(one.overlay),
            phase: one.overlayPhase
          })
        )
      }
    }
  }
}
