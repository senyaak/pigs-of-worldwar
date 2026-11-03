// THE TRAINING GROUND, STEP BY STEP: where the battle stands in the chain, and
// going to another step (lib/game/training.ts).

import { LAST_TRAINING_STEP, TRAINING_STEPS, clampStep } from '../../../../lib/game/training'
import { isTrainingGround } from '../../../../lib/game/tutorial'
import type { UiCore } from './core'
import { start } from './open'
import { updateHud } from './paint'

/** Which step the battle is on, counting one that has been asked for and not
 * paid yet. */
export const standingStep = ({ state }: UiCore): number => state.stepWanted ?? state.trainingStep

/** Run the script to `step` and say so. The scene owns the jump itself, since
 * standing a pig somewhere is a picture as well as a position — and it refuses
 * on any map but the training ground, where there is no such script. */
export const applyStep = (core: UiCore, step: number): void => {
  const { state } = core
  if (!state.scene?.trainingStep(step)) return
  state.trainingStep = step
  console.log(`training step ${step}/${LAST_TRAINING_STEP} — ${TRAINING_STEPS[step].name}`)
  updateHud(core)
}

/**
 * **Go to one of the training ground's steps** — F11 and F12, and `pow.step(n)`
 * from the console.
 *
 * Forward is the chain running on. BACK cannot be: a dummy that has been broken
 * does not stand up again, so the level starts over and runs to the step
 * behind — which is also why the jump is remembered rather than applied, the
 * fresh battle being under its canopies for the next few seconds.
 */
export const goToStep = async (core: UiCore, want: number): Promise<boolean> => {
  const { state } = core
  if (!state.scene || !state.game) {
    console.log('no battle is up — start one from the menu first')
    return false
  }
  if (!isTrainingGround(state.map)) {
    console.log(`${state.map} is not the training ground — its steps are CAMP's`)
    return false
  }
  const step = clampStep(want)
  const back = step < standingStep(core)
  state.stepWanted = step
  // The level over again — and the want is set BEFORE the reload so a second
  // press counts from it, while `reloading` keeps the paint loop off it until
  // the battle it belongs to exists.
  if (back) {
    state.reloading = true
    const opened = await start(core, state.map)
    state.reloading = false
    if (!opened) {
      state.stepWanted = null
      return false
    }
    state.stepWanted = step
  }
  // …and a squad still coming down has nowhere to be stood: the paint loop
  // pays the want the moment the canopies are off.
  if (!state.scene.dropping()) {
    state.stepWanted = null
    applyStep(core, step)
  }
  return true
}
