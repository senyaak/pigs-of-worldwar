// Playing one clip on one model, for the debug viewer and nothing else.
//
// The battle does NOT go through here: there the pose is the engine's, cursor
// and all, and the squad simply wears what it is handed (three/wear.ts). This
// is a loop with a clock of its own so a model can be looked at on its own,
// and it is the same sampler underneath (lib/game/clipPose.ts).

import { poseTurns } from '../../../lib/game/clipPose'
import type { ClipFrames } from '../../../lib/game/clipPose'
import { clipSeconds } from '../../../lib/game/clips'
import type { Pig } from './pig'

export interface Player {
  /** Loop this clip; null returns to the bind pose. */
  play(clip: ClipFrames | null): void
  /** Advance the loop and write the pose; once a frame. */
  update(delta: number): void
}

export function createPlayer(pig: Pig): Player {
  let playing: ClipFrames | null = null
  let elapsed = 0

  const write = (): void => {
    const runs = playing ? clipSeconds(playing) : 0
    const turns = poseTurns({
      clip: playing,
      seconds: runs > 0 ? elapsed % runs : 0,
      overlay: null,
      phase: 0
    })
    const count = Math.min(turns.length, pig.bones.length)
    for (let bone = 0; bone < count; bone++) {
      const { x, y, z, w } = turns[bone]
      pig.bones[bone].quaternion.set(x, y, z, w)
    }
  }

  return {
    play(clip) {
      playing = clip && clip.frameCount > 0 ? clip : null
      elapsed = 0
      write()
    },
    update(delta) {
      elapsed += delta
      write()
    }
  }
}
