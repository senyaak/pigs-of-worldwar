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
// `weapons/fire.md`.
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
import { PIG_RADIUS } from './obstacles'

/**
 * What a burst throws out — the shape both scattering destructors share.
 *
 * They differ in five numbers and nothing else, so they are five fields
 * rather than two branches:
 *
 * | | CLUSTER (0x43290E) | MORTAR (0x4339A6) |
 * | - | - | - |
 * | child | bomblet, id 421 | sub-shell, id 399 |
 * | ring | four at 0x3E8 (≈88°) | three at 0x3B6 (83.5°) |
 * | yaw step | 0x400 — a quarter turn | 0x555 — a third |
 * | upright | one more, dead vertical at 0x400 | none |
 * | seeded | no, the loop starts at 0 | yes, off the shell's own yaw |
 *
 * Both step the spawn HEIGHT by 40 per child so none is born inside the one
 * before it, and both throw at FULL charge.
 */
export interface Scatter {
  /** The pseudo-skill each child flies as — `BOMBLET`, `SUB_SHELL`. */
  child: number
  /** How many go round, and the pitch they all leave at. */
  count: number
  aim: number
  /** The yaw between them, in the engine's 4096 to a turn. */
  step: number
  /** One MORE child thrown at this pitch and no yaw at all, or 0 for a family
   * that has none. The cluster's dead-vertical fifth. */
  upright: number
  /** Whether the ring is measured off the PARENT's own yaw (0x433af3 adds
   * `[proj+0x94]`) or world-aligned (the cluster's loop, whose four-way
   * symmetry hides which it is). */
  seeded: boolean
  /** Spawn heights stepped this far apart, in the order the exe makes them. */
  lift: number
}

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
  /**
   * Row **+0x14** — the frames of state 0 the thing spends before its fuse
   * starts, and it is per-row rather than the constant this used to be: three
   * for every grenade, **fifty for TNT and the firecracker**. Row +0x14 is also
   * the switch: nil sends the constructor straight into the fuse, which is what
   * a tripped mine does (lib/game/mines.ts).
   */
  arming: number
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
   * +0x08 that a first reading took. **And +0x08 is followed now**: it is the
   * FORCE (`force` below), which nothing but the throw reads.
   */
  blast: number
  /**
   * Row **+0x08** — the FORCE, which is how hard the burst THROWS and is a
   * column of its own rather than anything derived from the damage
   * (lib/game/blast.ts, `flingSpeed`). `0x487AD0`'s sixth argument, kept at
   * `[effect+0x64]` and read by the phantom sweep alone.
   *
   * **It is 0 on everything that must not shove**: the three gases and the
   * MEDICINE BALL carry a real zero there, which is the same fact as their
   * phantom's push flag being clear.
   */
  force: number
  /** Row **+0x20** and **+0x22** — the projectile body's OWN physics material,
   * set in the constructor (0x4323e2) and multiplied by the surface's the way
   * a pig's is. See `lobBounce`. */
  friction: number
  restitution: number
  /**
   * **Whether it goes off the moment it TOUCHES something**, rather than on a
   * fuse — and it is read off the state machine rather than declared.
   *
   * The constructor picks the initial state from row +0x14 (0x43200c): non-zero
   * starts it in state 0, the arming count, which every grenade takes. **Nil
   * takes the other branch** — `ecx = [proj+0xA2]`, row +0x1C's low byte,
   * through the jump table at 0x432590 into states 2, 3, 1, 4, 5. The bazooka's
   * +0x1C is 0, so it starts in **state 2**, and states 2 and 3 are the two arms
   * of the update that do nothing at all (0x436150). It has no fuse to run.
   *
   * What ends it is the landscape handler, three instructions into its
   * not-water branch:
   *
   * ```
   * 437f1d  eax = [proj+0xB4]          ; the state
   * 437f2c  cmp eax,2
   * 437f2f  jne short 00437F37h
   * 437f31  mov [esi+0B4h],ecx         ; ...ecx is 6 -> [proj+0x31] = 1, finished
   * ```
   *
   * — and the destructor is where the blast is. So state 2 IS the
   * contact-detonating class. (`[+0xA2]` of 3 or 4 is destroyed on contact by
   * the same block, two instructions further on; those are other rows.)
   */
  contact: boolean
  /**
   * **Whether it STREAMS the poison cloud instead of bursting.**
   *
   * The projectile update's every-5th-frame dispatcher (0x4365a2, byte map
   * 0x436D08) has kind 28 spawn effect 0x5E at the canister's own position
   * from frame 15 of the flight on, and its destructor arm spawns one last
   * 0x5E with **no 0x54 blast at all** — the row's `damage` is the cloud's
   * flat contact figure, not a burst's, and its +0x08 force is nil, so the
   * gas pushes nobody (`weapons/gas.md` in the disasm repo, 2026-08-27).
   * `lib/game/gas.ts` is the stream; `lobs.ts` branches on this flag at the
   * one detonation seam.
   *
   * Deliberately NOT on 23 CONFUSION though the exe's is the same projectile:
   * its own status is not built, and play has not ruled whether the PC's
   * "confusion gas poisons" is the game or a port accident.
   */
  gas?: boolean
  /**
   * The EFFECT id this row's destructor spawns, when it is not the grenade
   * family's own 0x54 — the bomblet's 0x47 (parameter row 6). Absent means
   * 0x54 (lib/game/blast.ts, `Charge.effect`).
   */
  effect?: number
  /**
   * **What the burst THROWS OUT on top of its own blast**, or absent for the
   * rows that only go off.
   *
   * Two weapons in this table carry one and their destructors are the same
   * arm written twice — a blast, a sound, then a `ebp += step` loop of
   * `new(0xD0)` children at a fixed pitch with the yaw stepped each time
   * (`Scatter` below has the fields). The CLUSTER's is kind 25's at
   * 0x43290E, the MORTAR's kind 42's at 0x4339A6; both read out of the exe,
   * `weapons/cluster.md` in the disasm repo. `lobs.ts` throws them at the
   * one detonation seam.
   */
  scatter?: Scatter
  /**
   * **Whether the burst PUTS POINTS ON instead of taking them off.**
   *
   * Kind 37's destructor arm (0x4331D1) spawns effect **0x60** with the row's
   * own radius, force and amount, and 0x60's arm inside `Pig::OnHit`
   * (0x4778C6) is `min(deficit, falloff)` through `Pig::Heal` — the same
   * falloff every blast runs (`blastShare`), the same quarter rim. Its force
   * is 0 and the id sits in the GAS group's phantom flags (Init 0x489A00,
   * ids 0x5D..0x60): **no push, and no line of sight — it heals through
   * walls.** The arm's own gate (0x4778D8) lets a ZERO heal through when the
   * status word is set, so a full-health poisoned pig in the cloud is cured.
   * `lobs.ts` branches on this at the one detonation seam, into `mend`
   * (lib/game/blast.ts). Read out of the exe 2026-08-28.
   */
  heals?: boolean
}

/**
 * The grenade family, skills 19–27 — nine of them.
 *
 * **The kinds do NOT follow the skills in order, and this table had them
 * crossed for a fortnight.** Field +0x10 of the 80-byte skill record
 * (0x4d7300 + skill·80) is the projectile id, kind = id − 388, and read out
 * of the exe (2026-08-27, `weapons/gas.md` in the disasm repo): 21→29,
 * 22→31, 23→28, 24→26, 25→27, 26→28. So HIGH EXPLOSIVE really is the heavy
 * one (60 points over half again a grenade's field), the 0.001/0.001
 * material is the ROLLER's — near-zero friction is WHY it rolls for ever —
 * and CONFUSION and POISON are the SAME projectile, id 416: same flight,
 * same cloud, apart only in text and icon. Kind 30 (the family's one
 * speed-500 row) is id 418, which no skill claims.
 */
const LOBS: Record<number, Lob> = {
  /** 19 GRENADE — the plain one. Friction 0.30, restitution 0.80, so 0.12 and
   * 0.32 against grass: a few hops and then a long roll. */
  19: { id: 412, kind: 24, speed: 300, fuse: 150, arming: 3, damage: 3840, blast: 1024, force: 2600, friction: 1228 / FIXED, restitution: 3276 / FIXED, contact: false },
  /** 20 CLUSTER GRENADE — a grenade's own flight and blast, plus the five
   * bomblets its destructor lets go (`scatter` above). Its own pop is effect
   * **0x46** (0x43290E), which resolves to parameter row 0 like the
   * grenade's 0x54, so the picture is the same and the id is kept for
   * faithfulness' sake. Worst case on one body: 30 + 5×15. */
  20: { id: 413, kind: 25, speed: 300, fuse: 150, arming: 3, damage: 3840, blast: 1024, force: 2600, friction: 1228 / FIXED, restitution: 3276 / FIXED, contact: false, effect: 0x46, scatter: { child: 0x100, count: 4, aim: 0x3e8, step: 0x400, upright: 0x400, seeded: false, lift: 40 } },
  /** 21 HIGH EXPLOSIVE — sixty points at the core over a 1536 field: the
   * heaviest thing a pig throws. */
  21: { id: 417, kind: 29, speed: 300, fuse: 150, arming: 3, damage: 7680, blast: 1536, force: 3900, friction: 2048 / FIXED, restitution: 3276 / FIXED, contact: false },
  /** 22 ROLLER — a grenade's forty points on a material of 0.001/0.001:
   * nothing bounces and nothing slows, so it ROLLS, which is the weapon. */
  22: { id: 419, kind: 31, speed: 300, fuse: 150, arming: 3, damage: 5120, blast: 1024, force: 2600, friction: 4 / FIXED, restitution: 4 / FIXED, contact: false },
  /** 23 CONFUSION — id 416, the SAME projectile as 26 POISON (the status is
   * not built; until it is, this bursts as a stand-in). */
  23: { id: 416, kind: 28, speed: 300, fuse: 150, arming: 3, damage: 1920, blast: 512, force: 0, friction: 2048 / FIXED, restitution: 3276 / FIXED, contact: false },
  24: { id: 414, kind: 26, speed: 300, fuse: 150, arming: 3, damage: 2560, blast: 512, force: 0, friction: 2048 / FIXED, restitution: 3276 / FIXED, contact: false },
  25: { id: 415, kind: 27, speed: 300, fuse: 150, arming: 3, damage: 1920, blast: 512, force: 0, friction: 2048 / FIXED, restitution: 3276 / FIXED, contact: false },
  /** 26 POISON — the canister that STREAMS (`gas` above): fifteen flat at the
   * touch, the poison bit after, and no blast at the pop. */
  26: { id: 416, kind: 28, speed: 300, fuse: 150, arming: 3, damage: 1920, blast: 512, force: 0, friction: 2048 / FIXED, restitution: 3276 / FIXED, contact: false, gas: true },
  27: { id: 420, kind: 32, speed: 300, fuse: 150, arming: 3, damage: 3840, blast: 1024, force: 2600, friction: 1228 / FIXED, restitution: 3276 / FIXED, contact: false },
  /** 33 MEDICINE BALL — the MEDIC's thrown AREA heal, every field read out of
   * the exe's own row (kind 37, VA 0x4C25F8, 2026-08-28): a grenade's throw
   * (gauge, clip 19) on a BOUNCIER material (0.5/0.8 against the grenade's
   * 0.3/0.8), arming 2 under the same 150-frame fuse, and forty points over a
   * 2048 field that HEAL (`heals` above) — full inside the 512 core, down to
   * a quarter at the rim, clamped to each body's own deficit. */
  33: { id: 425, kind: 37, speed: 300, fuse: 150, arming: 2, damage: 5120, blast: 2048, force: 0, friction: 2048 / FIXED, restitution: 3276 / FIXED, contact: false, heals: true },
  /**
   * **37 TNT — PLANTED, not thrown**, and its row says so in three places: a
   * speed of 50 where a grenade has 300 and no power gauge to multiply it by, so
   * `speed * charge >> 12` with the charge of 1 a press hands over
   * (`weapons/fire.md`) is nothing at all — it goes down at the pig's own feet.
   * A material of 0.0999 on both halves, so it does not roll off. And fifty
   * frames of arming under a 125-frame fuse: **175 frames, which is seven
   * seconds at the engine's 25 Hz**, against the four the turn gives you to get
   * clear (lib/game/spend.ts). Do not write that as a number of seconds
   * anywhere — it rides `EXE_FRAME_SECONDS`, and two specs went red the day
   * that knob moved.
   *
   * Fifty points at the core over 2048 of blast — twice a grenade's reach, and
   * enough to kill a grunt outright where a grenade takes thirty off it.
   */
  37: { id: 441, kind: 53, speed: 50, fuse: 125, arming: 50, damage: 6400, blast: 2048, force: 5200, friction: 409 / FIXED, restitution: 409 / FIXED, contact: false },
  /**
   * **29 BAZOOKA — the one thing here that goes off on TOUCH.** Play asked for
   * it whole: "продектайл со своей анимацией, звук выстрела, урон при касании —
   * важно в воде не взрывается, а тонет."
   *
   * Its row is kind **10**, and every field of it separates the rocket from the
   * grenades above. Speed **500** a frame at full charge where a grenade has
   * 300. Damage **5120** — forty points, enough to leave a grunt with ten — over
   * a blast field of 2048, twice a grenade's, so the same reach as TNT. Friction
   * and restitution 0.0999 apiece, which never matters: it does not live long
   * enough to bounce. And **arming 0 with a fuse of 0**, which is not "a fuse of
   * nothing" but the switch into `contact` above.
   *
   * The rocket wears **`WE_BAZZ`** — name-table row 398, out of the MAP's own
   * archive like every other spawned model (lib/game/ammo.ts) — and the report
   * is index **0x24 `L_BAZOO`** at 100/100, straight off the fire arm
   * (0x47ae9d..0x47aea3).
   */
  29: { id: 398, kind: 10, speed: 500, fuse: 0, arming: 0, damage: 5120, blast: 2048, force: 3900, friction: 409 / FIXED, restitution: 409 / FIXED, contact: true },
  /**
   * **28 MORTAR — the BOMBARDIER's own weapon, and it is an AIRBURST that is
   * thrown rather than a grenade.** Kind **42** (record +0x10 is 430), read
   * whole 2026-09-01 with the rest of it: speed **500** like the rocket,
   * damage **6400 — fifty points** over a blast field of 2048, the bazooka's
   * 0.0999 material, and **arming 0 under a fuse of 0**, which is the switch
   * into `contact`. So the shell itself is a heavier rocket.
   *
   * Then its destructor (0x4339A6) throws **three sub-shells** almost
   * straight up, a third of a turn apart off the shell's own yaw
   * (`scatter`) — 50 + 3×20 = **110 on one body** at the worst.
   *
   * **It has NO POWER GAUGE**: record +0x14 is 0 and skill 28 is absent from
   * the gauge list at 0x493796, so the press fires it at once — the ANGLE is
   * the whole of the aim, and it cannot be pointed below 45° (`FLOOR_LOB` in
   * lib/game/aim.ts). What charge the exe then flies it at is the one open
   * number: the no-gauge branch writes 1, and `speed * 1 >> 12` is nothing,
   * so a mortar would drop at the pig's trotters. It does not in the game,
   * and `weapons/fire.md` already carries the same hole for every gun; the
   * remake fires a no-gauge lob that is NOT planted at FULL charge
   * (lib/game/attack.ts). `[play]` over the reading, the way the guns are.
   *
   * The shell wears **`WE_BAZZ`** — name-table row 430, the rocket's own mesh
   * again (lib/game/ammo.ts) — and the report is index **0x29** at 100/100
   * off the fire arm (0x47ade5).
   */
  28: { id: 430, kind: 42, speed: 500, fuse: 0, arming: 0, damage: 6400, blast: 2048, force: 3900, friction: 409 / FIXED, restitution: 409 / FIXED, contact: true, effect: 0x58, scatter: { child: 0x101, count: 3, aim: 0x3b6, step: 0x555, upright: 0, seeded: true, lift: 40 } },
  /** The CLUSTER's bomblet, keyed by the `BOMBLET` pseudo-skill (0x100,
   * declared below the table — a literal key because the table comes first).
   * Kind 33's own row: fifteen points over 1300, a 0.40/0.80 material. */
  0x100: { id: 421, kind: 33, speed: 250, fuse: 150, arming: 3, damage: 1920, blast: 1300, force: 1300, friction: 1638 / FIXED, restitution: 3276 / FIXED, contact: false, effect: 0x47 },
  /** …and the MORTAR's sub-shell, `SUB_SHELL` (0x101), on kind **11**'s row:
   * twenty points over 1024, the same 0.0999 material as the shell that made
   * it, and ONE frame of arming under no fuse at all — so it goes off on
   * whatever it touches from the second frame of its own flight. Effect
   * **0x4A** (0x433249), the dry crack the bomblet draws. */
  0x101: { id: 399, kind: 11, speed: 250, fuse: 0, arming: 1, damage: 2560, blast: 1024, force: 1300, friction: 409 / FIXED, restitution: 409 / FIXED, contact: true, effect: 0x4a }
}

/**
 * The BOMBLET — what a cluster grenade bursts into. No pig ever HOLDS one,
 * so its key is a pseudo-skill safely past the table (skills end at 66):
 * everything downstream that asks a lob's row by skill — the physics, the
 * detonation, the model — answers for it through this one number.
 *
 * The row is kind 33's, read whole (VA 0x4C2030 + 33·40): speed 250, the
 * family's 150-frame fuse behind 3 frames of arming, FIFTEEN points over a
 * 1300 field (effect 0x47 — parameter row 6, a dry crack of sparks with no
 * fireball), material 0.40/0.80. It bounces, rolls and bursts on its own
 * clock exactly like the grenade it fell out of.
 */
export const BOMBLET = 0x100

/**
 * …and the MORTAR's SUB-SHELL, on the same footing: id 399 `WESUBB`, kind 11,
 * never in anybody's hands, so it takes the next pseudo-skill along.
 */
export const SUB_SHELL = 0x101

/** One child a scattering burst lets go, in the order the exe MAKES them —
 * which is what decides the spawn height each is given. */
export interface Shard {
  skill: number
  /** Radians, the engine's own heading. */
  heading: number
  /** The exe's 4096-to-a-turn pitch, straight through to `lob`. */
  aim: number
  /** How far ABOVE the burst it is born: `lift` times its place in the
   * order, so none is inside the one before it. */
  rise: number
}

/**
 * What this burst throws out, HEAD FIRST — or null for a row that only goes
 * off.
 *
 * The head is the one the CAMERA rides, and both destructors re-seat on the
 * LAST child they make (0x432BA8 for the cluster, 0x433C45 for the mortar):
 * the cluster's dead-vertical fifth, the mortar's third round the ring. So
 * the rule is one line — the upright where there is one, the end of the ring
 * where there is not — and `lobs.ts` need only push them in the order given
 * for `head()` to be looking at the right thing.
 */
export function shardsOf(row: Lob, heading: number): Shard[] | null {
  const scatter = row.scatter
  if (!scatter) return null
  const from = scatter.seeded ? heading : 0
  const ring: Shard[] = []
  for (let i = 0; i < scatter.count; i++) {
    ring.push({
      skill: scatter.child,
      heading: from + ((i * scatter.step) / AIM_UNITS) * 2 * Math.PI,
      aim: scatter.aim,
      rise: i * scatter.lift
    })
  }
  if (!scatter.upright) return [ring[ring.length - 1], ...ring.slice(0, -1)]
  const up: Shard = {
    skill: scatter.child,
    heading: 0,
    aim: scatter.upright,
    rise: scatter.count * scatter.lift
  }
  return [up, ...ring]
}

/**
 * The explosives a pig PLANTS rather than throws — 35 MINE, 36 ANTI-PERSONNEL
 * MINE, 37 TNT, 38 FIRECRACKER.
 *
 * A real family with two witnesses in the exe rather than a convenience: they
 * are the four skills whose record clears the "go into WALK AWAY" flag, and the
 * two that carry a WAIT are among them (lib/game/spend.ts). None of the four
 * charges, none of them aims, and what each leaves behind stays where the pig
 * put it. **35 and 36 are here without a row above**: they leave a bit in the
 * ground instead of a thing with a fuse (lib/game/mines.ts), and this answers for
 * them so the control set is right the day they land.
 */
const PLANTED = new Set([35, 36, 37, 38])

/** Whether this skill is planted at the pig's feet. */
export const isPlanted = (skill: number | null): boolean =>
  skill !== null && PLANTED.has(skill)

/**
 * WHEN in the laying animation the charge actually appears — phase **1314** of
 * 4096, near enough a third of the way through.
 *
 * Play: "ТНТ ставится на землю — с анимацией." It is not a decoration over the
 * placing: the clip's own key-frame EVENT is what places it. All four planted
 * skills carry attack clip **77** (the record's +0x20), the clip is "Lay Mine",
 * and its event list — `afGetKeyFrameList`, `_d3d.dll` 0x1002c778 + clip*88, the
 * same table the bayonet's four strikes come out of (`weapons/melee.md`) — is
 *
 * ```
 *  584  id 2     ; a footstep (lib/game/footsteps.ts) -- the 0x2d beside it is
 *                ; the VOLUME the arm pushes, not a sound index
 * 1314  id 65    ; -> Pig::Shoot (0x479f60) -- THE CHARGE GOES DOWN
 * 3796  id 2     ; ...and the same foot again, standing back up
 * ```
 *
 * Event 65's arm is three instructions (0x474da8) and the middle one is the shot
 * itself, so a planted charge appears when the pig has bent over — not when the
 * button was pressed, and not when the clip ends.
 */
export const PLANT_PHASE = 1314

/** What this skill lobs, or null for everything that does not lob. */
export const lobOf = (skill: number | null): Lob | null =>
  skill === null ? null : (LOBS[skill] ?? null)

/** Whether this skill is thrown rather than shot — what the fire button and
 * the gauge both ask. */
export const isLobbed = (skill: number | null): boolean => lobOf(skill) !== null

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
  row.contact
    ? // Nothing counts one down: it sits in state 2 until something stops it.
      Number.POSITIVE_INFINITY
    : fromExeFrames(row.arming + row.fuse + Math.floor(random() * (FUSE_JITTER + 1)))

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
 * `[effect+0x60] + [[body+0x18]+0x4C]+0x0C − 512`.
 *
 * **And that middle term is read now** (2026-08-11): `[body+0x18]` is the
 * struck body's own record and `+0x4C` its COLLIDER, whose `+0x0C` is the
 * radius the shape table wrote there (0x4A90A0). So it is "how big the thing
 * being hit is" — 0xAA for a pig, straight out of the same table its body comes
 * from — which is why it rides `MODEL_SCALE` here like every other body length
 * (`PIG_RADIUS`, lib/game/obstacles.ts).
 */
export const BLAST_BIAS = 512

/** How far the falloff runs for a blast of this size — the exe's own divisor,
 * measured against a PIG, which is what every blast in this engine is measured
 * against. A MINE has a blast and no row (lib/game/mines.ts), which is why the
 * number comes in on its own. */
export const blastReach = (blast: number): number =>
  Math.max(0, blast + PIG_RADIUS - BLAST_BIAS)

/** …and the same, for a row that carries one. */
export const blastRange = (row: Lob): number => blastReach(row.blast)

/** The share of the core damage a body at this distance takes, 0..1 — and it
 * never falls below a quarter inside the range. */
export function blastShare(distance: number, range: number): number {
  if (range <= 0) return 1
  const past = Math.max(0, distance - BLAST_CORE)
  // **THE RIM IS THE RANGE, and past it there is nothing.** Play: "у динамита
  // радиус слишком большой — я отхожу задом все 4 секунды, а меня всё равно
  // задевает." Measured: they were about 2400 units out and took 4 points.
  //
  // The formula is a ramp from the core to a QUARTER at exactly `past = range`,
  // which is the rim the exe designs — "never to nothing, which is why standing
  // back helps and hiding does not". This engine went on evaluating it past its
  // own divisor to where the line crosses zero, `512 + 4·range/3`, and used THAT
  // as the reach. The gap between the two is the RANGE's own size, which is why
  // only TNT was ever complained about: a grenade loses under a hundred units by
  // this and TNT loses four hundred.
  //
  // **And the exe's own WHO is now READ, and it lands on this same rim.** The
  // blast-push session (`weapons/fire.md` in the disasm repo, the force-column
  // read) found the damage reaches a pig through the PHANTOM SWEEP at the
  // row's own +0x04 radius, not through the 35-sphere body contact — and the
  // sweep's edge, radius + the struck body's own, is EXACTLY where the
  // falloff's quarter-rim sits (radius + body − 512 = the divisor, so
  // `past = range` at the edge). The exe deals a quarter of the core at its
  // last touchable point and nothing past it; this clamp is that limiter to
  // the unit. `unit/reach.spec.ts` pins the table — asked for by play when a
  // TNT's honest 21 points at three and a half tiles read as a bug.
  if (past > range) return 0
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
 * The ROLLER's kind is the odd one at 0.001/0.001 — nothing bounces and
 * nothing slows, so it rolls (the table above has the corrected map).
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
  /** What names it outside the engine (lib/game/projectile.ts says why). Handed
   * out by `createLobs`. */
  id: number
  skill: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** The yaw it was thrown on — `[proj+0x94]`, which the exe keeps and reads
   * back when a destructor SCATTERS off it (0x433af3, the mortar's ring).
   * Nothing else asks: the flight is in the velocity. */
  heading: number
  /** Seconds left. It runs from the THROW and nothing resets it on landing:
   * state 1 is entered three frames in and only ever leaves for state 6. */
  fuse: number
  /** Seconds since the throw — what the brain's PLANNED press is measured
   * against (lib/game/grunt.ts). */
  age: number
  /** Whether it has stopped moving. Only for what draws it; the fuse does not
   * care. */
  resting: boolean
  /** Whether water has DOUSED it. The engine's own arm sets the projectile's
   * quiet flag and the destructor's first test then spawns no effect and plays
   * no sound (0x4328c9), so it leaves without going off — `WATER_DOUSE_SPEED`
   * has the read. Nothing bounces or explodes once this is set: it sinks. */
  doused: boolean
  /** Seconds of sinking left, and only a doused one has any
   * (`WATER_SINK_SECONDS`). */
  sinking: number
  /** The pig that threw or planted it — set beside `id` by `createLobs`, so
   * its blast's kills can be tallied against their attacker
   * (lib/game/events.ts, `killed`). A spec-built lob has none. */
  owner?: number
}

// A thrown thing does NOT tumble. An end-over-end spin was built here as a
// `[CHECK — remake]` (2026-08-28, `Lobbed.spin` + TUMBLE_TURNS) and play
// revoked it the same day — "она крутится в воздухе криво… граната по сути
// шар, лучше убрать" — which is also what the read always allowed: nothing
// about a projectile's orientation is decoded, and the grenade model is
// symmetric anyway. The rocket's nose-on-velocity stays (three/grenades.ts);
// do not rebuild the tumble without a fresh ruling.

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
    id: 0,
    skill,
    x: from.x,
    y: from.y,
    z: from.z,
    // Forward is (sin h, cos h) as every step a pig takes is, and UP is a
    // SMALLER y.
    vx: Math.sin(heading) * flat,
    vy: -Math.sin(pitch) * speed,
    vz: Math.cos(heading) * flat,
    heading,
    fuse: fuseSeconds(row, random),
    age: 0,
    resting: false,
    doused: false,
    sinking: 0
  }
}

// WATER IS NOT A SURFACE for a thrown thing: it GOES IN. There is no bounce
// anywhere in the water arm, no material, and nothing that stops the thrown
// thing, which is why `SKIPS_ON_WATER` and `WATER_BOUNCE` are both gone — the
// skip play asked for is a LAND behaviour, out of 0.12 friction on a flat throw,
// and water is what play has been shouting for: "граната НЕ ТОНЕТ В ВОДЕ,
// должна прям тонуть и идти вниз."
//
// **CORRECTION, and it cost this file a constant.** The block that used to sit
// here — 0x437a57, "water is bit 6 of the tile byte", `Sound::Play(0x28)` "the
// splash", `WATER_SPLASH_SOUND` — is not about water at all. Bit 6 is the
// MINEFIELD flag; bit 5 is water (`0x4A6FA0` below tests 5, and 0x4a7000 tests 7
// for the wall, which settles the byte end to end); sound 0x28 is index 40 of
// `Audio/sfxday.srl`, **`L_MINETR`**; and what that block spawns is a mine going
// off. A grenade landing in a minefield sets it off — a rule this engine did not
// have (lib/game/mines.ts). The misreading survived a whole pass because "a
// splash at a height, on a flag next to the water flag" is a story that holds
// together. The BANK is what broke it.

/**
 * …and once it is in and slow, it is DOUSED — and does not go off.
 *
 * Play half-remembered this and was right: "я точно не помню, но по-моему даже
 * не взрываться". `0x437bfb` is the arm, gated on `0x4A6FA0(x, z)` — the map's
 * water test, tile flag **0x20** plus the art's own texel mask through
 * `[0x538128]`, which is the same pair `lib/game/watermask.ts` already builds.
 * Inside it:
 *
 * ```
 * 437c8c  cmp ax,96h                  ; [contact+0x14] against 150
 * 437c90  jb  0x437CCE                ; under it -> DOUSE
 * 437c9d  ...or kind 0x0C..0x17, 0x2C..0x2E, or [proj+0xA2] of 3 or 4
 * 437ccе  Sound::Play(0x19, 0x50, 0x5F + (rand & 0x1F))   ; 25 is FT_WATER
 * 437d26  0x487AD0(x, z, 0x0E, ...)   ; the splash effect
 * 437d34  [proj+0x84] = 1             ; the QUIET flag
 * 437d4b  0x4A9E50 ; 0x4A9EE0         ; ...and out of the world
 * ```
 *
 * **WHAT `[contact+0x14]` IS, is not settled, and this used to claim it was.**
 * What is read: `0x4377d0` is the projectile's `OnHitLandscape(contact)` — vtable
 * slot **+0x50**, called from the world's contact loop at 0x4a8b41 and only when
 * the other body's owner is the world itself; and `[contact+0x14]` is a scalar
 * filled at contact construction (0x409ca0 and the out-of-line 0x409af9), from
 * the creator's own argument, sitting between the contact's two three-float
 * vectors at +0x08..0x10 and +0x18..0x20. At least one creation site passes it
 * **zero** (0x407844).
 *
 * So calling it "the arrival speed" was a guess dressed as a transcription. It is
 * a scalar on a contact compared against 150, which is in the family of this
 * engine's per-frame speeds — and that is all that has been earned. The remake
 * uses the total speed because that is the only quantity it has that fits;
 * `dousedByWater` is therefore **half read and half inference**, and says so.
 *
 * And `[proj+0x84]` is the first thing the destructor tests — `4328c9 if (al)
 * jmp 0x4357F9` — the branch that spawns **no effects and plays no sound at
 * all**. So a grenade that goes quietly into water makes a splash, sinks, and
 * that is the end of it: no blast, no damage.
 *
 * A FAST one (150 or more a frame) takes 0x437e5d instead — a different sound
 * and effect, and the quiet flag is never set, so it carries on and still goes
 * off on its fuse.
 */
export const WATER_DOUSE_SPEED = fromExeSpeed(0x96)

/**
 * …and above that speed it SKIPS. **The frog is in the engine after all, and it
 * took being told twice to go and find it.**
 *
 * The arm the fast case takes, 0x437e5d, was skimmed and written off as "a sound
 * and an effect". Its last act is not either of those:
 *
 * ```
 * 437e99  Sound::Play(0x12, 0x3C, 0x5A + (rand & 0x3F))
 * 437ecb  0x487AD0(x, z, 0x0D, 0x3E8, ...)          ; the spray
 * 437ed6  fld [contact+0x14]
 * 437eea  ftol
 * 437ef2  imul 66666667h ; sar edx,1                ; ...divided by FIVE
 * 437ee5  push 400h
 * 437f0b  0x4A9260(scalar / 5, 0x400, 0, 0)
 * ```
 *
 * `0x4A9260(speed, angleA, angleB, ?)` sets a body's velocity — `[body+0x64]`,
 * the same field the integrator advances — along a direction built from two
 * angles in the engine's 4096-per-turn units (`[0x4BD778]` is 2π/4096). And
 * **0x400 is 1024 of 4096: exactly a quarter turn, straight UP.**
 *
 * The reading is pinned by `Pig::EjectFromWall`, which calls the pair one after
 * the other with the same speed — `0x4A9100(0x20, 0, bearing, 0)` for the
 * horizontal and `0x4A9260(0x20, 0x3B6, 0, 0)` for the near-vertical 83.5° that
 * pops the pig up and out (0x46fc65, 0x46fc77).
 *
 * So a fast contact with water gives the thing a kick straight up of **a fifth**
 * of the contact scalar, on top of the travel it keeps. That is a skipping stone,
 * and it decays by five each hop until it drops under the 150 and is doused.
 *
 * **And this is what settles which component `[contact+0x14]` is.** Play
 * described the behaviour exactly: "если падает сверху быстро — нет отпрыга;
 * если летит от свиньи как камень — прыгает по воде." A thing dropped straight
 * down has all the approach in the NORMAL and none in the plane; a thing thrown
 * flat has it the other way about. Only the **in-plane** reading makes the first
 * douse and the second skip, so that is what the scalar is taken to be. The
 * field's own identity is still not transcribed — see the note above — but the
 * behaviour it has to produce is not in doubt.
 */
export const WATER_SKIP_KICK = 5

/**
 * How fast it has to be travelling ALONG the water to skip off it — **and it has
 * to be going along faster than it is going down.**
 *
 * The second half is play's, from watching one skip that should not have: "щас
 * одна граната под навесом отскочила от воды. я думаю если вертикальная скорость
 * выше горизонтальной — прожектайл тонет." It is the same reading as above rather
 * than a new rule — the scalar the engine gates on is taken to be the IN-PLANE
 * speed, and a thing coming down steeply has its speed in the NORMAL — but the
 * in-plane test alone lets a fast, steep throw skip, because 150 in the plane is
 * cheap when the fall has twice that in it. The comparison is what play's own
 * description of the original always said: a stone SKIMS, a bomb goes in.
 */
export const skipsOnWater = (shot: Lobbed): boolean => {
  const along = Math.hypot(shot.vx, shot.vz)
  return along >= WATER_DOUSE_SPEED && along > Math.abs(shot.vy)
}

/** …and if it does not, water douses it: no blast, no damage. */
export const dousedByWater = (shot: Lobbed): boolean => !skipsOnWater(shot)

/**
 * One skip: a fifth of the travel goes UP, and it is PAID FOR out of the travel.
 *
 * The fifth is read. That it is paid for is the remake's, and it is what the
 * numbers force. This used to leave the travel alone on the reading that "the
 * solver has already taken the tile's own friction off it" — measure that and it
 * is nothing: water is terrain type **4** on every shipped map (CAMP, BAY and
 * ARCHI are type 4 throughout), so the pair is 0.30 × 0.90 friction and 0.80 ×
 * 0.10 restitution, and Coulomb friction is `mu * (1 + e) * |vn|` — on a FLAT
 * skim the normal approach is a fraction of the travel, so a hop lost about two
 * per cent. Seventeen hops, which is what play saw: "медленная граната на исходах
 * сил пролетает весь водоём", and "прыжки дают будто буст" for the same reason —
 * a free upward kick every time it touched.
 *
 * Paying for it costs a fifth of the travel a hop, so four or five hops, each
 * shorter and lower than the last, and then the travel is under
 * `WATER_DOUSE_SPEED` and the next contact douses it. Which is a stone off a
 * pond, and it is also what this repo's own note has claimed the behaviour is
 * since the arm was found — "it decays by five each hop until it drops under the
 * 150" — a sentence that was only ever true if the fifth came out of the travel.
 */
export function skipOffWater(shot: Lobbed): void {
  const along = Math.hypot(shot.vx, shot.vz)
  const spent = 1 - 1 / WATER_SKIP_KICK
  shot.vx *= spent
  shot.vz *= spent
  // Y-down, so up is negative.
  shot.vy = -along / WATER_SKIP_KICK
  shot.resting = false
}

/** The splash effect a douse leaves — id 0x0E, which snaps its own y to the
 * WATER HEIGHT (0x488c19) and reads parameter row **2**: three bright rings at
 * −500, so above the surface, and a sixty-sprite white cloud. */
export const WATER_DOUSE_EFFECT = 0x0e

/**
 * **THE SINK IS THE REMAKE'S OWN, AND THE MAPS ARE WHY.** Measured over the
 * shipped water: the bed is AT the water line. Depth `height − surface` on every
 * wet sample of CAMP is 0, of BAY and ARCHI 0 at the median and 48 at the very
 * deepest — because the maps author their water flat at one height and the load
 * step raises everything under it to exactly that (`terrain.ts`). There is no
 * body of water in the collision world to sink through: the surface and the
 * bottom are the same plane, and the engine's own arm stops the thing dead there
 * (0x4A9EE0 zeroes the body's velocity through vtable slot 4, 0x4A9E50 marks it
 * finished).
 *
 * So the sink cannot come out of the terrain and it cannot come out of the exe.
 * Play asked for it plainly — "граната должна реально пару секунд тонуть, как и
 * все прожектайлы" — so a doused thing goes on DOWN, through the bed, at a slow
 * rate of its own, and is taken away when its couple of seconds are up. It is
 * presentation, it is flagged as such, and both numbers are eyework.
 */
export const WATER_SINK_SPEED = 220
export const WATER_SINK_SECONDS = 2

/**
 * Water has doused it: no blast, no damage, and down it goes.
 *
 * The quiet flag is the engine's (`[proj+0x84] = 1`, 0x437d34, and the
 * destructor's first test at 0x4328c9 takes the branch with no effect and no
 * sound at all). The slow descent that follows is the remake's — see above.
 */
export function douseInWater(shot: Lobbed): void {
  shot.doused = true
  shot.sinking = WATER_SINK_SECONDS
  shot.resting = false
  // Whatever it was doing along the surface, it is not doing it under one.
  shot.vx = 0
  shot.vz = 0
  shot.vy = WATER_SINK_SPEED
}

/** One frame of going down. Nothing steers it and nothing stops it — not the
 * bed, which is the same plane as the water it went into. */
export function sinkLob(shot: Lobbed, delta: number): void {
  shot.y += shot.vy * delta
  shot.sinking = Math.max(0, shot.sinking - delta)
}

/** Whether it has finished sinking and can go. */
export const sunkAway = (shot: Lobbed): boolean => shot.doused && shot.sinking <= 0

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
