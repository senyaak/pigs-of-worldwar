// What a GRENADE does, which is not what a bullet does.
//
// A gun and a grenade come out of the same projectile class and the same
// 40-byte row table at 0x4c2030 (`projectile.ts`), and then part company on
// three counts:
//
// 1. **The gauge is in the speed.** The constructor's flight speed is
//    `row.speed * charge >> 12` (0x432159), and only a gauge weapon has a
//    charge worth multiplying by — see `gauge.ts`. So a grenade leaves at
//    anything from nothing to the row's 300 a frame.
// 2. **It ARCS.** The projectile body is type 0x135D, and `0x4aa0d0` gives
//    everything that is not a pig the world's plain gravity — ten a frame
//    squared, with the integrator's drag skipped for that very type
//    (`PLAIN_GRAVITY` in ballistics.ts). A bullet's flight is short enough
//    for that not to show; three seconds of grenade is nothing but that.
// 3. **It does not expire by range.** Every gun's row carries a lifetime of
//    15 to 90 frames and a grenade's is 1000, which at fifteen a second is
//    over a minute. Running the lifetime out does not destroy a projectile
//    either — `0x4368f5` hands it to gravity and lets it drop. So a grenade
//    is not on a range clock at all; it is on its own FUSE.
//
// `../../../pigs-disasm/weapons/fire.md`.
//
// Pure, seconds and game space (Y-down), like the rest of lib/game.

import { PLAIN_GRAVITY, bounceOff, fromExeSpeed, groundMaterial } from './ballistics'
import type { Bounciness, Velocity } from './ballistics'
import { GAUGE_FULL } from './gauge'
import { AIM_UNITS } from './aim'

/** One lobbed weapon's row, read out of 0x4c2030 the same way a gun's is. */
export interface Lob {
  /** The exe's projectile id, field +0x10 of the weapon's 80-byte record. */
  id: number
  /** …less 388, the row of the table. */
  kind: number
  /** Row +0x00, exe units a frame at FULL charge. */
  speed: number
  /**
   * Row +0x18.
   *
   * Read as the BLAST, on the distribution rather than on a line of code:
   * it is zero for every one of the thirteen guns and non-zero for every
   * one of the things that go off — 150 the grenade family, 750 for skill
   * 16, 250 for 34, 125 for 37/38, 25 for 35/36. That is a damage ladder
   * and nothing else in either table looks like one. `fire.md` also has it
   * compared against a counter at 0x436c6c, which is a real reading of a
   * real instruction, so one of the two arms uses it for each. Correct this
   * the moment the blast handler turns up.
   */
  damage: number
}

/**
 * The grenade family, skills 19–27 — nine of them, and their rows are all but
 * identical. 26 is the odd one: half the row's +0x04 and no +0x08, which is
 * whatever those two fields drive (they feed effect 0x5D at 0x436665).
 */
const LOBS: Record<number, Lob> = {
  /** 19 GRENADE — the plain one, and the only one the tutorial hands out. */
  19: { id: 412, kind: 24, speed: 300, damage: 150 },
  20: { id: 413, kind: 25, speed: 300, damage: 150 },
  21: { id: 414, kind: 26, speed: 300, damage: 150 },
  22: { id: 415, kind: 27, speed: 300, damage: 150 },
  23: { id: 416, kind: 28, speed: 300, damage: 150 },
  24: { id: 417, kind: 29, speed: 300, damage: 150 },
  25: { id: 418, kind: 30, speed: 300, damage: 150 },
  26: { id: 419, kind: 31, speed: 300, damage: 150 },
  27: { id: 420, kind: 32, speed: 300, damage: 150 }
}

/** What this skill lobs, or null for everything that does not lob. */
export const lobOf = (skill: number | null): Lob | null =>
  skill === null ? null : (LOBS[skill] ?? null)

/** Whether this skill is thrown rather than shot — what the fire button and
 * the gauge both ask. */
export const isLobbed = (skill: number | null): boolean => lobOf(skill) !== null

/**
 * How long a grenade burns before it goes off, in SECONDS.
 *
 * **The remake's own.** The row's +0x14 is 3 for every grenade and it is not a
 * fuse: the update reads it as a threshold on a per-state timer at 0x436961,
 * against a state machine of seven arms whose transitions have not been
 * followed. The lifetime cannot be it either — 1000 frames is over a minute.
 * So this is a number chosen to play, and it is the first thing to correct
 * against the original.
 */
export const FUSE_SECONDS = 3

/**
 * How far the blast reaches, in game units.
 *
 * **The remake's own**, and there is nothing in the row for it: the two
 * collision-box bytes at +0x24 are 1 and 1, which is the same 64-unit unit a
 * prop's box uses and so is the size of the grenade rather than of its blast.
 * A pig is 640 units on a side, so this is a pig and a bit either way —
 * enough that a near miss still hurts and a shelter still works.
 */
export const BLAST_RADIUS = 800

/**
 * How much of the row's damage a body at this distance takes, 0..1.
 *
 * Linear to the rim, which is the remake's — nothing has been read. Anything
 * outside is untouched.
 */
export const blastShare = (distance: number): number =>
  distance >= BLAST_RADIUS ? 0 : 1 - distance / BLAST_RADIUS

/** A grenade in the air, or rolling. Game space, Y-down; velocity a second. */
export interface Lobbed {
  skill: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** Seconds left on the fuse. It runs from the throw, not from the landing —
   * which is the remake's reading and the one the fuse constant above is. */
  fuse: number
  /** Whether it has stopped moving. Only for what draws it; the fuse does not
   * care. */
  resting: boolean
}

/**
 * Throw one.
 *
 * `from` is the hand — the exe builds a thrown thing's start off BONE 5 and
 * the weapon's row of 0x4d0ee0, exactly as it builds a muzzle and a blade, so
 * the scene hands the posed point in. `charge` is the gauge, 0..0xfff.
 */
export function lob(
  skill: number,
  from: { x: number; y: number; z: number },
  heading: number,
  aim: number,
  charge: number
): Lobbed | null {
  const row = lobOf(skill)
  if (!row) return null
  // `row.speed * charge >> 12`, the constructor's own line, in our units.
  const speed = fromExeSpeed((row.speed * charge) / GAUGE_FULL)
  const pitch = (aim / AIM_UNITS) * 2 * Math.PI
  const flat = Math.cos(pitch) * speed
  return {
    skill,
    x: from.x,
    y: from.y,
    z: from.z,
    // Forward is (sin h, cos h) as every step a pig takes is, and UP is a
    // SMALLER y.
    vx: Math.sin(heading) * flat,
    vy: -Math.sin(pitch) * speed,
    vz: Math.cos(heading) * flat,
    fuse: FUSE_SECONDS,
    resting: false
  }
}

/**
 * One frame of flight — the parabola, and nothing else. Whether it has met
 * the ground is the scene's to say, because only the scene has the terrain;
 * `bounceLob` is what it calls when it has.
 *
 * True when the fuse has run out.
 */
export function advanceLob(shot: Lobbed, delta: number): boolean {
  shot.vy += PLAIN_GRAVITY * delta
  shot.x += shot.vx * delta
  shot.y += shot.vy * delta
  shot.z += shot.vz * delta
  shot.fuse -= delta
  return shot.fuse <= 0
}

/**
 * It hit something. Reflect off `normal` and lose what the surface takes,
 * through the same solver a pig lands with — a grenade is a body in the same
 * world, on the same per-terrain friction and restitution table.
 *
 * `y` is where the surface was, so the caller does not have to pin it twice.
 */
export function bounceLob(
  shot: Lobbed,
  y: number,
  normal: Velocity,
  tileType: number,
  blocked: boolean,
  /** The projectile's own bounciness. The exe gives a body a restitution per
   * SURFACE and the thrower is not part of it, so this is the neutral side of
   * `bounceOff` rather than a grenade-specific number. */
  self: Bounciness = { friction: 0, restitution: 1 }
): void {
  const hit = bounceOff(
    { x: shot.vx, y: shot.vy, z: shot.vz },
    self,
    groundMaterial(tileType, blocked),
    normal
  )
  shot.y = y
  shot.vx = hit.x
  shot.vy = hit.y
  shot.vz = hit.z
  // Under a whisker of movement it is lying there. Only what draws it cares.
  shot.resting = Math.abs(hit.x) + Math.abs(hit.y) + Math.abs(hit.z) < fromExeSpeed(1)
  if (shot.resting) {
    shot.vx = 0
    shot.vy = 0
    shot.vz = 0
  }
}
