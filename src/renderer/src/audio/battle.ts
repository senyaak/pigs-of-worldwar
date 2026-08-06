// What the battle sounds like: the pig's own noises, fired off the changes
// in its locomotion state rather than on a timer.
//
// WHICH sound goes with which moment is chosen by NAME out of the shipped
// bank, not decoded — the exe refers to sounds by index and no call site
// for these has been read yet (../pigs-disasm/anim/audio-events.md). The
// names are unambiguous enough to be worth having now (`P_LAND1` on a
// landing, `I_SPLASH` on hitting water), and play is what corrects them.
//
// Footsteps are deliberately absent. They want the hoof-contact frames the
// notes derive from the skeleton, and until they are wired a footstep on a
// timer would be a stand-in nobody asked for.

import type { LocomotionState } from '../../../lib/game/locomotion'
import type { Bank } from './bank'

/** The moments this module has a sound for. */
export const BATTLE_SOUNDS = {
  /** Leaving the ground under the player's own power. */
  jump: 'P_EXERT',
  /** Coming to rest after any flight. */
  land: 'P_LAND1',
  /** Thrown out of a wall by the wedge counter. */
  ejected: 'P_OWW',
  /** Going into the water, and coming out of it. */
  splash: 'I_SPLASH'
} as const

export interface BattleSounds {
  /** Call once per frame with the acting pig's state. */
  follow(state: LocomotionState, swimming: boolean): void
  /** Start again on a new pig, without firing anything for the change. */
  reset(): void
}

export function createBattleSounds(bank: Bank): BattleSounds {
  let airborne = false
  let ejected = false
  let wet = false
  let fresh = true

  return {
    reset() {
      fresh = true
    },
    follow(state, swimming) {
      const flying = state.airborne !== null
      const thrown = state.airborne?.ejected === true

      if (fresh) {
        // A new pig starts wherever it starts; only CHANGES make a noise.
        fresh = false
      } else {
        if (thrown && !ejected) bank.play(BATTLE_SOUNDS.ejected)
        else if (flying && !airborne) bank.play(BATTLE_SOUNDS.jump)
        if (!flying && airborne) bank.play(BATTLE_SOUNDS.land)
        if (swimming !== wet) bank.play(BATTLE_SOUNDS.splash)
      }

      airborne = flying
      ejected = thrown
      wet = swimming
    }
  }
}
