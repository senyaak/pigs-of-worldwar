// A MOUNT — the one question both halves of "getting inside" answer the same
// way, asked without caring which half it is.
//
// The exe keeps two classes and one door. A BUILDING is body type 0x1359 and a
// VEHICLE 0x1358; the entry code tells them apart with a single compare and
// then treats the pig identically — hidden, stilled, hung off an occupant list
// — differing only in the state it writes (4 against 3) and which class's
// `AddOccupant` it calls. Everything the RULES want to know afterwards is the
// same shape from both sides: how many fit, what it offers to do, how far its
// gun points, and what a turn inside is worth.
//
// So `indoors.ts` holds occupancy for both and asks here, and this file is
// only the dispatch. The tables themselves stay where they were read:
// `buildings.ts` and `vehicles.ts`.

import { barrelRange, buildingHeal, buildingRoom, buildingSkills } from './buildings'
import type { BuildingHeal } from './buildings'
import { turretRange, vehicleRoom, vehicleSkills } from './vehicles'

/** Which of the exe's two classes a mount is. */
export type MountClass = 'building' | 'vehicle'

/** How many pigs it holds. */
export const mountRoom = (mount: MountClass, kind: number): number =>
  mount === 'vehicle' ? vehicleRoom(kind) : buildingRoom(kind)

/** What the skill menu offers whoever is inside it. */
export const mountSkills = (mount: MountClass, kind: number): number[] =>
  mount === 'vehicle' ? vehicleSkills(kind) : buildingSkills(kind)

/** Whether it puts a weapon in their trotters at all. */
export const mountArmed = (mount: MountClass, kind: number): boolean =>
  mountSkills(mount, kind).length > 0

/**
 * How far its own gun elevates, or null where it has none.
 *
 * The two ranges are read from two mirrored routines — `Building::ChangeAim`
 * (0x4401d0) and `Vehicle::ChangeAim` (0x49b6e0) — which `Pig::ChangeAimAngle`
 * picks between on the pig's state, 4 or 3 (0x46a8a4). **A turret reaches
 * twice as high as a pillbox's barrel and neither can look down**, except the
 * pillbox, which is the only mount in the game with a negative minimum.
 */
export const mountBarrel = (
  mount: MountClass,
  kind: number
): readonly [number, number] | null =>
  mount === 'vehicle' ? turretRange(kind) : barrelRange(kind)

/**
 * What a turn spent inside is worth in health.
 *
 * Only a building ever pays: the heal is `Pig::PerTurn`'s arm for state **4**
 * alone (0x4703b2), so a pig sitting in a vehicle heals nothing whatever the
 * vehicle is. `[exe]`, and it costs nothing to state — a table of six against
 * a constant.
 */
export const mountHeal = (mount: MountClass, kind: number): BuildingHeal =>
  mount === 'vehicle' ? 'none' : buildingHeal(kind)
