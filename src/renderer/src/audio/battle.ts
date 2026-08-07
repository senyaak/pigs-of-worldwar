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
  splash: 'I_SPLASH',
  /**
   * Collecting a crate, and being refused one. These two are DECODED rather
   * than picked by name: `Pig::GiveSkill` plays 0x5E at the pig's own
   * position once the skill is in (0x4759F2, out of 0x475960), and 0x4F on
   * the branch that finds fifteen slots already full (0x465925). Index 94
   * and 79 in `Audio/sfxday.srl` are P_WHOOPE and P_OWW — the pig cheers,
   * or complains (../pigs-disasm/skills/notes.md).
   */
  pickup: 'P_WHOOPE',
  tooMany: 'P_OWW',
  /** The skill menu driving in. A name pick, like the movement ones: the
   * bank's own S_OPEN sits beside S_SELECT and S_CLOCK, which is the family
   * of interface noises, and the exe's menu mode is not decoded far enough
   * to say which index it asks for. */
  menuOpen: 'S_OPEN',
  /**
   * A hand-to-hand swing, and what it lands with. All four are DECODED:
   * `Pig::HandToHandStrike` plays 0x21 as the blade goes live (event id 61,
   * 0x474c89) and the weapon's own impact index when it connects (0x476712) —
   * 0x20 for the knife, the bayonet and the cattle prod, 0x22 for the sword,
   * 0x51 for bare trotters and boots. Indices 33, 32, 34 and 81 of
   * `Audio/sfxday.srl` are I_SWMISS, I_STAB, I_SWORD and P_PUNCH: the whoosh
   * and the three ways of connecting (../pigs-disasm/weapons/melee.md).
   */
  whoosh: 'I_SWMISS',
  stab: 'I_STAB',
  sword: 'I_SWORD',
  punch: 'P_PUNCH',
  /** A canopy opening over the level's drop-in. The bank carries P_CHUTE and
   * P_CHUTE1 and the exe's own choice is NOT decoded — `StartParachuting`
   * pushes 0x35 to an effect spawner, which is 53 and so is P_CHUTE, but the
   * landing pushes 0x1e through the same call and 30 is I_PICKUP, so the
   * match is a coincidence until someone reads that function. A name pick,
   * like the rest of this table. */
  chute: 'P_CHUTE'
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
