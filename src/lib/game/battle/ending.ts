// THE MISSION IS OVER: the exe's mode 2, END OF GAME (lib/game/endOfGame.ts) —
// the tour of the survivors, and who it may look at.

import { advanceEndOfGame } from '../endOfGame'
import { isDead } from '../health'
import { ANIM } from '../locomotion'
import type { BattleCore } from './core'
import { flyOn } from './flight'

/**
 * Who the ending's camera may look at: alive, and not shut inside a building —
 * the exe skips exactly those two (`[pig+0x2EC]` of 1 or 8, 0x490F46), and a
 * pig in a shelter is not drawn at all (lib/game/indoors.ts).
 */
export const watchable = ({ indoors, everyone }: BattleCore): number[] =>
  everyone()
    .filter((pig) => !isDead(pig) && !indoors.inside(pig))
    .map((pig) => pig.id)

/** The END OF GAME beat; true once the mission is over, every frame from then. */
export const endingBeat = (core: BattleCore, delta: number): boolean => {
  const { game, indoors, anim, tumbles, emit, everyone, attack, state } = core
  // **THE MISSION IS OVER**, and this beat is the last thing the battle does:
  // the exe's mode 2, END OF GAME (lib/game/endOfGame.ts). The clock does not
  // run, nothing is driven, and the camera walks the survivors one every two
  // seconds until a key — or twenty — puts the battle away.
  if (state.ending) {
    state.jumpRequested = false
    state.doorRequested = false
    attack.swallow()
    // The LAST death's blast may have thrown the acting pig — the flight
    // owns its position for as long as it lasts, tour or no tour. Everyone
    // else's air is `tumbles`, which the engine steps regardless; the
    // acting pig's lives on `loco` and only `flyOn` moves it. Without this
    // the velocity was written and never read: the pig that killed the
    // last enemy point-blank stood still through its own knockback (play,
    // 2026-08-28).
    flyOn(core, delta)
    // **THE HANDS ARE EMPTY AND THE TOUR CHEERS.** Play, in two rounds:
    // first "при выигрыше остаётся оружие в руках свина, он не танцует" —
    // then "должно идти по свинам и каждого показывать как он радуется".
    // The exe's mode 2 arm plays no clip and touches no weapon (0x490E7E
    // is a camera, a countdown and the way out), so the staging is the
    // remake's own: the pig the camera ARRIVES at plays one of the three
    // real celebration clips ONCE (41..43, lib/game/locomotion.ts —
    // rotated so neighbours differ), everyone else stands easy, and a
    // loss stands everyone easy throughout.
    for (const pig of everyone()) {
      if (isDead(pig) || indoors.inside(pig)) continue
      // A pig still IN THE AIR is not re-dressed — the same guard the
      // other two whole-squad dressing loops carry. The flight clip is
      // announced ONCE, at launch (lib/game/tumble.ts emits on change),
      // so one IDLE stamp here held for the whole arc and the thrown pig
      // flew in its standing pose (play: "летел в режиме стояния будто").
      if (tumbles.has(pig)) continue
      if (pig === game.currentPig && state.loco.airborne !== null) continue
      pig.holding = null
      // …and the AIMING POSE goes with the weapon. Play: "анимация победы
      // играется в позе вытащенного оружия — все оружия надо убрать у всех
      // свинов." The pose is the second animation channel (lib/game/anim.ts),
      // so putting the dance on the first one leaves the arms where the rifle
      // was until this clears it.
      anim.overlay(pig, -1, 0)
      if (state.ending.won && pig.id === state.ending.watching && !state.cheeredPigs.has(pig.id)) {
        state.cheeredPigs.add(pig.id)
        anim.playOnce(pig, ANIM.CELEBRATIONS[state.cheeredPigs.size % ANIM.CELEBRATIONS.length])
      } else if (!anim.animating(pig)) {
        // A cheer plays OUT — setClip every frame would wipe it (the
        // idle loop's own rule, further down).
        anim.setClip(pig, ANIM.IDLE)
      }
    }
    state.holding = null
    const leave = state.leaveRequested
    state.leaveRequested = false
    // Everything still running runs on: the engine steps it after this call,
    // which is what lets the last crate finish coming down behind the tour.
    if (advanceEndOfGame(state.ending, delta, watchable(core), leave) && !state.ended) {
      state.ended = true
      emit({ kind: 'missionEnded' })
    }
    return true
  }
  return false
}
