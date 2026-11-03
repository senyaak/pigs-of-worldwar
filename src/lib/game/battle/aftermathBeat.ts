// THE BEAT AFTER A BLOW: the clock stopped, the camera on the spot, and the
// script step a broken thing owes paid once everything it set going has
// stopped (lib/game/aftermath.ts).

import { advanceAftermath, watchAftermath } from '../aftermath'
import type { Pig } from '../game'
import { ANIM } from '../locomotion'
import type { BattleCore } from './core'
import { flyOn } from './flight'
import { settling } from './waits'

/**
 * Pay it, once everything the break set going has stopped.
 *
 * ONE THING AT A TIME. The script's next step waits for the thing that
 * triggered it to finish — play's rule for the whole game, "ждёшь конца одной
 * анимации и включаешь другую". `effects.busy()`, not `smoke() === 0`: the
 * break effect's burst does not fire until its third frame, so counting puffs
 * said "finished" on the very frame the dummy broke.
 */
export const payScriptStep = (core: BattleCore): void => {
  const { game, scenery, anim, swings, effects, state } = core
  if (!state.pending) return
  if (swings.running() || anim.animating(game.currentPig) || effects.busy()) return
  scenery.advance(state.pending.id, state.pending.y)
  state.pending = null
}

/** The beat after a blow, while it runs; true while it has the frame. */
export const aftermathBeat = (core: BattleCore, acting: Pig, delta: number): boolean => {
  const {
    anim,
    shots,
    grenades,
    swings,
    effects,
    numbers,
    corpses,
    airDrops,
    emit,
    attack,
    state
  } = core
  // …but nothing is answered at all while the blow is being shown. The jump
  // key is the exception, and it is the same exception the level's opening
  // drop makes: it cuts the canopy and brings the crate down now.
  if (state.aftermath) {
    if (state.jumpRequested) {
      airDrops.cut()
      emit({ kind: 'canopiesCut' })
    }
    state.jumpRequested = false
    // **AND SO IS THE HAND-DETONATOR, for the same reason the ONE BLOW A TURN
    // guard makes room for it below: setting off what is already in the air is
    // the end of the first blow rather than a second one.** Play, of the
    // cluster: "разлётные сами только могут взорваться по времени." The five
    // bomblets are born INSIDE this beat — the canister's own burst is what
    // opens it — and `settling()` counts them, so the wait cannot end while
    // they fly and this line ate every press until the last fuse had run out
    // on its own. The gate is `thrown()`, not the beat: a press with nothing
    // live is still swallowed, which is what the beat is for.
    // `e2e/002/cluster.spec.ts` fails on the old line.
    if (grenades.thrown() > 0) attack.begin(acting, state.holding)
    else attack.swallow()
    // The world keeps going — the crate has to reach the ground for the wait
    // to end, and the smoke off the thing that broke is what is being
    // watched.
    effects.update(delta)
    shots.update(delta)
    grenades.update(delta)
    airDrops.update(delta)
    numbers.update(delta)
    // …AND THE BLOW ITSELF. The wait used to freeze the pig and put IDLE on
    // it on the very frame the blow connected, which cut off the animation it
    // was gating everything else on: a bayonet strikes on frames 11-14 of a
    // 36-frame clip. The pig plays out what it was doing INSIDE the wait —
    // that is what the wait is for.
    swings.update(delta, acting)
    // …and if the blow THREW it, the flight is one of the things it plays out.
    // Frozen here, a pig hung in the air for the length of the beat and only
    // then moved, which is what play watched: "сначала взрыв… а потом толчёк."
    flyOn(core, delta)
    // The shot that caused all this ends here rather than a frame late.
    attack.settled()
    // …and the step it owes, now that everything it was waiting on has had
    // this frame (`payScriptStep` is also called before the branches, for the
    // beats that never get here).
    payScriptStep(core)
    // The world, plus the three things only this wait knows about: the script
    // step it owes, the blow's own animation, and the pig playing it out. A pig
    // swimming for the shore is on the exe's list too and is not modelled —
    // nothing knocks one into the water yet.
    const held = state.pending !== null || swings.running() || anim.animating(acting) || settling(core)
    if (advanceAftermath(state.aftermath, delta, held)) {
      // **THE CAMERA NEVER GOES BACK TO THE SHOOTER.** The exe's wait exits
      // straight into WALK AWAY (0x495316 → 0x494570), and play remembers no
      // return: "возврата к свинье в оригинале вообще нет". So when the
      // weapon SPENT the turn, the spot stays the camera's through the beat
      // at the end of it — the aftermath is left standing for the view and
      // the next pig's `focus` is what clears it. Only a blow that did NOT
      // end the turn (a mine trodden mid-walk, a training break) hands the
      // camera back, because the same pig is about to be driven again.
      if (!state.spent) {
        state.aftermath = null
        emit({ kind: 'cameraReset' })
      }
    } else {
      // Follow the crate down; a spot with nothing coming stays the spot.
      const crate = airDrops.watching()
      if (crate) watchAftermath(state.aftermath, crate)
      // …and a body through its death: a wet one SINKS while its clip
      // plays, and mode 16 watches the pig, not the spot it was on.
      const body = corpses.watching()
      if (body) watchAftermath(state.aftermath, body)
      // Standing about is only what a pig does once it has finished. Asking
      // for a clip is what CANCELS a committed one, so this line
      // unconditionally was the interruption.
      // …unless it is in the AIR, where the flight owns what it wears.
      if (!swings.swinging() && !anim.animating(acting) && state.loco.airborne === null) {
        // …and the ACTING pig knocked into the water inside this very wait
        // swims through it: stamping IDLE stood it on the surface for the
        // whole beat (the landing set `loco.swimming`, lib/game/locomotion.ts).
        anim.setClip(acting, state.loco.swimming ? ANIM.SWIM : ANIM.IDLE)
      }
      return true
    }
  }
  return false
}
