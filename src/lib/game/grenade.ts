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
  GROUND_DEFAULT,
  PLAIN_GRAVITY,
  TILE_MATERIALS,
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
  /** Row **+0x20** and **+0x22** — the projectile body's OWN physics material,
   * set in the constructor (0x4323e2) and multiplied by the surface's the way
   * a pig's is. See `lobBounce`. */
  friction: number
  restitution: number
}

/**
 * The grenade family, skills 19–27 — nine of them, and their rows are all but
 * identical. 26 is the odd one: half the row's +0x04 and no +0x08, which is
 * whatever those two fields drive (they feed effect 0x5D at 0x436665).
 */
const LOBS: Record<number, Lob> = {
  /** 19 GRENADE — the plain one. Friction 0.30, restitution 0.80, so 0.12 and
   * 0.32 against grass: a few hops and then a long roll. */
  19: { id: 412, kind: 24, speed: 300, fuse: 150, damage: 3840, blast: 1024, friction: 1228 / FIXED, restitution: 3276 / FIXED },
  20: { id: 413, kind: 25, speed: 300, fuse: 150, damage: 3840, blast: 1024, friction: 1228 / FIXED, restitution: 3276 / FIXED },
  21: { id: 414, kind: 26, speed: 300, fuse: 150, damage: 2560, blast: 512, friction: 2048 / FIXED, restitution: 3276 / FIXED },
  22: { id: 415, kind: 27, speed: 300, fuse: 150, damage: 1920, blast: 512, friction: 2048 / FIXED, restitution: 3276 / FIXED },
  23: { id: 416, kind: 28, speed: 300, fuse: 150, damage: 1920, blast: 512, friction: 2048 / FIXED, restitution: 3276 / FIXED },
  24: { id: 417, kind: 29, speed: 300, fuse: 150, damage: 7680, blast: 1536, friction: 2048 / FIXED, restitution: 3276 / FIXED },
  25: { id: 418, kind: 30, speed: 300, fuse: 150, damage: 3840, blast: 1024, friction: 2048 / FIXED, restitution: 3276 / FIXED },
  /** 26 is the odd one twice over: half the row's +0x04 and no +0x08, and a
   * material of 0.001 on both — it STICKS where it lands. */
  26: { id: 419, kind: 31, speed: 300, fuse: 150, damage: 5120, blast: 1024, friction: 4 / FIXED, restitution: 4 / FIXED },
  27: { id: 420, kind: 32, speed: 300, fuse: 150, damage: 3840, blast: 1024, friction: 1228 / FIXED, restitution: 3276 / FIXED }
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
 * How a grenade meets the ground: its OWN pair off its own row, multiplied by
 * the surface's, exactly the way a pig's is.
 *
 * **This replaces a wrong read, and play found it: "граната не должна прыгать
 * как на батуте… о сушу прыгает как от воды."** The old version had the pair
 * at 0xFFF/0x200 — restitution 0.9998 — taken from `[esi+0x28]`/`[esi+0x24]`
 * in the lobbed collision arm (0x4158f3), and said they REPLACED the surface's
 * own. Both halves were wrong:
 *
 * - `+0x24`, `+0x26` and `+0x28` are read and written as three consecutive
 *   WORDS, and copied as a group into three globals (0x415cc5..0x415cde) —
 *   they are a VECTOR on the query record that `0x4156d0` fills, not a
 *   friction/restitution pair. The record is a segment test: `+0x1c..0x20` is
 *   its start, `+0x3c..0x40` its end, `+0x34` a squared length. Nothing there
 *   is a material.
 * - The 0.01/0.99 pair that DOES go through `0x416560` (0x41564c) is the WALL,
 *   which this repo already had right in `ballistics.ts`, and it is reached
 *   only when the contacting body's owner is type **0x1357 — a pig**
 *   (0x40e964). A thrown thing never gets it, so a grenade off a wall tile
 *   takes the tile's own numbers like anything else.
 *
 * What a projectile actually brings is row **+0x20** and **+0x22**, handed to
 * `0x416560` on its own body in the constructor (0x43239b..0x4323e2, and the
 * push order makes +0x20 the friction). For the plain grenade that is **0.30
 * and 0.80**; against grass (tile 0, 0.40/0.40) the solver's multiply
 * (0x40f690) gives **0.12 friction and 0.32 restitution**. Which is the whole
 * behaviour play describes in one line: it hops a few times rather than
 * trampolining, and then rolls a long way because 0.12 is very little friction.
 *
 * Skill 26's kind is the odd one at 0.001/0.001 — it does not bounce at all.
 */
export const lobBounce = (row: Lob): Bounciness => ({
  friction: row.friction,
  restitution: row.restitution
})

/** What the SURFACE brings, for a thrown thing: the tile's own pair and
 * nothing else. Deliberately not `groundMaterial`, whose wall override belongs
 * to the pig alone. */
export const lobSurface = (tileType: number): Bounciness =>
  TILE_MATERIALS[tileType & 0x1f] ?? GROUND_DEFAULT

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
 * Water is not a surface for a thrown thing: it GOES IN.
 *
 * **And the engine says so outright, which took a proper look to find.** Water
 * is bit **6** of the tile byte — not the 0x80 the wall uses — and the
 * projectile's own handler for it is at 0x437a57:
 *
 * ```
 * 437a57  cl = [map + tile*4 + 0x13B0E]
 * 437a5e  cl >>= 6 ; cl &= 1            ; the WATER bit
 * 437a6a  if (!water) -> 0x437BE9        ; nothing
 * 437aa8  0x4A5140(x, z)                 ; the water HEIGHT, into the y
 * 437ad2  Sound::Play(0x28, 100, 100)    ; the splash
 * 437ae4  the tile's bit 15 picks id 0x1AD or 0x1AC
 * 437b46  0x431F00(...)                  ; a SPLASH projectile at the surface
 * ```
 *
 * There is no bounce anywhere in it, no material, and nothing that stops the
 * thrown thing: the engine drops a splash at the water line and the grenade
 * carries on down. So `SKIPS_ON_WATER` and `WATER_BOUNCE` are both gone — the
 * skip play asked for is a LAND behaviour, which falls out of 0.12 friction on a
 * flat throw, and water is what play has been shouting for: "граната НЕ ТОНЕТ В
 * ВОДЕ, должна прям тонуть и идти вниз."
 */
export const WATER_SPLASH_SOUND = 0x28

/**
 * One frame of going down through water. It keeps falling — gravity does that —
 * and only its sideways travel is damped.
 *
 * `SINK_DRAG` is the remake's: the exe's splash arm does not touch the
 * projectile's velocity at all, so nothing says how fast a grenade sinks. The
 * VERTICAL is deliberately untouched, because damping the one component gravity
 * works through is what once left a grenade standing on the water.
 */
export const SINK_DRAG = 0.88
export function sinkLob(shot: Lobbed, delta: number): void {
  shot.sunk = true
  const damp = Math.max(0, 1 - (1 - SINK_DRAG) * delta * 60)
  shot.vx *= damp
  shot.vz *= damp
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
  /** Which tile is under the contact. The surface brings its own half of the
   * pair and the solver MULTIPLIES the two (0x40f690) — which is the whole
   * reason a grenade behaves differently on stone and on sand, and why the old
   * version that ignored this bounced off land the way it bounced off water. */
  tileType: number,
  _blocked: boolean,
  /** What the projectile brings — its row's own pair (`lobBounce`). */
  self: Bounciness
): void {
  shot.y = y
  const vn = shot.vx * normal.x + shot.vy * normal.y + shot.vz * normal.z
  // Already leaving: there is no contact to resolve, and resolving it anyway
  // is what took a slice off the roll every sub-step.
  if (vn >= 0) return
  const ground = lobSurface(tileType)
  const friction = self.friction * ground.friction
  const restitution = self.restitution * ground.restitution
  // Below a crawl the normal part stops coming back — the exe's own threshold
  // (`BOUNCE_CUTOFF`), and without it a discrete step bounces for ever.
  const e = -vn > BOUNCE_CUTOFF ? restitution : 0
  // The tangential, and how fast it is going along the surface.
  const tx = shot.vx - vn * normal.x
  const ty = shot.vy - vn * normal.y
  const tz = shot.vz - vn * normal.z
  const slide = Math.hypot(tx, ty, tz)
  /**
   * **Friction is a Coulomb IMPULSE, and this used to be a flat fraction of the
   * sliding speed.** Play kept saying so — "трение всё ещё очень жёсткое,
   * гранаты не катаются совсем" — and the solver settles it: it normalises the
   * tangential (`0x4110c1`, after the epsilon test at 0x411084) and takes the
   * friction product in as a SCALAR alongside the normal impulse (0x40f980),
   * while restitution enters as the standard `(1 + e)` (0x40f6b4, where
   * `[0x4BC1B4]` is −1). A direction times a scalar cannot be a fraction of the
   * sliding speed.
   *
   * Which is the whole difference for ROLLING. A grenade at rest on flat ground
   * meets the surface every frame with only gravity's own increment behind it,
   * so the friction impulse available is tiny and it keeps going for seconds;
   * `v * (1 - 0.12)` took an eighth off every frame no matter how gently it was
   * resting, and stopped it dead in half a second.
   *
   * The magnitude below is the textbook form the solver's shape implies —
   * `mu * (1 + e) * |vn|`, capped at what would stop the slide, since friction
   * cannot reverse it. The `(1 + e)` and the mu are read; that they multiply is
   * the inference, and it is the only one here.
   */
  const bite = Math.min(slide, friction * (1 + e) * -vn)
  const keep = slide > 0 ? Math.max(0, 1 - bite / slide) : 0
  shot.vx = tx * keep - e * vn * normal.x
  shot.vy = ty * keep - e * vn * normal.y
  shot.vz = tz * keep - e * vn * normal.z
  // A grenade in the original never quite stops rolling, so "resting" is only
  // for what DRAWS it and the bar is low.
  shot.resting =
    Math.abs(shot.vx) + Math.abs(shot.vy) + Math.abs(shot.vz) < fromExeSpeed(1)
}
