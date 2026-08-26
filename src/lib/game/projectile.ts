// What a gun throws.
//
// The original has ONE projectile class (vtable 0x4bc468, body type 0x135D,
// 208 bytes) and a **40-byte row per kind at 0x4c2030** drives all of it. The
// kind is `projectileId − 388`, and the id is field +0x10 of the weapon's own
// 80-byte record. `weapons/fire.md` is the read.
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
  /**
   * Row +0x0C — **the DAMAGE, in the engine's 128ths of a point**, and it is
   * decoded rather than invented at last.
   *
   * The handler this repo went looking for for weeks is not in the weapon's
   * record and not in a per-weapon switch: it is `Pig::OnHit`, the pig's own
   * `vtable+0x54` (0x477390), which the physics world's contact loop calls for
   * every touching pair (0x4a8b4c). Its arm for a body of type 0x135E — an
   * EFFECT — is 0x4778ae, and there the effect's id decides whether it hurts
   * at all (`0x41 < id < 0x63`) before `0x48CBA0` works out how much.
   * `0x489493` is where that window is written and it stores this field at
   * `[effect+0x68]`.
   *
   * The ladder it gives is unmistakable: pistol and rifle 20 points, the
   * SNIPER 40, the medic dart **0** — it heals, so it must not hurt — and 75
   * for the guided missile. `SHOT_DAMAGE = 20` was invented and happened to be
   * right for exactly two weapons.
   */
  damage: number
  /**
   * Row +0x08 — non-zero on everything explosive and **zero on every gun**,
   * which is the cleanest "does this thing have a blast at all" flag in the
   * table. It is NOT the blast's range: counting `Effect::Init`'s frame
   * properly (see `grenade.ts`) puts the range at row +0x04 and leaves this as
   * Init's arg 9, unfollowed.
   */
  blast: number
  /**
   * How many rounds ONE trigger pull looses — the SHOTGUNS' field, absent
   * everywhere else and read as 1.
   *
   * `[exe]`, read 2026-08-26 after play challenged the first (five-pellet)
   * build: the fire routine's jump table at 0x47cf8c sends skills 12 AND 13
   * to ONE arm, 0x47a776, and that arm is a LOOP — `xor ebx,ebx` …
   * `inc ebx; cmp ebx,0xA; jl` — TEN `new(0xD0)` + `0x431f00(...)` pairs
   * per press. Iterations 0..8 build their projectile with a NULL owner;
   * the last (ebx==9) passes the pig and lands in `[pig+0x16C]`, which is
   * the shot the camera rides. The fire.md line "every arm has the same
   * shape" was wrong for this one arm.
   */
  pellets?: number
  /**
   * How far one pellet may wander from the sights, either way, in the
   * engine's 4096-to-the-turn units — applied to BOTH angles, freshly
   * rolled per pellet per axis. `[exe]`: each iteration of the 0x47a776
   * loop calls rand twice and does `(rand & 0x1F) - 0x10` — a uniform
   * ±16/4096 (~±1.4°) — onto the yaw and then the aim (0x47a803..0x47a82c).
   */
  spread?: number
  /**
   * `Pig::HitByProjectile`'s `edi` — a first-hit damage MULTIPLIER and the
   * per-volley hit CAP in one number, per TARGET. `[exe]`: the byte map at
   * 0x478B18 gives kinds 0x12/0x13 (both shotguns) `mov edi,5` — the first
   * pellet a body takes deals `damage × 5`, later pellets plain damage,
   * and past five the damage is refused though the shove still lands
   * (`weapons/fire.md`). So a full ten-pellet volley into one pig is
   * 15+3+3+3+3 = 27 points, and even ONE stray pellet is worth 15.
   */
  burst?: number
  /**
   * The shove a hit gives, in exe units a frame, where the exe's literal
   * 0x30 does not hold. ONE kind diverges: 0x478A99 pushes kind 0x12 — the
   * SHOTGUN — by 6 where every other projectile gets 48 (`weapons/fire.md`).
   * Absent means the ordinary 0x30 (`SHOT_SHOVE`, lib/game/bullets.ts).
   */
  shove?: number
}

/**
 * Skill -> what it throws. Only the GUNS are here; everything with a power
 * gauge (19–27, 29–34, 39–44, 47, 48) lobs rather than shoots and is its own
 * job. Every one of these rows is otherwise ZERO — no damage, no thresholds,
 * no collision box — so a bullet really is just a speed and a life.
 */
const GUNS: Record<number, Projectile> = {
  6: { id: 400, kind: 12, speed: 300, life: 20, damage: 2560, blast: 0 },
  /** 7 RIFLE — the training ground's second weapon. */
  7: { id: 401, kind: 13, speed: 300, life: 30, damage: 2560, blast: 0 },
  8: { id: 402, kind: 14, speed: 300, life: 30, damage: 1920, blast: 0 },
  9: { id: 404, kind: 16, speed: 300, life: 25, damage: 512, blast: 0 },
  10: { id: 405, kind: 17, speed: 300, life: 25, damage: 1024, blast: 0 },
  /** 11 SNIPER RIFLE — the same speed and THREE times the reach, which is the
   * only thing separating it from the rifle in either table. */
  11: { id: 403, kind: 15, speed: 300, life: 90, damage: 5120, blast: 0 },
  /** 12 SHOTGUN, 13 SUPER SHOTGUN — gtext 108/109 against `SKILL_LINE`;
   * the repo's older "RIFLE BELL" reading was the icon's name, not the
   * weapon's. TEN pellets a press, jittered ±16, five counted per target
   * with the first ×5 (`pellets`/`spread`/`burst` above — all three read
   * out of the exe); the one place the pair differ is the shove — the
   * plain shotgun pushes 6 where everything else pushes 48 (0x478A99),
   * the SUPER keeps the 48. */
  12: { id: 406, kind: 18, speed: 300, life: 15, damage: 384, blast: 0, pellets: 10, spread: 16, burst: 5, shove: 6 },
  13: { id: 407, kind: 19, speed: 300, life: 15, damage: 384, blast: 0, pellets: 10, spread: 16, burst: 5 },
  14: { id: 411, kind: 23, speed: 150, life: 20, damage: 768, blast: 0 },
  15: { id: 434, kind: 46, speed: 300, life: 1000, damage: 6400, blast: 3900 },
  17: { id: 424, kind: 36, speed: 300, life: 30, damage: 0, blast: 0 },
  18: { id: 442, kind: 54, speed: 300, life: 30, damage: 2560, blast: 0 }
}

/** What this skill throws, or null for everything that is not a gun. */
export const projectileOf = (skill: number | null): Projectile | null =>
  skill === null ? null : (GUNS[skill] ?? null)

/** Whether this skill is a gun at all — what the aim mode and the fire key
 * both ask. */
export const isGun = (skill: number | null): boolean => projectileOf(skill) !== null

/** The engine counts 128ths of a point; nothing ever makes a fractional one
 * (lib/game/health.ts), so a row's figure comes out whole. */
export const DAMAGE_UNIT = 128

/** What this weapon's projectile takes off on a clean hit, in POINTS. */
export const damageOf = (skill: number | null): number =>
  Math.round((projectileOf(skill)?.damage ?? 0) / DAMAGE_UNIT)

/**
 * What ONE trigger pull can take off ONE body at its worst — the number a
 * brain prices a gun by (lib/game/evaluate.ts). A plain gun is its one
 * round; a fanned gun without a cap would be every pellet; the shotguns'
 * `burst` counts `min(pellets, burst)` hits with the first multiplied, so
 * the pair come out at 3 × (5 + 5 − 1) = 27.
 */
export const volleyDamageOf = (skill: number | null): number => {
  const row = projectileOf(skill)
  if (!row) return 0
  const round = damageOf(skill)
  if (!row.burst) return round * (row.pellets ?? 1)
  const counted = Math.min(row.pellets ?? 1, row.burst)
  return round * (row.burst + counted - 1)
}

/** A bullet in flight. Position is game space (Y-down); velocity is units a
 * SECOND, like every other speed in the remake. */
export interface Shot {
  /** What names it outside the engine — the tween holds a bullet's last two
   * places by this, and a list that splices must not shift one into another
   * (three/tween.ts). Handed out by `createBullets`. */
  id: number
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
  /** The pig that fired it — set beside `id` by `createBullets.fire`, so a
   * kill can be tallied against its attacker (lib/game/events.ts, `killed`).
   * A spec-built shot has none. */
  owner?: number
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
 * Written up in `weapons/fire.md`; correct it if the
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
    id: 0,
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

/**
 * How big a bullet is DRAWN, in model units.
 *
 * A projectile is not a streak in the original — it is an object with a real
 * body, and the body factory sizes it off the projectile's own kind
 * (0x4a8ed5, the arm the jump table at 0x4a90cc gives body type 0x135D):
 *
 * ```
 * esi = [proj+0x88]                  ; the kind
 * if (kind == 0x0C) esi = 100
 * else              esi = (kind == 0x28 ? 0 : 3) + 0x20
 * ```
 *
 * so **35 for every gun but the pistol**, whose kind is 12 and which gets a
 * hundred. The same routine hands a pickup 128 and a pig-sized body 1024, and
 * a crate really is about a eighth of the size of a pig, so this is a RADIUS
 * in model units and a bullet is seventy across. Small, and meant to be: the
 * shot camera flies along behind it (`weapons/fire.md`).
 */
export function bulletSize(kind: Projectile): number {
  if (kind.kind === 12) return 100
  return kind.kind === 40 ? 32 : 35
}

/** How far a bullet reaches before it expires, in world units — the speed and
 * the life multiplied, which is the only place a range exists. */
export const rangeOf = (kind: Projectile): number =>
  fromExeSpeed(kind.speed) * kind.life * FRAME_SECONDS
