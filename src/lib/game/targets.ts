// The training ground's dummies: the one thing on a map that is not a pig and
// can still be knocked down.
//
// In the original they are their own class — vtable 0x4bd440, constructor
// 0x48d020, the list at `[0x537df0]` — and they answer the SAME virtual slot
// a pig does, `[vtbl+0x34]`, so the melee strike hits them through exactly
// the same call it hits a body with (0x476723).
//
// **One point, and any hit at all destroys them.** The constructor reads the
// health out of a table at 0x4d6d18 indexed by the record's type, and every
// type the strike answers to — 0x43, 0x44, 0x45, 0x4b — is 128 of the engine's
// 128ths: one whole point (`weapons/melee.md`). Play said
// so before the disassembly did.
//
// Pure: records in, targets out, plus the reach test the melee shares.

import type { MapObject } from '../formats/pog'
import { caught, strikeGap } from './melee'
import type { Point } from './melee'
import { HEIGHT_SCALE } from './terrain'

/** What the training ground's dummies are called in a map's own `.MAD`. */
export const DUMMY_MODEL = 'DUMMY'

/**
 * What one is worth in health — the table at 0x4d6d18 says one point for
 * every dummy type, so the weakest thing that swings still flattens it.
 *
 * A dummy is hurt through `hurt` in lib/game/health.ts, which is the PIG's
 * rule. Two of its branches do not belong to a dummy and neither can fire
 * here: the training floor is not passed (0x48d990 has no such test — the
 * training ground kills dummies, that is what they are for), and the gib
 * needs sixty points past dead, which nothing that swings comes near.
 */
export const DUMMY_HEALTH = 1

export interface Target {
  /** The POG record's own id — what identifies its art, so a broken one can
   * be taken off the map and out of the collision world. */
  id: number
  /**
   * Where it stands, in the GAME's own space — the space a pig's node lives
   * in, and the space the blade's points come back in.
   *
   * The record's stored y is an ELEVATION, up-positive, of the model's
   * CENTRE; game space is Y-DOWN and rides `HEIGHT_SCALE`. Converting it is
   * not a detail: taking the record's y as it stands puts a dummy some three
   * thousand units from a blade that has to be within 360 of it, so every
   * swing missed on the vertical alone while the horizontal was dead on.
   * `three/props.ts` places the ART by exactly this line.
   */
  x: number
  y: number
  z: number
  health: number
}

/**
 * Every dummy a map stands on its ground.
 *
 * Matched by MODEL NAME, which is how a record is paired to its geometry
 * anyway. CAMP carries eleven, all but the first tagged with the script's own
 * field-14 value of 23 and paired off by field 15 — see below for who decides
 * which are on the ground.
 */
export function targetsOf(objects: MapObject[]): Target[] {
  return objects
    .filter((object) => object.name.toUpperCase() === DUMMY_MODEL)
    .map((object) => ({
      id: object.id,
      x: object.x,
      y: -object.y * HEIGHT_SCALE,
      z: object.z,
      health: DUMMY_HEALTH
    }))
}

/**
 * Whether a swing sampled at `blade` catches this dummy — the same box and
 * the same 67.5° cone a pig is caught by, because the exe runs the identical
 * test on it (0x4762e0 against 0x475c45, instruction for instruction).
 */
export function reached(
  blade: Point[],
  attacker: { x: number; z: number; heading: number },
  target: Target
): boolean {
  return caught(strikeGap(blade, attacker, target))
}

// **Which of them is actually THERE is the script's** — `lib/game/script.ts`,
// and the battle asks it before a swing may catch one, the same way the exe's
// strike tests the placed flag `[obj+0x30]` (0x476319). Every dummy CAMP
// carries but the first is field-14 = 23, which means the loader takes it off
// the map and something else has to put it back. The list here is still all of
// them: a target that has not arrived yet is one that is going to.
