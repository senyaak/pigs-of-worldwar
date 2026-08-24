// THE BATTLE GOING ON SOMEWHERE ELSE, and the birds over it.
//
// Nine of the bank's ninety-nine were identified by ear and wired to nothing
// (docs/todo.md P2); six of them are these — `BATT_L1..3` and `BATT_S1..3`,
// "a blast with echo behind it", "rifle fire", "a burst — a machine gun",
// and three duller thumps — plus `AMB_1D`/`AMB_2D`, a falcon and another
// bird. They are the war beyond the map's edge: nothing on the field makes
// them and nothing schedules them.
//
// **WHAT THE EXE DOES WITH THEM IS NOT READ**, and this is the remake's own
// scheduling (`[CHECK — remake]`): the names, the lengths and what each one
// IS are play's ear, but how often the original fires one, at what volume,
// and whether it is per map or per mood, nobody has looked for. The knobs
// are all here and all in one place; correct them in play.
//
// The rules for it come from the samples themselves. A cue is
// fire-and-forget, so anything repeated must be repeated slower than it
// lasts — the longest of these is 4.26 s — and two of the same family must
// not land together, which is what the per-family clock buys over one roll a
// frame.

import type { Bank } from './bank'
import { playCue } from './battle'
import type { Cue } from './battle'

/** The war over the hill: a blast, rifle fire, a machine gun, three thumps.
 * Volume is the remake's own — far enough to be scenery, near enough to
 * hear under the wind. */
export const DISTANT: readonly Cue[] = [
  { sound: 'BATT_L1', volume: 30, pitch: 100, jitter: 15 },
  { sound: 'BATT_L2', volume: 28, pitch: 100, jitter: 15 },
  { sound: 'BATT_L3', volume: 28, pitch: 100, jitter: 15 },
  { sound: 'BATT_S1', volume: 25, pitch: 100, jitter: 20 },
  { sound: 'BATT_S2', volume: 25, pitch: 100, jitter: 20 },
  { sound: 'BATT_S3', volume: 25, pitch: 100, jitter: 20 }
]

/** …and the two birds, quieter still. */
export const BIRDS: readonly Cue[] = [
  { sound: 'AMB_1D', volume: 35, pitch: 100, jitter: 20 },
  { sound: 'AMB_2D', volume: 35, pitch: 100, jitter: 20 }
]

/** Seconds between one distant round and the next, and between birds — a
 * range, rolled fresh each time so nothing falls into a rhythm. Both floors
 * are well past the longest sample in their family. `[CHECK — remake]`. */
export const DISTANT_GAP: readonly [number, number] = [9, 22]
export const BIRD_GAP: readonly [number, number] = [14, 40]

export interface Ambience {
  /** One frame. `running` is false while the battle is not being played —
   * a pause, a menu — and then nothing is scheduled and nothing counts
   * down: an ambience that carried on under a pause would be the one noise
   * the pause could not stop. */
  update(delta: number, running: boolean): void
  /** Every ambient cue played, in order — a spec's only ear. */
  heard(): string[]
  reset(): void
}

/** A fresh wait out of a range. `roll` is the wall clock's — ambience is not
 * simulation and must never touch the battle's own stream (docs/ai.md). */
const waitFor = ([from, to]: readonly [number, number], roll: () => number): number =>
  from + roll() * (to - from)

export function createAmbience(bank: () => Bank, roll: () => number = Math.random): Ambience {
  const played: string[] = []
  // Both start on a full wait, so a battle does not open with a bang: the
  // drop-in has noises of its own and they are the ones to hear.
  let distant = waitFor(DISTANT_GAP, roll)
  let bird = waitFor(BIRD_GAP, roll)

  const fire = (from: readonly Cue[]): void => {
    const cue = from[Math.min(from.length - 1, Math.floor(roll() * from.length))]
    played.push(cue.sound)
    playCue(bank(), cue)
  }

  return {
    update(delta, running) {
      if (!running || delta <= 0) return
      if ((distant -= delta) <= 0) {
        distant = waitFor(DISTANT_GAP, roll)
        fire(DISTANT)
      }
      if ((bird -= delta) <= 0) {
        bird = waitFor(BIRD_GAP, roll)
        fire(BIRDS)
      }
    },
    heard: () => [...played],
    reset() {
      distant = waitFor(DISTANT_GAP, roll)
      bird = waitFor(BIRD_GAP, roll)
    }
  }
}
