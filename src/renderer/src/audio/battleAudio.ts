// The battle, HEARD.
//
// A listener on the engine's event stream (`lib/game/events.ts`) and nothing
// else: it knows which noise belongs to which moment and plays it. Every one of
// these used to be a `playCue` inside `three/battle.ts`, which made the
// renderer the place where the whole game got its sound — so graphics and audio
// could not be told apart, let alone replaced one without the other.
//
// WHICH sound belongs to a moment is still a NAME PICK for most of the pig's
// own noises, and `audio/battle.ts` says so at each field. Correct those in
// play through `pow.sfx`; this file is only the wiring.

import { handling } from '../../../lib/game/events'
import type { Emit } from '../../../lib/game/events'
import { meleeOf } from '../../../lib/game/melee'
import { isGun } from '../../../lib/game/projectile'
import { BARREL_SOUND, BATTLE_SOUNDS, playCue } from './battle'
import type { Bank } from './bank'

export interface BattleAudio {
  /** Subscribe this to the battle's bus. */
  listen: Emit
  /**
   * The canopies of the opening drop, heard the first frame the bank can play
   * them and only while somebody is still up.
   *
   * It is a poll rather than an event because the bank arrives a beat AFTER
   * the drop has already started — there is no moment to fire on, only the
   * first frame the sound exists. Call it once a frame while the drop runs.
   */
  chuteOverhead(running: boolean): void
}

/**
 * `bank` is asked for rather than held: it loads beside the scene and the
 * first frames of a battle are silent.
 */
export function createBattleAudio(bank: () => Bank): BattleAudio {
  let chuteHeard = false

  return {
    listen: handling({
      // ——— weapons ———
      // A barrel this table names, or the rifle's report for any GUN it does not
      // — the thirteen guns all sound alike enough for one stand-in and say so
      // (audio/battle.ts). A LOB with no entry makes no report at all: a grenade
      // leaving the hand is not a gunshot.
      fired: ({ skill }) => {
        const barrel = BARREL_SOUND[skill] ?? (isGun(skill) ? 'rifle' : null)
        if (barrel) playCue(bank(), BATTLE_SOUNDS[barrel])
      },
      whoosh: () => playCue(bank(), BATTLE_SOUNDS.whoosh),
      struck: ({ skill }) => {
        const weapon = meleeOf(skill)
        if (weapon) playCue(bank(), BATTLE_SOUNDS[weapon.impact])
      },
      blasted: () => playCue(bank(), BATTLE_SOUNDS.blast),
      // The CLICK under the foot. It is the only warning there is — a minefield
      // has nothing standing on it — and the bang is four tenths of a second
      // behind it (lib/game/mines.ts).
      mineTripped: () => playCue(bank(), BATTLE_SOUNDS.mine),
      // Every water contact splashes before the engine looks at the speed at
      // all, and then it is either a skip or a dousing.
      splashed: () => playCue(bank(), BATTLE_SOUNDS.splash),
      skimmed: () => playCue(bank(), BATTLE_SOUNDS.skim),
      doused: () => playCue(bank(), BATTLE_SOUNDS.doused),

      // ——— the map ———
      // The pig cheers: the exe plays 0x5E at its own position the moment the
      // skill is in.
      collected: () => playCue(bank(), BATTLE_SOUNDS.pickup),
      refused: () => playCue(bank(), BATTLE_SOUNDS.tooMany),
      // …and a health crate sighs instead, which is the heal's own sound and
      // arrives beside the cheer the crate already made.
      healed: () => playCue(bank(), BATTLE_SOUNDS.healed),
      skillUsed: () => playCue(bank(), BATTLE_SOUNDS.skillUsed),
      menuOpened: () => bank().play(BATTLE_SOUNDS.menuOpen.sound),

      // ——— things coming down ———
      // The aeroplane first, then the canopy a beat later.
      crateSent: () => playCue(bank(), BATTLE_SOUNDS.plane),
      crateChuted: () => playCue(bank(), BATTLE_SOUNDS.chute),
      crateLanded: () => playCue(bank(), BATTLE_SOUNDS.land),
      dropLanded: () => playCue(bank(), BATTLE_SOUNDS.land)
    }),
    chuteOverhead(running) {
      if (!running || chuteHeard) return
      if (!bank().has(BATTLE_SOUNDS.chute.sound)) return
      playCue(bank(), BATTLE_SOUNDS.chute)
      chuteHeard = true
    }
  }
}
