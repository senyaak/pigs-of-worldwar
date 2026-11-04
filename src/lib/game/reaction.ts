// What a pig does about having been hurt: the pass the exe makes over everybody
// when a turn has played out (0x497760 -> 0x4976E0 -> 0x467ec0 for each pig).
//
// `[pig+0x1ac]` adds up the damage since the last pass (`Pig::TakeDamage`,
// 0x467b4b) and the pass reads and zeroes it. A living pig with any of it to show
// and a status bit up plays `Pig::React(11)` (0x467f77), whose arm is the SNEEZE
// and nothing else: no sound, no check of what is in its hands (0x4726dc). The
// reading is `movement/clips.md` in the disasm repo.
//
// Built here is that arm alone, the one status bit the remake has being the
// poison's. The rest of the pass is not: the brushoff of a pig hurt with no bit up
// (0x467f74, kinds 0..3 at 0x4723BA), and the camera's visit to a dying pig or one
// left under twenty points (0x497725, modes 15..17).
//
// Pure, like the rest of lib/game.

import { SNEEZE_CLIP } from './gas'
import { isDead } from './health'
import type { Emit, PigId } from './events'
import type { Pig } from './game'

export interface ReactionWorld {
  pigs: () => Pig[]
  /** Whether a status bit is up on this pig (lib/game/poison.ts). */
  afflicted: (pig: Pig) => boolean
}

export interface Reaction {
  /** This pig took damage; it has something to show at the next pass. */
  hurt(pig: PigId): void
  /** The pass: everyone's damage is read and forgotten. */
  settle(): void
}

export function createReaction(world: ReactionWorld, emit: Emit): Reaction {
  const hurtSinceLastPass = new Set<PigId>()

  return {
    hurt(pig) {
      hurtSinceLastPass.add(pig)
    },
    settle() {
      for (const pig of world.pigs()) {
        if (!hurtSinceLastPass.has(pig.id)) continue
        // A dead pig's arm is the corpse's and plays no reaction (0x467f06).
        if (isDead(pig) || !world.afflicted(pig)) continue
        emit({ kind: 'clip', pig: pig.id, index: SNEEZE_CLIP, once: true })
      }
      hurtSinceLastPass.clear()
    }
  }
}
