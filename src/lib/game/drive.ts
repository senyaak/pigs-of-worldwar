// DRIVING — moving the thing the pig is sitting in.
//
// **This is the remake's, and the search that says so is worth keeping**,
// because the next person to look will otherwise repeat it. The exe drives
// vehicles — the manual is explicit ("be careful who you drive into when you
// are in a tank", "driving them all across the map in one go") — and the
// machinery is half visible:
//
// - `[veh+0xC0]` is a MOTION REGISTER. `Vehicle::ChangeAim` ORs the turret's
//   two bits into it (0x10 up, 0x20 down) and 0x49B9E0 ORs a direction's two
//   (8 forward, 4 back) off a signed argument, parking the magnitude at
//   `[+0xF0]` or `[+0xEC]`.
// - The RAM refuses outright unless that register is non-zero (0x478092), so a
//   parked vehicle touches nobody — which makes the register the exe's own
//   definition of "is it moving".
// - `0x49ED70` displaces the hull `arg * 2` along its heading through the
//   standard 0x44E620.
//
// What was NOT found, after sweeping every call from the pig's region into the
// vehicle class, every non-pig caller of it, every read and write of `[+0xC0]`,
// `[+0xEC]` and `[+0xF0]`, and the whole riding arm of the pig's state machine
// (0x46E112 — which turns out to be the door glide and the animation player,
// and nothing else): **where the input sets bits 4 and 8.** `0x49ED70` has no
// caller either. `objects/vehicles.md` records the negative in full.
//
// So the SHAPE here is the manual's and the numbers are ours. Speed especially:
// nothing in the exe states one, and 0x49ED70's `arg * 2` is a scale without a
// magnitude behind it. `[CHECK — remake]` on every constant in this file.
//
// Pure, seconds, game space, Y-down — and it knows no pig, the same way
// `movement.ts` does not.

import { WALK_SPEED, step } from './movement'
import { TURN_SPEED } from './locomotion'
import type { TerrainQuery } from './terrain'

/**
 * **How much faster than a pig a vehicle is.** `[CHECK — remake]`.
 *
 * A tank that moved at a walk would be pointless and one that crossed the map
 * in a turn would be the whole game, so this is the first honest guess between
 * them: half again a pig's walk. The manual's own claim for the carriers —
 * "picking up a group of your chums and driving them all across the map in one
 * go" — argues for the upper end, and play is what settles it.
 */
export const DRIVE_SCALE = 1.5

/** …and how much slower it turns. Tracks are not trotters. */
export const DRIVE_TURN_SCALE = 0.6

export const DRIVE_SPEED = WALK_SPEED * DRIVE_SCALE
export const DRIVE_TURN = TURN_SPEED * DRIVE_TURN_SCALE

/** Where a vehicle is and which way it points. Game space. */
export interface DriveState {
  x: number
  z: number
  /** Radians; forward is `(sin h, cos h)`, as everywhere else. */
  heading: number
}

/** The keys, exactly as the walk takes them: -1, 0 or +1 on each axis. */
export interface DriveIntent {
  walk: number
  turn: number
}

export interface DriveWorld {
  query: TerrainQuery
  /**
   * Whether the hull cannot be at (x, z) — the collision world, minus the
   * vehicle's own box, which the caller has taken out while it is driven.
   */
  blocked(x: number, z: number): boolean
}

/** What one frame of driving came to. */
export interface DriveResult {
  /** True when the hull actually went somewhere. */
  moved: boolean
  /** …and whether it is now over water, which is the manual's one warning
   * about where a vehicle may go. Reported, not enforced: which kinds are
   * amphibious is only their NAMES saying so (lib/game/vehicles.ts). */
  wet: boolean
}

/**
 * One frame. Mutates `state` in place, the way `updateLocomotion` does.
 *
 * The turn happens first and then the step, so a vehicle drives where the
 * player has just pointed it rather than a frame behind — the same order the
 * pig's own frame uses.
 *
 * **A vehicle does not drive off a cliff.** `step` reports `falling` when the
 * ground gives way ahead, and a pig hands that to ballistics; here it is a
 * refusal. A tank tipping into a ravine is a physics problem this engine has
 * no answer for, and standing at the lip is the better wrong answer.
 */
export function driveStep(
  state: DriveState,
  world: DriveWorld,
  intent: DriveIntent,
  delta: number
): DriveResult {
  state.heading += intent.turn * DRIVE_TURN * delta
  const wetNow = (): boolean => world.query.isWater(state.x, state.z)
  if (intent.walk === 0) return { moved: false, wet: wetNow() }

  const distance = intent.walk * DRIVE_SPEED * delta
  const gone = step(world.query, state.x, state.z, state.heading, distance)
  // `limit` is the world's edge and `falling` a drop — neither moves the hull.
  if (gone.outcome !== 'moved') return { moved: false, wet: wetNow() }
  if (world.blocked(gone.x, gone.z)) return { moved: false, wet: wetNow() }
  state.x = gone.x
  state.z = gone.z
  return { moved: true, wet: wetNow() }
}

/**
 * The BOX yaw that matches a heading.
 *
 * `boxOf` stores the model's own turn, and a model's +x points along
 * `(cos turn, −sin turn)` where this engine's forward is `(sin h, cos h)`
 * (lib/game/obstacles.ts). Solving the two gives a quarter turn between them,
 * and a hull that is longer than it is wide has to carry it or its collision
 * box would sit across the way it is driving.
 */
export const hullTurn = (heading: number): number => heading - Math.PI / 2
