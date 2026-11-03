// THE LINK TO THE BRAIN'S PROCESS: the port the engine's seat asks through, and
// what the scene keeps beside it — the console's hotseat, the reply
// subscription, the asks counted.

import { remoteBrain } from '../../../../lib/game/brainPort'
import type { BrainPort, BrainReply } from '../../../../lib/game/brainPort'
import { brainSeedFor } from '../../../../lib/game/engine'
import type { ObstacleField } from '../../../../lib/game/obstacles'
import type { MapObject } from '../../api'

export interface BrainLink {
  /**
   * Console: `pow.hotseat()` hands the machine's sides to the keyboard —
   * hotseat, the way the pure specs already play — so play can drive the
   * enemy and test weapons from both ends. FOR THIS BATTLE ONLY: the flag
   * lives in the scene and the next battle builds a fresh one, machine on.
   */
  hotseat: boolean
  /** The reply subscription, dropped with the battle. */
  unsubscribeBrain: (() => void) | null
  /** The engine's obstacle field, read at ASK time — the engine that owns it is
   * built after the brain it is handed. */
  field: ObstacleField | null
  /** Asks out and orders back — the only visible proof the process is doing
   * the thinking (three/debug.ts, `brain`). */
  brainTally: { asked: number; answered: number }
}

export const createBrainLink = (): BrainLink => ({
  hotseat: false,
  unsubscribeBrain: null,
  field: null,
  brainTally: { asked: 0, answered: 0 }
})

/**
 * **THE MACHINE THINKS IN ITS OWN PROCESS** (lib/game/brainPort.ts,
 * src/brain/).
 *
 * A turn's plan floods the whole map — about 25 000 cells, a few hundred
 * milliseconds — and it used to do it inside one engine step, which is
 * inside this file's `onFrame`, which is the same JS task as
 * `renderer.render`. So the picture stopped dead every time a pig started
 * thinking: "провисание рендера на 1 секунду… это отдельный нод процесс
 * должен быть — получил данные, вернул план".
 *
 * Now it is: the seat posts the facts and picks the order up on a later
 * step, the pig standing still meanwhile exactly as it stands through the
 * ordinary mull. The field is read at ASK time rather than captured here,
 * because the engine that owns it does not exist until the next statement.
 */
export const remoteBrainFor = (link: BrainLink, map: string, objects: MapObject[]): BrainPort =>
  remoteBrain(
    {
      post: (message) => {
        if (message.kind === 'ask') link.brainTally.asked++
        window.api.brainSend(message)
      },
      onMessage: (handler) => {
        link.unsubscribeBrain = window.api.onBrainReply((message) => {
          link.brainTally.answered++
          handler(message as BrainReply)
        })
      },
      close: () => {
        link.unsubscribeBrain?.()
        link.unsubscribeBrain = null
      }
    },
    { kind: 'battle', map, objects, seed: brainSeedFor() },
    () => link.field?.changes() ?? { gone: [], moved: [] }
  )
