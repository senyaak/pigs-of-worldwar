// WHERE THINGS ARE DRAWN between two engine steps: the acting pig's stances,
// the tween over everything else that moves, and the snapshot's own pigs.

import type { Point } from '../../../../lib/game/pose'
import type { PigShot } from '../../../../lib/game/snapshot'
import type { Soldier } from '../squad'
import type { SceneCore } from './core'

export const pigShot = ({ state }: SceneCore, id: number): PigShot | undefined => state.now.pigs.find((one) => one.id === id)

/** Where the acting pig stood at a step boundary — the two the picture is
 * drawn between. */
export interface Stance {
  x: number
  y: number
  z: number
  heading: number
  /** Whose stance it is: the battle hands the turn on inside a step, and one
   * pig's place is not the next one's to be drawn between. */
  pig: number
  /** The engine's own word on whether it is in the water (three/chase.ts). */
  swimming: boolean
}
export const stanceNow = ({ engine }: Pick<SceneCore, 'engine'>): Stance => {
  const at = engine.snapshot()
  const { x, y, z, heading, swimming } = at.loco
  return { x, y, z, heading, swimming, pig: at.acting }
}
/** A jump in the state is not a movement to draw: a new turn, a warp, the
 * moment the squad lands. Both ends become the same place, so nothing is
 * tweened across the map. */
export const settle = (core: SceneCore): void => {
  const { state } = core
  state.after = stanceNow(core)
  state.before = state.after
}

export const marks = (core: SceneCore): [unknown, Point][] => {
  const { engine } = core
  const at = engine.snapshot()
  const out: [unknown, Point][] = []
  for (const shot of at.bullets) out.push([`shot:${shot.id}`, shot])
  for (const lob of at.lobs) out.push([`lob:${lob.id}`, lob])
  // A crate only moves DOWN, and `raise` is the only thing that reads it.
  for (const one of at.crates) out.push([`crate:${one.id}`, { x: 0, y: one.y, z: 0 }])
  for (const one of at.pigs) if (one.arriving) out.push([`drop:${one.id}`, one])
  // There is only ever one beat, so it needs no number of its own.
  if (at.aftermath) out.push(['aftermath', at.aftermath.at])
  return out
}

/** Where to DRAW something the engine moves. */
export const drawnAt = ({ engine, tween }: SceneCore, key: unknown, now: Point): Point => tween.at(key, now, engine.alpha())

/**
 * Where a pig is being DRAWN — which is what the camera frames, never the
 * engine's own numbers.
 *
 * Three ways a pig gets a position, and each has its own history: one still
 * on a canopy is coming down under it, the acting one is walking, and
 * anything else is standing exactly where it stands.
 */
export const drawnStance = (core: SceneCore, soldier: Soldier): Omit<Stance, 'pig'> => {
  const { engine, state } = core
  // Only the acting pig is DRIVEN, so only it has a locomotion state to ask
  // whether it is in the water; nothing else is followed closely enough for
  // the swim framing to matter (three/chase.ts).
  const swimming = soldier.pig.id === state.now.acting && state.now.loco.swimming
  const shot = pigShot(core, soldier.pig.id)
  if (shot?.arriving) {
    const at = drawnAt(core, `drop:${shot.id}`, shot)
    return { ...at, heading: shot.heading, swimming }
  }
  if (soldier.pig.id === state.now.acting) return stanceAt(core, engine.alpha())
  const at = shot ?? soldier.pig.position
  return { x: at.x, y: at.y, z: at.z, heading: shot?.heading ?? soldier.pig.heading, swimming }
}

/** Where to draw it, `alpha` of the way from the one to the other. Heading
 * takes the SHORT way round, or a pig crossing north spins the long way. */
export const stanceAt = (core: SceneCore, alpha: number): Omit<Stance, 'pig'> => {
  const { state } = core
  const turn = ((state.after.heading - state.before.heading + Math.PI) % (2 * Math.PI)) - Math.PI
  return {
    x: state.before.x + (state.after.x - state.before.x) * alpha,
    y: state.before.y + (state.after.y - state.before.y) * alpha,
    z: state.before.z + (state.after.z - state.before.z) * alpha,
    heading: state.before.heading + turn * alpha,
    // Not a thing to interpolate: it is where the pig ENDED the step.
    swimming: state.after.swimming
  }
}
