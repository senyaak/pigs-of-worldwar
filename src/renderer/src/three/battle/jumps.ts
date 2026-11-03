// PUTTING THE BATTLE SOMEWHERE: focus on a pig, warp the acting one, and jump
// the training ground to one of its steps.

import type { Pig } from '../../../../lib/game/game'
import { advanceTraining, nextBreak } from '../../../../lib/game/training'
import type { SceneCore } from './core'
import { settle } from './drawn'
import { watch } from './watch'

/** Take the battle to a pig, and the camera and marker with it. */
export const focus = (core: SceneCore, pig: Pig): void => {
  const { query, sounds, squad, marker, battle } = core
  battle.focus(pig)
  // A different pig is not a movement: both ends of the tween become where
  // this one is standing.
  settle(core)
  sounds.reset()
  marker.moveTo(pig.position.x, query.height(pig.position.x, pig.position.z), pig.position.z)
  const soldier = squad.of(pig.id)
  if (soldier) watch(core, soldier, null)
}

/**
 * Put the acting pig somewhere, and the picture with it — the debug surface's
 * ONE write (three/debug.ts), and the training jump below uses the same one.
 */
export const warp = (core: SceneCore, x: number, z: number, heading: number): void => {
  const { game, squad, battle } = core
  battle.warp(x, z, heading)
  settle(core)
  const pig = game.currentPig
  squad.of(pig.id)?.place(pig.position.x, pig.position.y, pig.position.z, pig.heading)
}

/**
 * **Jump the training ground to one of its steps** — the console's and F11/F12's
 * (ui/battle.ts). The chain itself is `lib/game/training.ts`; what belongs here
 * is the standing and the collecting, since a warp is a picture as well as a
 * position.
 *
 * The crate is COLLECTED rather than conjured: the pig is stood on it and
 * `Scenery.collect` is the very call the frame makes, so the inventory, the
 * briefing bar and the sergeant's line all come out of the ordinary path. What
 * IS the remake's own is putting the thing in the pig's hands afterwards —
 * the original wants the skill menu for that, and a jump exists to skip the
 * walking, not to make a point.
 */
export const trainingStep = (core: SceneCore, step: number): boolean => {
  const { game, onGameChanged, engine, scenery, airDrops } = core
  if (!engine.training) return false
  const at = advanceTraining(step, { targets: engine.targets, scenery, airDrops })
  if (!at) return true
  // Facing whatever the step asks to be broken next, so the jump lands looking
  // at the job rather than at the sky.
  const target = engine.targets.find((one) => one.id === nextBreak(step))
  const heading = target
    ? Math.atan2(target.x - at.x, target.z - at.z)
    : game.currentPig.heading
  warp(core, at.x, at.z, heading)
  // Whatever that just handed over goes into the hands — a health crate hands
  // over nothing to hold, and leaves them empty. **It is what `collect`
  // ANSWERS, not the last slot of the inventory**: that guess held only while
  // a pig carried nothing but the crate, and every pig has spawned with its
  // CLASS KIT since `a7412e9`. A grunt's ends in three grenades and `give`
  // merges rather than appends, so the jump to step 1 — the BAYONET — put a
  // grenade in the trainee's hands and `e2e/002/trainingStep.spec.ts` had
  // been saying so ever since.
  game.currentPig.holding = scenery.collect(game.currentPig)
  onGameChanged()
  return true
}
