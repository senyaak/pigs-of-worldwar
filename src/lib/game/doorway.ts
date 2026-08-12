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
// **AND IT DOES NOT MOVE FOR THE WHOLE CLIP** — play: "свина надо двигать после
// начала прыжка, не во время подготовки." Right, and the clip says exactly when.
// `n` above is `((s16)[+0x21A] − (s16)[+0x218]) / [+0x84]`, and those two words
// are filled by `0x4734B0`, which walks the clip's own key-frame list and copies
// the PHASE of the row carrying event **68** into `[+0x218]` and the one carrying
// **69** into `[+0x21A]`. Both of those events have an EMPTY arm in the event
// dispatcher (0x474ECB, the epilogue) — they are markers and nothing else.
//
// Clip 7's list, out of `afGetKeyFrameList` (`_d3d.dll` 0x1002C778 + clip*88, six
// (phase, id, id) rows of twelve bytes):
//
// | phase | id | |
// | ----- | -- | - |
// | 300 | 16 | bone 5 |
// | 975 | 22 | bone 5 |
// | 1800 | 43 | bone 6, on a coin flip |
// | **1950** | **68** | the glide STARTS |
// | 3300 | 3, **69** | a footstep (sound 0x2D) — and the glide ENDS |
//
// So the pig crouches for the first 48% of the clip, travels over the next 33%,
// and lands still for the last 19%.
//
// Pure, game space (Y-DOWN) like the rest of lib/game: up is −y, so the roof is
// the SMALLER number.

import type { Building } from './indoors'
import type { LocomotionState } from './locomotion'
import type { Point } from './pose'
import { PHASE_UNITS } from './melee'

/** Where clip 7's own event 68 sits — the frame the pig leaves the ground. */
export const DOOR_FROM = 1950
/** …and event 69, where it arrives. */
export const DOOR_TO = 3300

/** The step the door is adding this frame, and how much of the clip is left. */
export interface Carry {
  /** Where the pig is right now — kept here because the ground pin would
   * otherwise take the vertical back every frame. */
  at: Point
  /** Game units a second, one per axis. */
  vx: number
  vy: number
  vz: number
  /** Seconds of the WIND-UP still to burn before anything moves — clip 7's own
   * event 68 (`DOOR_FROM`). */
  hold: number
  /** Seconds of travel still to run. */
  left: number
}

/** The middle of a building's box, which is where its record stands. */
export const middleOf = (building: Building): Point => ({
  x: building.box.x,
  y: (building.box.top + building.box.bottom) / 2,
  z: building.box.z
})

/** The clip's own window, in seconds of it: what to wait out, and what to
 * travel over. */
const windowOf = (whole: number): { hold: number; span: number } => ({
  hold: (whole * DOOR_FROM) / PHASE_UNITS,
  span: (whole * (DOOR_TO - DOOR_FROM)) / PHASE_UNITS
})

const carry = (from: Point, to: Point, seconds: number): Carry => {
  const { hold, span } = windowOf(seconds)
  return {
    at: { x: from.x, y: from.y, z: from.z },
    vx: span > 0 ? (to.x - from.x) / span : 0,
    vy: span > 0 ? (to.y - from.y) / span : 0,
    vz: span > 0 ? (to.z - from.z) / span : 0,
    hold,
    left: span
  }
}

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
  // The wind-up first: nothing moves until the clip's own event 68 comes round,
  // which is what stops the pig sliding through his own crouch.
  let rest = delta
  if (one.hold > 0) {
    const held = Math.min(rest, one.hold)
    one.hold -= held
    rest -= held
  }
  const step = Math.min(rest, one.left)
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
