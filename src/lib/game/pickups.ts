// The crates a pig collects by walking into them.
//
// A POG record hands something over when field 14 is 19 (lib/formats/pog.ts).
// Field 15's high byte says WHAT — 0xFF is a health crate, anything else is
// a crate value that the loader turns into a skill id through the table at
// 0x4D9DC8 (`movsx edi,[eax+4D9DC8h]` at 0x4A5B7A, lib/game/skills.ts) —
// and field 16 is the amount.
//
// What each kind does is `Pig::GiveSkill` at 0x465425:
//
// - a SKILL crate adds its amount to the pig's inventory, or takes a new
//   slot (lib/game/inventory.ts);
// - a HEALTH crate hands the amount straight to the pig — the exe shifts it
//   left by 7 into its own internal health units and only rolls a random
//   10/20/50 when the pickup carries no amount at all, which is the case
//   for one dropped by a dying pig rather than placed on the map;
// - and while the TRAINING flag is up (0x5207A8) two things change: every
//   skill arrives UNLIMITED (0x465625) and every health crate is worth 50
//   (0x46597B), whatever the map said.
//
// Pure: objects in, pickups out, plus the reach test.

import { PIG_RADIUS, boxOf, isPickup, penetrates } from './obstacles'
import type { Obstacle } from './obstacles'
import type { MapObject } from '../formats/pog'
import { skillFromCrate } from './skills'
import { UNLIMITED } from './inventory'

/** What the training ground hands over for a health crate. */
export const TRAINING_HEALTH = 50

/** The most health a pig can be topped up to. */
export const FULL_HEALTH = 100

export interface Pickup {
  /** The POG record's own 1-based id — what identifies its art. */
  id: number
  x: number
  z: number
  /** Skill id, or null on a health crate. */
  skill: number | null
  /** Rounds of that skill, or health points. */
  amount: number
  /** The crate's own box, out of its record. A pickup is not IN the
   * collision world (lib/game/obstacles.ts), so this is only ever what it is
   * collected by — the pig walks through the box and takes it. */
  body: Obstacle
}

/** Every crate on a map that carries something. */
export function pickupsOf(objects: MapObject[]): Pickup[] {
  const pickups: Pickup[] = []
  for (const object of objects) {
    if (!isPickup(object) || !object.contents) continue
    const crateByte = object.contents.weapon
    pickups.push({
      id: object.id,
      x: object.x,
      z: object.z,
      skill: crateByte === null ? null : skillFromCrate(crateByte),
      amount: object.contents.amount,
      body: boxOf(object)
    })
  }
  return pickups
}

/**
 * Whether a pig standing here has walked into this crate: its body against
 * the crate's own box, which it is free to be inside of because a pickup is
 * kept out of the collision world.
 */
export function reached(pickup: Pickup, x: number, z: number): boolean {
  return penetrates(pickup.body, x, z, PIG_RADIUS)
}

/**
 * What a pickup is worth to the pig that reached it — the amounts the
 * training ground overrides included.
 */
export function worthOf(pickup: Pickup, training: boolean): number {
  if (pickup.skill === null) return training ? TRAINING_HEALTH : pickup.amount
  return training ? UNLIMITED : pickup.amount
}
