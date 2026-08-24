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
import { BARREL_SOUND, BATTLE_SOUNDS, playCue, stepCue, underlayCue } from './battle'
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
  /**
   * Every planted charge burning, by the seconds of fuse it has left: the hiss,
   * the timer over it, and the click as the timer runs out
   * (`BATTLE_SOUNDS.fuse`, `.fuseTimer`, `.fuseOut`).
   */
  fuseBurning(remaining: readonly number[], delta: number): void
}

/**
 * **EVERY RATE HERE IS THE SAMPLE'S OWN LENGTH**, and that is not a nicety: a
 * cue is fire-and-forget with no handle to stop, so a sound repeated faster
 * than it lasts piles copies on top of each other and the last of them go on
 * sounding after the thing that started them is gone. Play heard exactly that
 * — "щас он тикает даже после взрыва" — off a 1.06-second clock fired every
 * 0.45.
 */
/** The TIMER: `S_CLOCK` is 1.06 s. One a second, and never two at once. */
export const FUSE_TICK = 1.1
/** How much fuse is left when the timer is heard RUNNING OUT — `L_MINETR`, a
 * fifth of a second, so it lands clear of the blast. */
export const FUSE_LAST = 0.5

/**
 * `bank` is asked for rather than held: it loads beside the scene and the
 * first frames of a battle are silent.
 */
export function createBattleAudio(bank: () => Bank): BattleAudio {
  let chuteHeard = false
  /** Seconds until the next tick of a burning fuse, cleared the moment nothing
   * is alight so the next charge is prompt. */
  let untilTick = 0
  /** Whether a fuse was already inside its last half second last frame — the
   * click is one per charge, not one a frame. */
  let running = false

  return {
    fuseBurning(remaining, delta) {
      if (remaining.length === 0) {
        // Everything stops the frame the charge is gone. Nothing new is
        // started; what is already sounding is a fifth of a second at most,
        // which is what the rates above are for.
        untilTick = 0
        running = false
        return
      }
      untilTick -= delta
      if (untilTick <= 0) {
        untilTick = FUSE_TICK
        playCue(bank(), BATTLE_SOUNDS.fuseTimer)
      }
      // …and the TIMER RUNNING OUT, once, as the shortest fuse crosses into
      // its last half second.
      const out = Math.min(...remaining) <= FUSE_LAST
      if (out && !running) playCue(bank(), BATTLE_SOUNDS.fuseOut)
      running = out
    },
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
      // The weapon going away with the turn (lib/game/battle.ts, endTurnBeat).
      holstered: () => playCue(bank(), BATTLE_SOUNDS.holster),
      // A round ARRIVING: meat and masonry sound different, thin air is
      // nothing at all (lib/game/bullets.ts carries the verdict).
      shotLanded: ({ hit }) => {
        if (hit === 'air') return
        playCue(bank(), hit === 'flesh' ? BATTLE_SOUNDS.hitFlesh : BATTLE_SOUNDS.hitHard)
      },
      // A PIG hurting: `pig` is only on the event when the body is one — a
      // dummy takes its points in silence.
      // …with the SQUEAL, `0x59 + (rand & 1)` — the exe's one pain noise,
      // played by every damage arm at volume 70 (audio/battle.ts says where
      // all thirteen sites are). Random between the two like the exe's own,
      // which is fine out here: sound is presentation, not the battle.
      // A death adds NOTHING at the blow — the kill's hit still squeals
      // through this same event, and the words come later, with the clip.
      damaged: ({ pig }) => {
        if (pig === undefined) return
        playCue(bank(), Math.random() < 0.5 ? BATTLE_SOUNDS.squeal : BATTLE_SOUNDS.squeal2)
      },
      // The dying CLIP starting — everything at rest, the body about to go
      // down for good (lib/game/corpses.ts). The wet arm is where the drown
      // sample belongs (0x46f854 plays it exactly here, pitch 90); the dry
      // one SPEAKS instead — the death line, audio/battleSound.ts.
      dying: ({ wet }) => {
        if (wet) playCue(bank(), BATTLE_SOUNDS.drown)
      },
      // The CLICK under the foot. It is the only warning there is — a minefield
      // has nothing standing on it — and the bang is four tenths of a second
      // behind it (lib/game/mines.ts).
      mineTripped: () => playCue(bank(), BATTLE_SOUNDS.mine),
      // Every water contact splashes before the engine looks at the speed at
      // all, and then it is either a skip or a dousing.
      splashed: () => playCue(bank(), BATTLE_SOUNDS.splash),
      skimmed: () => playCue(bank(), BATTLE_SOUNDS.skim),
      doused: () => playCue(bank(), BATTLE_SOUNDS.doused),

      // ——— the frame ———
      // A hoof landing. WHEN is the clip's own key-frame event
      // (lib/game/footsteps.ts) and WHAT is the tile under it — the material
      // over the exe's own sand layer, both at the same mix (audio/battle.ts).
      stepped: ({ surface, foot, soft }) => {
        playCue(bank(), stepCue(surface, foot, soft))
        playCue(bank(), underlayCue(foot, soft))
      },

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
      menuMoved: () => playCue(bank(), BATTLE_SOUNDS.menuMove),

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
