// THE DOOR CARRIES THE PIG — what the in/out clip actually moves.
//
// Play: "свин прыгает на месте — должен прыгать в центр строения и выпрыгивать
// из центра строения наверх." The remake played clip 7 where the pig stood and
// then teleported it; the original glides it, and the glide is read rather than
// invented.
//
// `Pig::Attack`'s building arm sets three signed words — `[pig+0x210]`,
// `[pig+0x212]`, `[pig+0x214]` — and the pig's own per-frame update adds each to
// the body's position, every frame, for as long as the clip runs (0x46e1a1,
// 0x46e1e8, 0x46e233). Each is `(target − here) / n`, where n is the same count
// both directions divide by (`((s16)[+0x21A] − (s16)[+0x218]) / [+0x84]`).
//
// **Going IN, all three axes step** to the building's own transform, which is
// the record's position — the thing 0x469fde copies (0x46a032, 0x46a08c,
// 0x46a0e4). The pig stays DRAWN for the whole of it; only the arm's tail hides
// him.
//
// **Coming OUT, x and z are written as ZERO** — `mov [esi+210h],bp` and
// `mov [esi+214h],bp` with `ebp` nil (0x46a150, 0x46a15e) — and only the middle
// word, the vertical, is given a step (0x46a1eb). So the way out of a building
// is straight up through it and nowhere else, which is what play describes.
//
// The one number that is NOT read is how far up. The exe's vertical step is a
// difference the stack-shuffling around 0x479690 does not give up cleanly, so
// the remake takes the building's own ROOF — the top of the box the record
// describes — because it is the model's own number rather than a pick, and
// because "out through the top" is the only thing a zeroed x and z can mean.
//
// Pure, game space (Y-DOWN) like the rest of lib/game: up is −y, so the roof is
// the SMALLER number.

import type { Building } from './indoors'
import type { LocomotionState } from './locomotion'
import type { Point } from './pose'

/** The step the door is adding this frame, and how much of the clip is left. */
export interface Carry {
  /** Where the pig is right now — kept here because the ground pin would
   * otherwise take the vertical back every frame. */
  at: Point
  /** Game units a second, one per axis. */
  vx: number
  vy: number
  vz: number
  /** Seconds of the clip still to run. */
  left: number
}

/** The middle of a building's box, which is where its record stands. */
export const middleOf = (building: Building): Point => ({
  x: building.box.x,
  y: (building.box.top + building.box.bottom) / 2,
  z: building.box.z
})

const carry = (from: Point, to: Point, seconds: number): Carry => ({
  at: { x: from.x, y: from.y, z: from.z },
  vx: seconds > 0 ? (to.x - from.x) / seconds : 0,
  vy: seconds > 0 ? (to.y - from.y) / seconds : 0,
  vz: seconds > 0 ? (to.z - from.z) / seconds : 0,
  left: seconds
})

/** IN: from where he stands to the building's own middle, all three axes. */
export const carryIn = (building: Building, from: Point, seconds: number): Carry =>
  carry(from, middleOf(building), seconds)

/**
 * OUT: straight up, and only up.
 *
 * The horizontal steps are the exe's own zeroes rather than an arithmetic
 * accident — it writes them, it does not compute them — so they are written
 * here too, by giving the target the same x and z.
 */
export const carryOut = (building: Building, from: Point, seconds: number): Carry =>
  carry(from, { x: from.x, y: building.box.top, z: from.z }, seconds)

/**
 * Where a pig leaving one starts: the building's own middle, on the footing it
 * had, so the state the scene draws it out of is coherent from the first frame.
 */
export function doorwayStart(building: Building, footing: LocomotionState): LocomotionState {
  const middle = middleOf(building)
  footing.x = middle.x
  footing.y = middle.y
  footing.z = middle.z
  footing.airborne = null
  return footing
}

/**
 * One frame of it. Moves the carry along and writes it onto the footing, which
 * is what the scene draws — the ground pin has already had its say this frame
 * and the door overrules it, exactly as the exe's own add does.
 *
 * Returns false once the clip's worth of it has run.
 */
export function advanceCarry(one: Carry, footing: LocomotionState, delta: number): boolean {
  const step = Math.min(delta, one.left)
  one.at.x += one.vx * step
  one.at.y += one.vy * step
  one.at.z += one.vz * step
  one.left -= step
  footing.x = one.at.x
  footing.y = one.at.y
  footing.z = one.at.z
  // Nothing falls while the door has hold of it.
  footing.airborne = null
  return one.left > 0
}
