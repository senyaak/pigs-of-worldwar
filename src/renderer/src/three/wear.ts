// Making the mixers agree with what the engine says each pig is playing.
//
// The engine owns the clip and whether it has finished (`lib/game/anim.ts`);
// this walks the squad once a frame and applies it. Immediate mode on purpose:
// there is no event to miss and no way for the two to drift apart.
//
// `revision` is the whole trick. A clip that is merely STILL RUNNING must not
// be restarted every frame, and one that is asked for AGAIN must be — a second
// bayonet swing plays the same index twice and has to start over. The engine
// bumps the number whenever a clip starts, so applying it once is exactly
// right.

import type { Anim } from '../../../lib/game/anim'
import type { Squad } from './squad'

export interface Wear {
  /** Apply the engine's animation state to every pig drawn. Once a frame. */
  apply(): void
}

export function createWear(squad: Squad, anim: Anim): Wear {
  const applied = new Map<object, number>()

  return {
    apply() {
      for (const soldier of squad.members) {
        const worn = anim.wornBy(soldier.pig)
        if (applied.get(soldier.pig) !== worn.revision) {
          applied.set(soldier.pig, worn.revision)
          if (worn.once && worn.index !== null) soldier.playOnce(worn.index)
          else soldier.setClip(worn.index)
        }
        const over = anim.overlayOf(soldier.pig)
        soldier.overlay(over.index, over.phase)
      }
    }
  }
}
