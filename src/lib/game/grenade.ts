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

import {
  BOUNCE_CUTOFF,
  FIXED,
  PLAIN_GRAVITY,
  fromExeFrames,
  fromExeSpeed
} from './ballistics'
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
   * Row +0x18 — **the FUSE, in engine frames**, and emphatically not the
   * damage this file first read it as.
   *
   * The projectile runs a seven-arm state machine on `[proj+0xB4]` against a
   * frame counter at `[proj+0xA8]` (0x436938, table at 0x436DA0). A grenade's
   * row +0x14 is non-zero, so the constructor starts it in **state 0**
   * (0x43200c); state 0 counts `[proj+0xBC]` = row +0x14 = **3 frames** and
   * then dispatches on row +0x1C's low byte, which for the whole family is 2
   * — the arm that zeroes the counter and moves to **state 1** (0x4369e3).
   * And state 1 is three instructions:
   *
   * ```
   * 436a62  cmp ecx,[esi+0B8h]      ; the counter against the fuse
   * 436a68  jbe ...                 ; not yet
   * 436a6e  [proj+0xB4] = 6         ; ...and state 6 is [proj+0x31] = 1, done
   * ```
   *
   * `[proj+0xB8]` is this field plus `rand() & 7`, written once in the
   * constructor (0x43208b, 0x432095). So a hundred and fifty frames and a
   * little.
   */
  fuse: number
  /** Row +0x0C — what the blast takes off at its CORE, in 128ths of a point.
   * 3840 for the plain grenade, which is thirty points against a grunt's
   * fifty (`projectile.ts` has the whole ladder and the read). */
  damage: number
  /**
   * Row **+0x04** — what the blast effect's range argument is built from.
   *
   * Which argument that is was got wrong once and is now COUNTED rather than
   * guessed. `0x487AD0` is `ret 1Ch`, seven dwords, and the frame it hands to
   * `Effect::Init` is legible instruction by instruction (0x487b23..0x487b5c):
   * Init's arg 5 — the ID it dispatches on — is `0x487AD0`'s **arg 3**, Init's
   * arg 7, which 0x4894c3 stores at `[effect+0x60]`, is **arg 4**, and Init's
   * arg 10, stored at `[effect+0x68]`, is **arg 7**.
   *
   * The grenade's spawn is `0x487AD0(x, z, 0x54, row+0x04, 1, row+0x08,
   * row+0x0C)`, so the range is row **+0x04 = 1024** and not the 2600 of
   * +0x08 that a first reading took. What +0x08 is — Init's arg 9 — is not
   * followed.
   */
  blast: number
}

/**
 * The grenade family, skills 19–27 — nine of them, and their rows are all but
 * identical. 26 is the odd one: half the row's +0x04 and no +0x08, which is
 * whatever those two fields drive (they feed effect 0x5D at 0x436665).
 */
const LOBS: Record<number, Lob> = {
  /** 19 GRENADE — the plain one. */
  19: { id: 412, kind: 24, speed: 300, fuse: 150, damage: 3840, blast: 1024 },
  20: { id: 413, kind: 25, speed: 300, fuse: 150, damage: 3840, blast: 1024 },
  21: { id: 414, kind: 26, speed: 300, fuse: 150, damage: 2560, blast: 512 },
  22: { id: 415, kind: 27, speed: 300, fuse: 150, damage: 1920, blast: 512 },
  23: { id: 416, kind: 28, speed: 300, fuse: 150, damage: 1920, blast: 512 },
  24: { id: 417, kind: 29, speed: 300, fuse: 150, damage: 7680, blast: 1536 },
  25: { id: 418, kind: 30, speed: 300, fuse: 150, damage: 3840, blast: 1024 },
  26: { id: 419, kind: 31, speed: 300, fuse: 150, damage: 5120, blast: 1024 },
  27: { id: 420, kind: 32, speed: 300, fuse: 150, damage: 3840, blast: 1024 }
}

/** What this skill lobs, or null for everything that does not lob. */
export const lobOf = (skill: number | null): Lob | null =>
  skill === null ? null : (LOBS[skill] ?? null)

/** Whether this skill is thrown rather than shot — what the fire button and
 * the gauge both ask. */
export const isLobbed = (skill: number | null): boolean => lobOf(skill) !== null

/** The three frames of state 0 before the fuse proper starts — row +0x14. */
export const ARMING_FRAMES = 3
/** `rand() & 7` on top of the row's figure, once, in the constructor. */
export const FUSE_JITTER = 7

/**
 * How long a grenade burns, in seconds — the row's own frames converted at
 * the ENGINE's rate rather than at this remake's stretched one
 * (`fromExeFrames` in ballistics.ts argues why). A hundred and fifty-three
 * frames is a touch over five seconds.
 *
 * `random` is injectable so a spec can pin the jitter.
 */
export const fuseSeconds = (row: Lob, random: () => number = Math.random): number =>
  fromExeFrames(ARMING_FRAMES + row.fuse + Math.floor(random() * (FUSE_JITTER + 1)))

/**
 * The blast, DECODED end to end — `0x48CBA0`, which `Pig::OnHit`'s
 * effect arm calls to work out how much (0x4778e8).
 *
 * ```
 * 48cc25  d = |pig.pos - effect.pos|
 * 48cc33  esi = d - 0x200 ; if (esi < 0) esi = 0
 * 48cc54  edi = [effect+0x68]              ; the FULL damage, row +0x0C
 * 48cc57  ecx = the range                  ; [effect+0x60] and two more terms
 * 48cc59  if (ecx <= 0) return edi         ; no range -> flat, which is a GUN
 * 48cc5d  esi *= edi
 * 48cc62  eax = (esi << 2) - esi           ; 3 * esi
 * 48cc67  eax = -eax
 * 48cc6d  eax /= (ecx << 2)                ; ...over 4 * range
 * 48cc6f  return edi + eax
 * ```
 *
 * So: **a core of 512 units at full damage, then linear down to a QUARTER of
 * it at the rim** — never to nothing, which is why standing back helps and
 * hiding does not. Whether it hurts at all is the EFFECT's id, not the
 * projectile's: `0x41 < id < 0x63` (0x4778b4, and 0x489493 where the same
 * window stores the two fields). A grenade's blast is 0x54.
 *
 * Two terms of the exe's range are left out and this says so: it adds
 * something off the struck body at `[body+0x4C]+0x0C` and subtracts the
 * constant at `[0x4BD3FC]`, and neither has been chased. The row's own figure
 * is what stands here.
 */
export const BLAST_CORE = 512

/**
 * …and the same 512 comes off the RANGE.
 *
 * `[0x4BD3FC]` reads 512.0 and 0x48cc49 subtracts it, so the exe's divisor is
 * `[effect+0x60] + [body+0x4C]+0x0C - 512`. For a grenade that is
 * `1024 + something - 512`. The body's own term is a float nobody has read; it
 * is left out and named here rather than guessed at.
 */
export const BLAST_BIAS = 512

/** How far the falloff runs, for this row — the exe's divisor without the
 * struck body's own unread term. */
export const blastRange = (row: Lob): number => Math.max(0, row.blast - BLAST_BIAS)

/** The share of the core damage a body at this distance takes, 0..1 — and it
 * never falls below a quarter inside the range. */
export function blastShare(distance: number, range: number): number {
  if (range <= 0) return 1
  // No cap and none needed: with the right range the formula bottoms out on
  // its own at `512 + 4*range/3`, which for a grenade is about 1200 units —
  // full damage inside one tile, nothing past two and a bit. The 3979 that had
  // to be capped came from reading the range off the wrong argument.
  const past = Math.max(0, distance - BLAST_CORE)
  return Math.max(0, 1 - (3 * past) / (4 * range))
}

/**
 * How a grenade meets the ground, and it is NOT the terrain's own material.
 *
 * Row +0x10 is the one field that separates a gun from a thrown thing — 1
 * against 2 — and its single reader is inside the collision code (0x4157a5),
 * which branches on `== 1`. The arm everything LOBBED takes (0x4158d2) writes
 * its own pair before resolving: **0xFFF and 0x200 of 4096**, an almost
 * perfectly elastic bounce on almost no friction. A bullet's arm does not.
 *
 * Which is what play describes: "если кидать вперёд чисто параллельно земли —
 * будет как камень прожектайл отскакивать." A flat throw skips.
 *
 * And they REPLACE the surface's own pair rather than multiplying with it,
 * which is what play felt as "слишком быстро теряет скорость из-за трения".
 * The proof is that they are different FIELDS: a tile's material goes through
 * `0x416560` onto the landscape BODY's `+0x58`/`+0x5c` (0x415600..0x41564c),
 * which is the pair the solver multiplies (0x40f690); the lobbed arm writes
 * 16-bit values onto the COLLISION RECORD at `+0x24`/`+0x28` just before
 * resolving. Two places, two purposes — so a grenade bounces at 0.9998 on
 * grass and on stone alike.
 *
 * Which of the two is friction and which restitution is not proven; taken in
 * the order the movement notes use for the body's pair, where 0xFFF is
 * unmistakably a restitution and 0x200 a friction.
 */
export const LOB_BOUNCE: Bounciness = { friction: 0x200 / FIXED, restitution: 0xfff / FIXED }

/** A grenade in the air, or rolling. Game space, Y-down; velocity a second. */
export interface Lobbed {
  skill: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** Seconds left. It runs from the THROW and nothing resets it on landing:
   * state 1 is entered three frames in and only ever leaves for state 6. */
  fuse: number
  /** Whether it has stopped moving. Only for what draws it; the fuse does not
   * care. */
  resting: boolean
  /** Whether it has gone into water. A thrown thing sinks — it does not skip
   * off a pond — and the scene stops bouncing it once this is set. */
  sunk: boolean
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
  charge: number,
  random: () => number = Math.random
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
    fuse: fuseSeconds(row, random),
    resting: false,
    sunk: false
  }
}

/**
 * How hard it has to be going to SKIP off water rather than go in.
 *
 * Play: "не прыгает по воде граната." It should — the collision arm a thrown
 * thing takes is nearly elastic (`LOB_BOUNCE`) and the exe does not exempt
 * water from it, so a flat throw skims a pond exactly as it skims the ground.
 * What sinks it is running out of speed, not the water itself.
 *
 * The threshold is the remake's: the same 25-a-frame the impact handler uses
 * to tell a landing from a bounce (`BOUNCE_CUTOFF`), which is the only figure
 * the engine has for "too slow to bounce".
 */
export const SKIPS_ON_WATER = (shot: Lobbed): boolean =>
  Math.hypot(shot.vx, shot.vy, shot.vz) > BOUNCE_CUTOFF

/**
 * …and once it is too slow, it goes in. How fast a sunk grenade falls is the
 * remake's — the exe's own water handling for a projectile has not been read.
 */
export const SINK_DRAG = 0.88
export function sinkLob(shot: Lobbed, delta: number): void {
  shot.sunk = true
  const damp = Math.max(0, 1 - (1 - SINK_DRAG) * delta * 60)
  shot.vx *= damp
  shot.vz *= damp
  // The VERTICAL is left alone: gravity has to be able to take it down, and
  // damping that too is what left a grenade sitting on the water — play saw it
  // ("застопорилась о воду и стоит на поверхности").
}

/**
 * How much a SKIP off water keeps. Play again: a stone skips a few times and
 * then goes in, which needs the surface to take something — at the ground's
 * near-perfect 0xFFF a grenade bounced on the spot for ever instead of sinking.
 *
 * The remake's own outright: water is ART in this engine, not a body, so
 * nothing in the exe collides with it and there is nothing to read.
 */
export const WATER_BOUNCE: Bounciness = { friction: 0.05, restitution: 0.45 }

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
 * It hit something. Reflect off `normal` with the projectile's own pair.
 *
 * This does NOT go through `bounceOff`, and that is the fix for play's "трение
 * всё ещё съедает энергию — в игре граната всё время хоть чуть-чуть да
 * катится". Two things in there belong to a PIG and not to a thrown thing:
 *
 * 1. **The `>> 3`.** `bounceOff` returns the normal part as `e * vn / 8`, and
 *    that eighth is `bounceSpeed`'s — the PIG's impact handler (0x4711d8 →
 *    0x471247), which damps a landing so a pig does not ricochet off its own
 *    behind. A projectile never reaches that handler; it goes through the
 *    solver, which has no such term (`e = restitutionA * restitutionB` and
 *    nothing else, 0x40f690). With the eighth in, a grenade at restitution
 *    0.9998 came back with an eighth of what it arrived with.
 * 2. **Friction once per CONTACT, not once per sub-step.** The scene walks a
 *    grenade in steps of its own size, and every step that ended below the
 *    surface used to take another 12.5% off the tangential. The exe resolves a
 *    contact once.
 *
 * `y` is where the surface was, so the caller does not have to pin it twice.
 */
export function bounceLob(
  shot: Lobbed,
  y: number,
  normal: Velocity,
  /** Kept in the signature though the pair above makes them unused: the caller
   * knows them and the day the surface turns out to matter after all, this is
   * where it goes. */
  _tileType: number,
  _blocked: boolean,
  /** What the projectile brings to the collision. `LOB_BOUNCE` is the exe's
   * own pair off the arm a thrown thing takes; the terrain's material still
   * multiplies in, the way the solver does it for a pig. */
  self: Bounciness = LOB_BOUNCE
): void {
  shot.y = y
  const vn = shot.vx * normal.x + shot.vy * normal.y + shot.vz * normal.z
  // Already leaving: there is no contact to resolve, and resolving it anyway
  // is what took a slice off the roll every sub-step.
  if (vn >= 0) return
  const keep = Math.max(0, 1 - self.friction)
  // Below a crawl the normal part stops coming back — the exe's own threshold
  // (`BOUNCE_CUTOFF`), and without it a discrete step bounces for ever.
  const e = -vn > BOUNCE_CUTOFF ? self.restitution : 0
  shot.vx = (shot.vx - vn * normal.x) * keep - e * vn * normal.x
  shot.vy = (shot.vy - vn * normal.y) * keep - e * vn * normal.y
  shot.vz = (shot.vz - vn * normal.z) * keep - e * vn * normal.z
  // A grenade in the original never quite stops rolling, so "resting" is only
  // for what DRAWS it and the bar is low.
  shot.resting =
    Math.abs(shot.vx) + Math.abs(shot.vy) + Math.abs(shot.vz) < fromExeSpeed(1)
}
