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
// 128ths: one whole point (`../../../pigs-disasm/weapons/melee.md`). Play said
// so before the disassembly did.
//
// Pure: records in, targets out, plus the reach test the melee shares.

import type { MapObject } from '../formats/pog'
import { caught, strikeGap } from './melee'
import type { Point } from './melee'

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
  /** Where it stands, game space. `y` is the record's own elevation, which
   * is the CENTRE of the model (lib/formats/pog.ts). */
  x: number
  y: number
  z: number
  health: number
}

/**
 * Every dummy a map stands on its ground.
 *
 * Matched by MODEL NAME, which is how a record is paired to its geometry
 * anyway. CAMP carries eight, tagged with the script's own field-14 value of
 * 23 and paired off by field 15 into four groups — and WHICH of them the
 * original has live at any moment is script state the remake does not have
 * (see below), so all of them stand as targets here.
 */
export function targetsOf(objects: MapObject[]): Target[] {
  return objects
    .filter((object) => object.name.toUpperCase() === DUMMY_MODEL)
    .map((object) => ({
      id: object.id,
      x: object.x,
      y: object.y,
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

// **All eight are live, and that is the remake's own.** The exe does not walk
// a list here: 0x4762e0 takes the single object at `[0x537df0]` and checks its
// type, so seven of CAMP's eight are not the one being struck at any moment.
// What moves that pointer is the map SCRIPT — the same script that raises the
// tutorial's second bridge and places its crates, and it is not decoded. Until
// it is, a dummy you can walk up to is a dummy you can hit.
//
// The other half of the same gap: play says knocking the first one down drops
// a crate in by parachute, and the tutorial's own step list agrees — a step
// ends on "killing the dummy, picking up the crate, or reaching somewhere"
// (`lib/game/tutorial.ts`). That drop IS the script, so it is not here either.
