// Everything on a map that is not a pig and can still be knocked down: the
// training ground's dummies, and the whole of a map's SCENERY beside them.
//
// In the original they are all ONE class — vtable 0x4bd440, constructor
// 0x48d000, the list at `[0x537df0]` — and they answer the SAME virtual slot a
// pig does, `[vtbl+0x34]`, so the melee strike hits them through exactly the
// same call it hits a body with (0x476723).
//
// **A dummy is not a special case; it is the cheapest row of a table.** The
// constructor reads the health out of 0x4d6d18 by the record's kind, and every
// dummy type is 128 of the engine's 128ths — one whole point (`weapons/melee.md`),
// which play said before the disassembly did. A house wall is 60 points out of
// the same table, and the reason "тнт не дамажит дом" was that this file only
// ever built targets for the one name it had seen break
// (lib/game/breakable.ts).
//
// Pure: records in, targets out, plus the reach test the melee shares.

import type { MapObject } from '../formats/pog'
import { breakableHealth } from './breakable'
import { caught, strikeGap } from './melee'
import type { Point } from './melee'
import { HEIGHT_SCALE } from './terrain'

/** What the training ground's dummies are called in a map's own `.MAD`. */
export const DUMMY_MODEL = 'DUMMY'

/**
 * What a DUMMY is worth in health — one point, so the weakest thing that swings
 * still flattens it.
 *
 * Named here because the whole training ground rests on it; every other
 * breakable's number comes out of `breakableHealth`.
 *
 * A target is hurt through `hurt` in lib/game/health.ts, which is the PIG's
 * rule. Two of its branches do not belong to one and neither can fire here: the
 * training floor is not passed (0x48d990 has no such test — the training ground
 * kills dummies, that is what they are for), and the gib needs sixty points past
 * dead, which nothing that swings comes near.
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
 * Everything a map stands on its ground that can be knocked down.
 *
 * Matched by MODEL NAME through the exe's own table, which is how a record is
 * paired to its geometry anyway (lib/game/breakable.ts). CAMP's eleven dummies
 * come out of it at one point each; so do its 85 firs at eighty, and the eighteen
 * wall, floor and roof pieces its house is built out of at sixty — which is what
 * makes a charge next to a house do something at last.
 */
export function targetsOf(objects: MapObject[]): Target[] {
  const out: Target[] = []
  for (const object of objects) {
    const fromTable = breakableHealth(object.name)
    if (fromTable === null) continue
    out.push({
      id: object.id,
      x: object.x,
      y: -object.y * HEIGHT_SCALE,
      z: object.z,
      health: ownHealth(object) ?? fromTable
    })
  }
  return out
}

/**
 * **A RECORD'S OWN HEALTH, which beats the table** — field 12, and it is read.
 *
 * Play: "у дома кажется сильно много хп — по крайней мере в игре с 1-го взрыва
 * дверь ломается." Right, and the door says so itself: CAMP's record 46 is the
 * `STW04_D2` door piece and its field 12 is **50**, exactly TNT's fifty points at
 * the core, where the wall pieces around it leave the field at 255 and take the
 * table's sixty. One charge takes the door and not the wall.
 *
 * The exe reads it in the loader's common tail (0x4a6179): not 0xFF and it writes
 * `field12 << 7` — the same 128ths — into `[+0x4c]`, and for the breakable class
 * into `[+0xa8]`, the maximum, as well. 0xFF means "use the table", and 5479 of
 * the 6322 shipped records say exactly that.
 */
const ownHealth = (object: MapObject): number | null => {
  const stored = object.fields[12]
  return stored === 0xff || stored <= 0 ? null : stored
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
