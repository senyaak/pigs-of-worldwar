// Putting the training ground's SCRIPT where you want it — the remake's own,
// like `pow.swapMap` and `pow.give`, and for the same reason: playing the whole
// tutorial to reach the step being worked on costs a couple of minutes every
// time.
//
// It invents no mechanism. A step opens when something BREAKS, because that is
// the whole of how the chain moves (`lib/game/script.ts`): a crate signals
// nothing — field 15's high byte is its contents — so every step after the
// first is a dummy going down, its command running, and the next crate coming
// in under a canopy. Jumping to a step is therefore breaking, in the chain's
// own order, exactly what a player would have broken to get there, and then
// standing the pig on the crate that step hands over.
//
// The table below is CAMP's own file, read off the shipped .POG. Each record's
// field 14 is its opcode, field 15's low byte the label it WAITS for and the
// high byte the label it SIGNALS (a crate's high byte being its contents
// instead):
//
//   #1  DUMMY   waits 1, signals 2      — on the map from the first frame
//   #8, #11  DUMMY   wait 2, signal 3   — a guarded PAIR: both must fall
//   #12 CRATE1  waits 2, carries 7      — the RIFLE
//   #2, #9   DUMMY   wait 3, signal 4
//   #10 CRATE1  waits 3, carries 11     — the SNIPER RIFLE
//   #14, #15 DUMMY   wait 4, signal 5
//   #13 CRATE1  waits 4, carries 18 ×5  — GRENADE (crate byte 18 is skill 19)
//   #17, #24 DUMMY   wait 5, signal 6
//   #16 CRATE1  waits 5, carries 18 ×10 — the other GRENADE
//   #18 CRATE2  waits 6, health ×10     — "USE SHIFT BUTTON TO JUMP THE GAP"
//   #53 CRATE1  waits 6, carries 34     — TNT, and the second bridge with it
//   #46 STW04_D2 waits 89, signals 7    — the house's DOOR, which nothing
//                                         places: 89 is signalled by nobody, so
//                                         it stands there from the start with a
//                                         guarded command on it
//   #56 CRATE2  waits 7, health ×25     — "USE BACKSPACE BUTTON TO ENTER AND
//                                         EXIT BUILDINGS", beside the SHELTER
//   #19 CRATE1  waits 7, carries 27     — the BAZOOKA
//
// Two things the table does NOT do. It does not fell the trees, though CAMP's
// firs carry `waits 1, signals 2` and so would open step 2 as well as the first
// dummy does — the dummy is the path the tutorial means. And it does not touch
// the two crates that are on the ground from the first frame (#52 health ×20 and
// #62 health ×15, the two MINEFIELD lines): nothing has to happen for those.

import type { AirDrops } from './airDrop'
import type { Scenery } from './scenery'
import type { Target } from './targets'
import type { Point } from './pose'

/** One rung of the training ground's ladder. */
export interface TrainingStep {
  /** What the step is about, for the console line. */
  name: string
  /**
   * Every record that has to be FINISHED for this step to have opened, in the
   * order the chain finishes them. Cumulative — a step carries the whole of the
   * chain behind it, because that is what a player would have done.
   */
  finishes: number[]
  /** The crate the step hands over — where the pig is stood, so the engine's own
   * collection gives it the weapon and the sergeant says his line. Null on the
   * step that is simply the level opening. */
  crate: number | null
}

/** The first dummy, and then each pair in turn. */
const FIRST = [1]
const AFTER_FIRST = [...FIRST, 8, 11]
const AFTER_SECOND = [...AFTER_FIRST, 2, 9]
const AFTER_THIRD = [...AFTER_SECOND, 14, 15]
const AFTER_FOURTH = [...AFTER_THIRD, 17, 24]
/** …and the DOOR, which is what the TNT is for. */
const AFTER_DOOR = [...AFTER_FOURTH, 46]

/**
 * The training ground, step by step — play's own numbering:
 * 0 start, 1 bayonet, 2 rifle, 3 sniper rifle, 4 grenade, 5 the other grenade,
 * 6 the gap in the bridge, 7 TNT, 8 the shelter, 9 bazooka.
 *
 * Steps 6 and 7 share a chain position and so do 8 and 9: signal 6 puts down the
 * health crate AND the TNT, signal 7 the shelter's crate AND the bazooka. What
 * separates them is which crate the pig is stood on.
 */
export const TRAINING_STEPS: TrainingStep[] = [
  { name: 'the level opening', finishes: [], crate: null },
  { name: 'the BAYONET', finishes: [], crate: 7 },
  { name: 'the RIFLE', finishes: FIRST, crate: 12 },
  { name: 'the SNIPER RIFLE', finishes: AFTER_FIRST, crate: 10 },
  { name: 'the GRENADE ×5', finishes: AFTER_SECOND, crate: 13 },
  { name: 'the GRENADE ×10', finishes: AFTER_THIRD, crate: 16 },
  { name: 'the GAP in the bridge', finishes: AFTER_FOURTH, crate: 18 },
  { name: 'the TNT', finishes: AFTER_FOURTH, crate: 53 },
  { name: 'the SHELTER', finishes: AFTER_DOOR, crate: 56 },
  { name: 'the BAZOOKA', finishes: AFTER_DOOR, crate: 19 }
]

/** How many rungs there are — 0 to this, inclusive. */
export const LAST_TRAINING_STEP = TRAINING_STEPS.length - 1

/** A step number, held inside the ladder. */
export const clampStep = (step: number): number =>
  Math.max(0, Math.min(LAST_TRAINING_STEP, Math.round(step)))

/**
 * What the step ASKS the player to break — the first record the NEXT rung of the
 * chain needs and this one does not, so the pig can be faced at it. Null on the
 * last step, whose dummies are placed by the door and named by nothing.
 */
export function nextBreak(step: number): number | null {
  const here = new Set(TRAINING_STEPS[clampStep(step)]?.finishes ?? [])
  for (const later of TRAINING_STEPS.slice(clampStep(step) + 1)) {
    const fresh = later.finishes.find((id) => !here.has(id))
    if (fresh !== undefined) return fresh
  }
  return null
}

/** What the jump needs of the battle — the three lists a break moves. */
export interface TrainingWorld {
  /** The shared target list, spliced exactly as a blow splices it
   * (lib/game/engine.ts). */
  targets: Target[]
  scenery: Scenery
  airDrops: AirDrops
}

/**
 * Run the chain forward to `step`, and answer where its crate is standing.
 *
 * Only FORWARD: a broken dummy cannot be stood back up, so going back is the
 * caller's business and it is the level starting over (`ui/battle.ts`). A record
 * already off the target list has been finished by somebody — a real swing, or an
 * earlier jump — and is stepped over.
 */
export function advanceTraining(step: number, world: TrainingWorld): Point | null {
  const rung = TRAINING_STEPS[clampStep(step)]
  for (const id of rung.finishes) {
    const standing = world.targets.findIndex((target) => target.id === id)
    if (standing < 0) continue
    const at = world.targets[standing]
    // Everything a blow does, minus the blow: off the target list, off the map
    // and out of the collision world, and then its own command
    // (lib/game/battle.ts, `broke`). The height is the FINISHER's, because that
    // is what the exe measures a canopy drop from (0x4aa755).
    world.targets.splice(standing, 1)
    world.scenery.remove(id)
    world.scenery.advance(id, at.y)
  }
  // …and the canopies are not something to sit and watch nine of.
  world.airDrops.land()
  return rung.crate === null ? null : world.scenery.at(rung.crate)
}
