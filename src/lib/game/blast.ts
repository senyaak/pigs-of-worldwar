// A BLAST: what an explosion takes off everything around it.
//
// This was the body of `lobs.ts` and belonged to grenades alone. A MINE wants
// exactly the same thing — a point, a core damage and a reach, and then every
// pig and every dummy inside it takes its share (lib/game/mines.ts) — and the
// only honest way to give it one was to stop the grenade owning it.
//
// The falloff itself stays in `grenade.ts` beside the exe reading it came from
// (`blastShare`): a core of 512 units at full damage, then linear down to a
// quarter at the rim.
//
// Pure, and game space (Y-down) like the rest of lib/game.

import { blastShare } from './grenade'
import { hurlVelocity } from './tumble'
import type { Velocity } from './tumble'
import { DAMAGE_UNIT } from './projectile'
import { fromExeSpeed } from './ballistics'
import { heal, hurt, hurtPig, isDead, maxHealthFor } from './health'
import { originY } from './body'
import type { Point } from './pose'
import type { Pig } from './game'
import type { Target } from './targets'
import type { Emit } from './events'

/** What a blast is, once everything about WHERE it came from is forgotten. */
export interface Charge {
  /** Points at the core, in 128ths — a row's +0x0C (lib/game/projectile.ts). */
  damage: number
  /** How far the falloff runs: `blastRange(row)` for a lob, and the same
   * arithmetic off its own row for anything else. */
  reach: number
  /**
   * The EFFECT id its destructor spawns — what the bang looks like.
   *
   * It belongs to the charge because that is where the exe keeps it: a projectile
   * row's destructor arm names one id, and the two mine rows differ in nothing
   * ELSE (0x433cd0 and 0x433d1f against a lob's 0x432e75). Two ids here, and they
   * read two different parameter rows: **0x54 → row 0** for a grenade, **0x4c →
   * row 14** for a mine (lib/game/effects.ts). Anything without one still hurts
   * and simply looks like a grenade.
   */
  effect?: number
  /**
   * **How hard it THROWS** — a row's +0x08, the column `weapons/fire.md` calls
   * FORCE and the effect keeps at `[eff+0x64]` (`flingSpeed`).
   *
   * Absent or zero throws nobody, which is not a default so much as a
   * behaviour: the gases and the medicine ball carry a real 0 in that column,
   * and a blast raised by something with no row of its own says so by leaving
   * it out.
   */
  force?: number
}

/** What a GRENADE's destructor spawns (0x432e75) — parameter row 0. */
export const LOB_EFFECT_ID = 0x54
/** …and what a MINE's does (0x433cd0/0x433d1f) — parameter row 14. */
export const MINE_EFFECT_ID = 0x4c
/** …and the MEDICINE BALL's (0x4331D1) — parameter row 4, the one burst in
 * the game that heals (`mend` below). The id is in the GAS group's phantom
 * flags, which is what makes it push nobody and ignore line of sight. */
export const HEAL_EFFECT_ID = 0x60
/** …and what a pig taking itself out spawns (0x47cc37) — skill 51 has no
 * projectile and therefore no row, so its id lives here beside the mine's
 * (lib/game/suicide.ts carries the damage and the range). */
export const SUICIDE_EFFECT_ID = 0x56
// The CLUSTER's own pop (0x46), its bomblet's (0x47), the MORTAR's (0x58) and
// its sub-shell's (0x4A) stood here too and are on their ROWS now
// (lib/game/grenade.ts, `Lob.effect`) — one home per id, beside the numbers
// the same destructor reads. What is left here is what no row carries: the
// family default, the mine's, and the heal the ear and the camera tell apart.

/** Everything a blast can catch. The same four fields the bullets and the blade
 * take, and the SAME dummy array — a list of its own means a dummy dies twice
 * (lib/game/targets.ts). */
export interface BlastWorld {
  pigs: () => Pig[]
  targets: Target[]
  /** Whether the map SCRIPT has placed this dummy yet (lib/game/script.ts). */
  present: (id: number) => boolean
  training: boolean
  /**
   * Throw a pig with this starting velocity (lib/game/tumble.ts,
   * `hurlVelocity` builds the blast's). WHERE the velocity goes is the
   * caller's business — the acting pig has a locomotion state of its own and
   * everybody else has one made for the flight (lib/game/battle.ts).
   *
   * Optional, and a blast without it only hurts: the pure specs that measure
   * damage have no bodies to move and no ground to land on.
   */
  fling?: (pig: Pig, velocity: Velocity) => void
  /**
   * The unit normal of the ground under a point (`TerrainQuery.normal`, game
   * space). Only the footprint case reads it — a burst under the trotters
   * throws along the slope rather than straight up (`hurlVelocity`) — and a
   * world without one keeps the flat answer, which is what the pure damage
   * specs want.
   */
  groundNormal?: (x: number, z: number) => { x: number; y: number; z: number }
  /**
   * A hidden pig's DECOY takes the share first and hands back the remainder
   * (lib/game/hide.ts `absorb`) — the exe's decoy has its own effect arm
   * that computes the same falloff onto itself (0x48EB26), and the pig sees
   * only what breaks through (0x48DB58). Optional the way `fling` is.
   */
  soak?: (pig: Pig, amount: number) => number
  /**
   * Whether this pig carries a STATUS a heal would take off (lib/game/
   * poison.ts) — the second half of the heal arm's own gate (0x4778D8):
   * a body at its ceiling is passed over UNLESS the status word is set, and
   * then a zero-amount heal goes through for the cure alone. Only `mend`
   * reads it; a world without one simply never cures at full health.
   */
  afflicted?: (pig: Pig) => boolean
}

/**
 * **WHAT A BLAST THROWS WITH: the effect's own FORCE, over the body's MASS.**
 *
 * This replaces a `[play]`-tuned invention — `6 × the damage in points`, capped
 * at the cattle prod's 200 — and it is replaced because play measured it in the
 * one unit that matters: **"граната откидывает через чур далеко, раза в 3-4
 * дальше чем надо"** (2026-09-01). The arithmetic agrees exactly, and this
 * file's own comment had already written down why it would:
 *
 * | | old, 6×points | the exe |
 * | - | - | - |
 * | a grenade at the core | 180 | **86.7** |
 * | TNT | 200, at the cap | **173** |
 * | a mine | 120 | **130** |
 *
 * A throw is ballistic, so the DISTANCE goes as the square of the launch
 * speed: `(180 / 86.7)² = 4.3`, which is the "three or four times" play saw.
 * The mine and TNT were close all along; it was the grenade — the thing thrown
 * most — that was double.
 *
 * **The exe's own model** (`weapons/fire.md` §"phantom sweep", 0x40A500) is the
 * EFFECT's one-shot world sweep, not any arm of the pig's:
 *
 * ```
 * dir = normalize(body - burst)      (zero distance -> straight up)
 * M   = FORCE * (1 - 3d/4R)          the SAME falloff the damage runs
 * v   = dir * M ;  v.y *= 2          the vertical always doubles
 * dv  = v / [body+0x90]              the body's MASS -- a pig's is 30
 * ```
 *
 * Two of those four lines were already here and stay: the falloff is
 * `blastShare`, which every blast already computes for the damage, and the
 * DIRECTION is `hurlVelocity`'s — four passes of play shaped it (the paragraph
 * below) and none of what play tuned there is about how HARD the throw is.
 * What changes is the magnitude, and only that.
 *
 * **And it no longer rides the damage**, which is the second half of the exe's
 * shape. The force is a column of its own (row +0x08) and the two do not track:
 * the MEDICINE BALL does forty points of healing at force **0**, the gases hurt
 * at force 0, and the mine throws harder than the grenade while hurting less.
 * A weapon that heals or poisons must not shove, and now it cannot.
 *
 * The cap is gone with the invention it bounded. The exe divides and does not
 * clamp, and nothing in a shipped kit reaches the old ceiling anyway — the
 * hardest force in the game is the SHOCKWAVE's 9750 (325 a frame), which is a
 * push weapon and is supposed to be.
 *
 * The DIRECTION is the engine's one throwing explosion borrowed: a BUILDING
 * going off (PC 0x44050c at 0x40, PSX 0x800FAC84, contact arm 0x78) throws
 * every pig around it along the bearing from its centre to the pig, and
 * `hurlVelocity` (lib/game/tumble.ts) is that knock — 45°, full speed, the
 * pitch both originals throw EVERYTHING at — with one exception the size of
 * the pig's own footprint: a burst under the body goes straight up, one
 * over it slams straight down. Four passes of play shaped it: the fixed 45°
 * alone ("странно отбрасывает" — no vertical from below), a flat shove for
 * downward lines that the landing swallowed whole ("он никуда не
 * сдвинулся"), a steep-centre-line rule whose vertical window was half a
 * pig wide ("должно было вверх по горе подвинуть, а он на месте катился"),
 * and the footprint boundary that answers all three.
 */
export const PIG_MASS = 30

/** How hard a blast of this FORCE throws a body at `share` of the core — the
 * same 0..1 the damage is scaled by (`blastShare`). Force 0 throws nobody,
 * which is how the heals and the gases are built. */
export const flingSpeed = (force: number, share: number): number =>
  fromExeSpeed((force * share) / PIG_MASS)

/**
 * Set one off at `at`: announce it, and hurt everything within reach.
 *
 * The announcement comes FIRST and unconditionally — the beat after a blow hangs
 * off it and the fireball is drawn from it, so a blast that hit nothing still
 * has to be seen (lib/game/battle.ts).
 *
 * `by` is the pig whose weapon this blast is — the lob's own `owner` — and it
 * rides out on any `killed` the blast causes, which is how a kill finds its
 * attacker (lib/game/events.ts). A MINE passes none: nobody's weapon, the
 * map's own.
 */
export function burst(at: Point, charge: Charge, world: BlastWorld, emit: Emit, by?: number): void {
  emit({
    kind: 'blasted',
    at: { x: at.x, y: at.y, z: at.z },
    effect: charge.effect ?? LOB_EFFECT_ID
  })
  const took = (dx: number, dy: number, dz: number): number =>
    Math.round((charge.damage * blastShare(Math.hypot(dx, dy, dz), charge.reach)) / DAMAGE_UNIT)
  for (const pig of world.pigs()) {
    if (isDead(pig)) continue
    const body = { x: pig.position.x, y: originY(pig.position.y, pig.body), z: pig.position.z }
    const dx = body.x - at.x
    const dy = body.y - at.y
    const dz = body.z - at.z
    let amount = took(dx, dy, dz)
    if (amount <= 0) continue
    // A DISGUISED pig's decoy takes the share first (lib/game/hide.ts): the
    // exe's decoy runs this same falloff onto its own health and the pig
    // sees only what breaks through — a blast the cover ate whole moves and
    // reveals nobody.
    const covered = pig.hidden
    if (world.soak) amount = world.soak(pig, amount)
    if (amount <= 0 && covered) continue
    const outcome = hurtPig(pig, amount, world.training, emit)
    emit({ kind: 'damaged', at: body, amount, pig: pig.id, blow: true })
    if (outcome === 'died' || outcome === 'gibbed')
      emit({ kind: 'killed', pig: pig.id, by, gibbed: outcome === 'gibbed' })
    // …AND IT GOES FLYING. Where the burst stood against the body decides —
    // under the trotters is along the GROUND'S OWN NORMAL (straight up on the
    // flat, down the hill on a slope), over the head is straight DOWN, and
    // everything past the footprint is the engine's 45° knock along the flat
    // bearing (`hurlVelocity` says why) — as hard as the damage it just took
    // (`flingSpeed`), which is what makes standing back save your footing as
    // well as your health. A corpse flies too: the exe throws bodies about,
    // and a pig killed by the blast is a body from that instant.
    world.fling?.(
      pig,
      hurlVelocity(
        // The throw is the FORCE's, not the damage's — and it runs the same
        // falloff, so standing back still saves your footing along with your
        // health (`flingSpeed`).
        flingSpeed(charge.force ?? 0, blastShare(Math.hypot(dx, dy, dz), charge.reach)),
        { x: dx, y: dy, z: dz },
        world.groundNormal?.(pig.position.x, pig.position.z)
      )
    )
  }
  const standing = world.targets
  for (let i = standing.length - 1; i >= 0; i--) {
    const dummy = standing[i]
    if (!world.present(dummy.id)) continue
    const amount = took(dummy.x - at.x, dummy.y - at.y, dummy.z - at.z)
    if (amount <= 0) continue
    hurt(dummy, amount, false)
    emit({ kind: 'damaged', at: dummy, amount, structure: dummy.structure, metal: dummy.metal })
    if (isDead(dummy)) {
      standing.splice(i, 1)
      emit({ kind: 'broke', target: dummy.id, at: { x: dummy.x, y: dummy.y, z: dummy.z } })
    }
  }
}

/**
 * Set a HEALING burst off at `at` — the MEDICINE BALL's, and the mirror of
 * `burst` with every destructive half taken out, each absence the exe's own:
 *
 * - **Nobody is thrown.** The row's force is 0 and the id's phantom flags are
 *   the gas group's no-push set (Init 0x489A00) — a heal moves no bodies.
 * - **Nothing breaks.** Only pigs are mended; the dummies and the scenery are
 *   left alone, and there is no `killed` to credit.
 * - **A hidden pig gets NOTHING**: the decoy's contact handler excludes the
 *   status band 0x5C..0x61 whole (lib/game/hide.ts) — a bush does not
 *   convalesce, and the pig under it is out of the physics.
 * - The amount is `min(deficit, falloff)` (0x4778C6): the same `blastShare`
 *   ramp every blast runs, clamped to what the body is actually missing —
 *   forty at the core, never past the ceiling. A body at its ceiling is
 *   passed over UNLESS it carries a status (`afflicted`), and then the zero
 *   heal goes through and the `healed` event's cure does the work
 *   (lib/game/poison.ts).
 *
 * The announcement is the same `blasted` beat — the effect id is what tells
 * the picture and the ear apart (HEAL_EFFECT_ID).
 */
export function mend(at: Point, charge: Charge, world: BlastWorld, emit: Emit): void {
  emit({
    kind: 'blasted',
    at: { x: at.x, y: at.y, z: at.z },
    effect: charge.effect ?? HEAL_EFFECT_ID
  })
  const shareAt = (dx: number, dy: number, dz: number): number =>
    Math.round((charge.damage * blastShare(Math.hypot(dx, dy, dz), charge.reach)) / DAMAGE_UNIT)
  for (const pig of world.pigs()) {
    if (isDead(pig)) continue
    if (pig.hidden) continue
    const body = { x: pig.position.x, y: originY(pig.position.y, pig.body), z: pig.position.z }
    const reach = shareAt(body.x - at.x, body.y - at.y, body.z - at.z)
    // Out of the field entirely: not even the cure reaches it.
    if (reach <= 0) continue
    const amount = Math.min(reach, Math.max(0, maxHealthFor(pig.pigClass) - pig.health))
    if (amount <= 0 && !world.afflicted?.(pig)) continue
    heal(pig, amount)
    emit({ kind: 'healed', at: body, amount, pig: pig.id })
  }
}
