// THE DOOR CARRIES THE PIG — what the in/out clip actually moves, for a building
// and for a vehicle, which are two different ways out.
//
// Play: "свин прыгает на месте — должен прыгать в центр строения и выпрыгивать
// из центра строения наверх." The remake played clip 7 where the pig stood and
// then teleported it; the original glides it, and the glide is read rather than
// invented.
//
// `Pig::Attack` has four door arms (`objects/getting-inside.md` has them in a
// table): vehicle OUT 0x469BF6, vehicle IN 0x469F21, building OUT 0x46A0F6,
// building IN 0x46A228. Each writes three signed per-frame steps and the pig's
// own update adds them to the body's position on every frame the clip's cursor
// is between the two markers (0x46E148..0x46E166, then 0x46E1A1, 0x46E1E8,
// 0x46E233).
//
// **The window is the clip's own**: `0x4734B0` copies the phases of clip 7's
// events 68 and 69 (`_d3d.dll` 0x1002C778 + clip*88), and both have an empty arm
// in the event dispatcher, so they are markers and nothing else. Play: "свина надо
// двигать после начала прыжка, не во время подготовки."
//
// **Each step is a seventeenth of the way, and it is added eighteen times.** The
// divisor is the window over the clip's cursor step, truncated; the window test
// includes both ends, so one more frame lands than was divided for and the pig
// finishes a seventeenth past what it aimed at.
//
// **IN is the same for both**: all three axes step to the object's own transform
// (building 0x46A338, 0x46A392, 0x46A3EA; vehicle 0x46A031, 0x46A08B, 0x46A0E3),
// and the pig stays drawn until the clip has run. A pig in the air skips the
// crouch: the cursor is put straight on the first marker (building 0x46A24A,
// vehicle 0x469F43).
//
// **OUT skips the crouch always** (building 0x46A200, vehicle 0x469EFF), and the
// two arms differ in where they go:
//
// - A BUILDING's writes the horizontal steps as zero (0x46A150, 0x46A15E), so the
//   pig rises straight up through it.
// - A VEHICLE's computes them (0x469E3E, 0x469E4C): 1024 units from the hull
//   (0x469C9B), held inside the world's edge (0x469CF9..0x469E31).
// - Both take the height from `0x479690` at the spot they are going to (0x46A1CF,
//   0x469EC3): the ground there, raised 128 units at a time until the pig's body
//   is clear of every object.
//
// Pure, game space (Y-DOWN) like the rest of lib/game: up is −y, so the higher of
// two heights is the SMALLER number.

import type { Building } from './indoors'
import type { LocomotionState } from './locomotion'
import type { MountClass } from './mounts'
import type { Obstruction } from './obstacles'
import type { Point } from './pose'
import { PHASE_UNITS } from './melee'
import { fromExeY } from './terrain'

/** Where clip 7's own event 68 sits — the phase the pig leaves the ground. */
export const DOOR_FROM = 1950
/** …and event 69, where it arrives. */
export const DOOR_TO = 3300

/** How far clip 7's cursor moves in a frame: the library's 75 for this clip, plus
 * the one `0x440E6D` adds to it. */
const DOOR_CURSOR_STEP = 75 + 1

/** What each step divides the distance by (0x46A2DA, 0x469FD3, 0x46A158, 0x469CC4). */
export const DOOR_STEPS = Math.trunc((DOOR_TO - DOOR_FROM) / DOOR_CURSOR_STEP)
/** …and how many frames of them land, the window including both its ends. */
export const DOOR_FRAMES = DOOR_STEPS + 1

/** How far a vehicle puts the pig from where it sat (0x469C9B). */
export const VEHICLE_EXIT = 0x400
/** A spot this far out is past the world's edge (0x469CF9, 0x469D4F)… */
export const EXIT_LIMIT = 0x3000
/** …and is brought back to this (0x469D22, 0x469D79). */
export const EXIT_EDGE = 0x2ff6

/** How far `0x479690` raises the pig between tries (0x47975F), in the exe's
 * doubled heights. */
const CLEAR_STEP = fromExeY(0x80)
/** How near the ground a pig leaving a vehicle is stood on it when the clip ends
 * (0x47C94D), in the exe's doubled heights. */
const GROUND_SNAP = fromExeY(0x20)

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
   * event 68 (`DOOR_FROM`). Nothing on the way out, and nothing for a pig already
   * in the air. */
  hold: number
  /** Seconds of travel still to run. */
  left: number
}

/** The middle of a mount's box, which is where its record stands. */
export const middleOf = (building: Building): Point => ({
  x: building.box.x,
  y: (building.box.top + building.box.bottom) / 2,
  z: building.box.z
})

/**
 * @param whole the seconds clip 7 runs for from its start.
 * @param windUp whether the clip plays from its start, so the crouch is waited out.
 */
const carry = (from: Point, to: Point, whole: number, windUp: boolean): Carry => {
  const span = (whole * (DOOR_TO - DOOR_FROM)) / PHASE_UNITS
  // Past the target by the frame the divisor did not count.
  const rate = span > 0 ? DOOR_FRAMES / DOOR_STEPS / span : 0
  return {
    at: { x: from.x, y: from.y, z: from.z },
    vx: (to.x - from.x) * rate,
    vy: (to.y - from.y) * rate,
    vz: (to.z - from.z) * rate,
    hold: windUp ? (whole * DOOR_FROM) / PHASE_UNITS : 0,
    left: span
  }
}

/** IN: from where he stands to the mount's own middle, all three axes, for either
 * class. One already in the air has no crouch to wait out. */
export const carryIn = (
  building: Building,
  from: Point,
  whole: number,
  inTheAir: boolean
): Carry => carry(from, middleOf(building), whole, !inTheAir)

/** OUT: to wherever `exitTo` says, at once. */
export const carryOut = (from: Point, to: Point, whole: number): Carry =>
  carry(from, to, whole, false)

/** Held inside the world's edge, the way a vehicle's arm holds its exit. */
const insideTheWorld = (at: number, by: number): number => {
  if (at + by >= EXIT_LIMIT) return EXIT_EDGE - at
  if (at + by <= -EXIT_LIMIT) return -EXIT_EDGE - at
  return by
}

/**
 * The lowest height the pig's body fits at this spot (`0x479690`): up from the
 * ground in the exe's own steps until nothing is in the way.
 *
 * The test is the body against every object and the landscape left out of it, so
 * the first clear step over a building is the first one over its roof.
 */
export function clearHeight(ground: number, way: Obstruction, x: number, z: number): number {
  let y = ground
  while (way.blocks(x, z, y, 0)) y -= CLEAR_STEP
  return y
}

/**
 * Where a pig leaving goes on the flat.
 *
 * A building leaves it where it is. A vehicle puts it 1024 units away, a quarter
 * turn back from its own angle negated (0x469C8C), which is off its side at every
 * turn of the hull: the exe's polar helper (0x44E620) is cosine into x and sine
 * into z, and `box.turn` stands for the object's angle (see `exitHeading`).
 */
export function exitSpot(mount: Building, from: Point): { x: number; z: number } {
  if (mount.mount === 'building') return { x: from.x, z: from.z }
  const angle = -Math.PI / 2 - mount.box.turn
  return {
    x: from.x + insideTheWorld(from.x, VEHICLE_EXIT * Math.cos(angle)),
    z: from.z + insideTheWorld(from.z, VEHICLE_EXIT * Math.sin(angle))
  }
}

/**
 * Which way the pig faces coming out: both arms give it the object's own angle and
 * a quarter (building 0x46A123, vehicle 0x469C23).
 *
 * `box.turn` is that angle: a building's constructor turns its record by the yaw
 * less a quarter (0x43F3A3), which is `modelRotationY`. A vehicle's turns it by the
 * yaw negated less a quarter (0x499C76), which is the same number for the only yaw
 * any shipped vehicle is stored at, zero. The exe's pig walks along cosine-x, sine-z
 * (0x478CC6) and this engine's along sine-x, cosine-z, so an angle a is a heading of
 * π/2 − a, and the quarter cancels.
 */
export const exitHeading = (mount: Building): number => -mount.box.turn

/**
 * Where a pig leaving one starts: the mount's own middle, on the footing it had,
 * so the state the scene draws it out of is coherent from the first frame. The
 * vehicle's arm says so outright for the height (0x469C7B).
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
 * The height the clip's end leaves him at. A vehicle's arm stands him on the
 * ground if he has come within reach of it or gone under it, which the seventeenth
 * past makes the ordinary case (0x47C94D..0x47C9C1). A building's has no such test.
 */
export const heightOnLeaving = (mount: MountClass, ground: number, y: number): number =>
  mount === 'vehicle' && y > ground - GROUND_SNAP ? ground : y

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
