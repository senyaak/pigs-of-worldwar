// Where an EMPLACED gun's round is born.
//
// Every other weapon in the game comes out of the pig's own hand: `bullets.ts`
// asks `pose.boneToWorld(pig, HAND_BONE, MUZZLE[skill])` and the muzzle table
// at 0x4d0ee0 says how far past the bone the barrel reaches. **The pillbox's
// two cannot use that**, and not for want of a row — the exe's own byte map at
// 0x47cf68 is only consulted for `skill − 6` in [0, 0x20], skills 6..38, so 45
// and 46 have no muzzle offset in the table at all.
//
// The reason is the same one that makes this file necessary here: the gun does
// not belong to the pig. `weapons/emplaced.md` — the record's model field is
// **0** for all five emplaced skills and the attack clip is **-1**, so nothing
// goes in the trotters and the pig does not animate the shot. The gun is the
// building's.
//
// And in this engine that is not a nicety. A pig inside a building sits at its
// box's middle (lib/game/indoors.ts), the box is SOLID (lib/game/obstacles.ts),
// and `bullets.ts` stops a round on the first box it is inside of — so a shot
// born at the hand bone would die against the pillbox's own wall on the frame
// it left. The round has to start OUTSIDE.
//
// `[CHECK — remake]`: the exe's emplaced arms take their heading from the pig
// (0x46a960) and hand the projectile constructor a position this repo has not
// followed. Where exactly the barrel pokes out is the remake's, chosen so the
// shot clears the building it is fired from and no further.
//
// Pure, game space, Y-down — like the rest of lib/game.

import type { Obstacle } from './obstacles'
import type { Point } from './pose'

/**
 * **The five skills that belong to a mount rather than to a pig** — 45 HEAVY
 * M-GUN and 46 FLAME THROWER on a pillbox, 47/48/49 on a vehicle.
 *
 * They are one group in the exe and the membership is not a guess: all five
 * records carry model **0** and attack clip **-1** (nothing in the trotters,
 * no firing animation), and all five arms open on the same test of
 * `[pig+0x170]` (`weapons/emplaced.md`). 50 JETPACK shares the empty model and
 * is NOT one of them — its arm has no such gate.
 */
const EMPLACED = [45, 46, 47, 48, 49]

/** Whether this skill's gun belongs to the thing the pig is sitting in. */
export const isEmplaced = (skill: number | null): boolean =>
  skill !== null && EMPLACED.includes(skill)

/**
 * How far past the box's own wall the muzzle sits.
 *
 * Far enough that the round's FIRST tested position is already outside — the
 * flight tests after each substep and a substep is a pig's radius long, so
 * anything shorter than that risks the first test landing back in the wall.
 */
export const BARREL_CLEAR = 64

/**
 * Where the slit is, as a fraction of the box's height DOWN from its roof.
 *
 * A pillbox fires from high on the wall rather than from the middle of it, and
 * putting the muzzle at the box's centre would send half the shots into the
 * ground the building stands on.
 */
export const BARREL_DROP = 0.25

/**
 * The point an emplaced gun's round leaves from: out through the box's wall
 * along the way the pig is facing, at the slit's height.
 *
 * The box may be turned, so the wall it exits through is found in the box's
 * OWN frame — the ray from the centre leaves an axis-aligned box at
 * `min(halfX / |dx|, halfZ / |dz|)`, and that distance carries back out
 * unchanged because the turn is a rotation.
 */
export function barrelMuzzle(box: Obstacle, heading: number): Point {
  // Forward is (sin h, cos h), the same as every step a pig takes
  // (lib/game/movement.ts).
  const dx = Math.sin(heading)
  const dz = Math.cos(heading)
  // Into the box's own frame: its +x runs along (cos turn, −sin turn) and its
  // +z along (sin turn, cos turn) (lib/game/obstacles.ts, `boxOf`).
  const cos = Math.cos(box.turn)
  const sin = Math.sin(box.turn)
  const localX = dx * cos - dz * sin
  const localZ = dx * sin + dz * cos
  // A face is only reached by a direction that has some of that axis in it.
  const reachX = Math.abs(localX) > 1e-6 ? box.halfX / Math.abs(localX) : Infinity
  const reachZ = Math.abs(localZ) > 1e-6 ? box.halfZ / Math.abs(localZ) : Infinity
  // Both infinite means a zero direction, which no heading produces; the box's
  // own half-width is the honest answer if one ever does.
  const wall = Math.min(reachX, reachZ)
  const out = (Number.isFinite(wall) ? wall : Math.max(box.halfX, box.halfZ)) + BARREL_CLEAR
  return {
    x: box.x + dx * out,
    z: box.z + dz * out,
    // Y counts DOWN, so the roof is the smaller number and the slit is BELOW
    // it — a positive step from `top` towards `bottom`.
    y: box.top + (box.bottom - box.top) * BARREL_DROP
  }
}
