// What a gun throws.
//
// The original has ONE projectile class (vtable 0x4bc468, body type 0x135D,
// 208 bytes) and a **40-byte row per kind at 0x4c2030** drives all of it. The
// kind is `projectileId − 388`, and the id is field +0x10 of the weapon's own
// 80-byte record. `../../../pigs-disasm/weapons/fire.md` is the read.
//
// Two of its numbers are the whole of a gun: a SPEED, and a LIFETIME in
// FRAMES. Range is not stored anywhere — it is those two multiplied, which is
// why the sniper rifle reaches three times as far as the rifle on the same
// speed.
//
// Pure, like the rest of lib/game. Game space, Y-down.

import { FRAME_SECONDS, fromExeSpeed } from './ballistics'
import { AIM_UNITS } from './aim'

/** What one weapon throws. */
export interface Projectile {
  /** The exe's own projectile id, 388..442 — field +0x10 of the record. */
  id: number
  /** …less 388, which is the row of the table at 0x4c2030. */
  kind: number
  /** Exe units a frame, straight out of the row's +0x00. */
  speed: number
  /**
   * How many frames it lives, out of the switch at 0x4320d5. The update
   * counts `[proj+0xA4]` up once a frame and expires it at this
   * (0x436358) — so this times the speed IS the range, and nothing stores a
   * range as such.
   */
  life: number
}

/**
 * Skill -> what it throws. Only the GUNS are here; everything with a power
 * gauge (19–27, 29–34, 39–44, 47, 48) lobs rather than shoots and is its own
 * job. Every one of these rows is otherwise ZERO — no damage, no thresholds,
 * no collision box — so a bullet really is just a speed and a life.
 */
const GUNS: Record<number, Projectile> = {
  6: { id: 400, kind: 12, speed: 300, life: 20 },
  /** 7 RIFLE — the training ground's second weapon. */
  7: { id: 401, kind: 13, speed: 300, life: 30 },
  8: { id: 402, kind: 14, speed: 300, life: 30 },
  9: { id: 404, kind: 16, speed: 300, life: 25 },
  10: { id: 405, kind: 17, speed: 300, life: 25 },
  /** 11 SNIPER RIFLE — the same speed and THREE times the reach, which is the
   * only thing separating it from the rifle in either table. */
  11: { id: 403, kind: 15, speed: 300, life: 90 },
  12: { id: 406, kind: 18, speed: 300, life: 15 },
  13: { id: 407, kind: 19, speed: 300, life: 15 },
  14: { id: 411, kind: 23, speed: 150, life: 20 },
  15: { id: 434, kind: 46, speed: 300, life: 1000 },
  17: { id: 424, kind: 36, speed: 300, life: 30 },
  18: { id: 442, kind: 54, speed: 300, life: 30 }
}

/** What this skill throws, or null for everything that is not a gun. */
export const projectileOf = (skill: number | null): Projectile | null =>
  skill === null ? null : (GUNS[skill] ?? null)

/** Whether this skill is a gun at all — what the aim mode and the fire key
 * both ask. */
export const isGun = (skill: number | null): boolean => projectileOf(skill) !== null

/**
 * How much a bullet takes off.
 *
 * **The remake's own, and the one number here that is.** The projectile row's
 * `+0x18` looked like a damage base and is not — it is a threshold the update
 * compares a counter against (0x436c6c) — and every gun's is zero anyway. The
 * weapon's own 80-byte record has no damage field either: searched all 80
 * bytes at every width for the five melee damages, which ARE known
 * (15/15/10/25/25), and none of them is in there. So a gun's damage lives in
 * the hit handler, the way `Pig::HitByHandToHand` holds the melee's, and that
 * handler is not found.
 *
 * Twenty points is three shots on a fifty-point grunt, which is the shape play
 * remembers. Correct it the moment the handler turns up.
 */
export const SHOT_DAMAGE = 20

/** A bullet in flight. Position is game space (Y-down); velocity is units a
 * SECOND, like every other speed in the remake. */
export interface Shot {
  skill: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** Frames since it left, against `life`. */
  age: number
  life: number
}

/**
 * Fire one.
 *
 * `from` is the muzzle — the exe builds it off BONE 5 and the weapon's row of
 * the table at 0x4d0ee0, the same bone and the same table the bayonet's blade
 * comes out of, so the scene hands it in. `heading` is the pig's, `aim` the
 * angle in the engine's 4096-to-the-turn units, positive UP.
 *
 * The exe scales the speed by the power charge (`row.speed * charge >> 12`),
 * and for a weapon with no gauge that charge is 1 — which would make every
 * gun's speed zero and every one of the authored lifetimes meaningless. So the
 * multiply is read as the GAUGE's own and a gun takes the row's speed whole.
 * Written up in `../../../pigs-disasm/weapons/fire.md`; correct it if the
 * missing line turns up.
 */
export function fireShot(
  skill: number,
  from: { x: number; y: number; z: number },
  heading: number,
  aim: number
): Shot | null {
  const kind = projectileOf(skill)
  if (!kind) return null
  const pitch = (aim / AIM_UNITS) * 2 * Math.PI
  const speed = fromExeSpeed(kind.speed)
  const flat = Math.cos(pitch) * speed
  return {
    skill,
    x: from.x,
    y: from.y,
    z: from.z,
    // Forward is (sin h, cos h), the same as every step a pig takes
    // (lib/game/movement.ts), and UP is a SMALLER y.
    vx: Math.sin(heading) * flat,
    vy: -Math.sin(pitch) * speed,
    vz: Math.cos(heading) * flat,
    age: 0,
    life: kind.life
  }
}

/**
 * One frame of flight.
 *
 * Straight, and that is a gap rather than a decision: the projectile is a body
 * in the world (type 0x135D) and whatever force generator the world puts on it
 * has not been read. Over the rifle's two seconds a real drop would be
 * visible, so this wants checking against play.
 */
export function advanceShot(shot: Shot, delta: number): void {
  shot.x += shot.vx * delta
  shot.y += shot.vy * delta
  shot.z += shot.vz * delta
  shot.age += delta / FRAME_SECONDS
}

/** Whether it has run out of range. */
export const spentShot = (shot: Shot): boolean => shot.age >= shot.life

/** How far a bullet reaches before it expires, in world units — the speed and
 * the life multiplied, which is the only place a range exists. */
export const rangeOf = (kind: Projectile): number =>
  fromExeSpeed(kind.speed) * kind.life * FRAME_SECONDS
