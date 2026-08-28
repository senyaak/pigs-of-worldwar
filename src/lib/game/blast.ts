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
import { heal, hurt, isDead, maxHealthFor } from './health'
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
}

/** What a GRENADE's destructor spawns (0x432e75) — parameter row 0. */
export const LOB_EFFECT_ID = 0x54
/** …and what a MINE's does (0x433cd0/0x433d1f) — parameter row 14. */
export const MINE_EFFECT_ID = 0x4c
/** …and the MEDICINE BALL's (0x4331D1) — parameter row 4, the one burst in
 * the game that heals (`mend` below). The id is in the GAS group's phantom
 * flags, which is what makes it push nobody and ignore line of sight. */
export const HEAL_EFFECT_ID = 0x60
/** The CLUSTER's own pop (0x43290E) — reads row 0 like the grenade's 0x54,
 * so the picture is the same; the id is kept for faithfulness' sake. */
export const CLUSTER_EFFECT_ID = 0x46
/** …and its bomblet's (0x433038) — parameter row 6, a dry crack of sparks
 * with no fireball (lib/game/effects.ts, BOMBLET_EFFECT). */
export const BOMBLET_EFFECT_ID = 0x47

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
 * **What a blast THROWS with: six times the damage it did, in points.**
 *
 * The exe's whole vocabulary for shoving a pig is one call,
 * `0x4a9100(speed, 0x200, bearing, 0)`, and the speeds at its six sites are the
 * scale everything here is measured against: **0x40** for a pig shoved by another
 * body (0x477695, 0x477842) or by a building going off (0x44050c), **0x78** for
 * types 0x1358/0x135A, and for the melee the weapon's own `knockback` —
 * **75 for a bayonet, 100 for a trotter, 150 for a sword, 200 for the cattle
 * prod** (`weapons/melee.md`).
 *
 * That last row is what the first attempt got wrong. It used 0x40 flat, which is
 * **less than a punch** for a charge going off under a pig's trotters, and play
 * said so at once: "толчёк очень мелкий." So the magnitude scales with the damage
 * instead — and then once more, because four times it still left a mine feeling
 * light ("отбрасывание миной всё ещё кажется слабым"). At **six** the three blasts
 * in the game land like this:
 *
 * | blast | points at the core | speed |
 * | ----- | ------------------ | ----- |
 * | a MINE | 20 | **120 = 0x78**, the engine's other decoded knock |
 * | a GRENADE | 30 | 180 |
 * | TNT | 50 | 300, held at the **200** cap |
 *
 * — monotone, none of it past the hardest knock the exe hands out, and both ends on
 * the engine's own numbers.
 *
 * The FALLOFF is free: the damage is already the share for the distance, so
 * standing back saves your footing along with your health.
 *
 * The six, and the cap, are the REMAKE's calibration. The exe's own throw
 * is READ — `weapons/fire.md` §"phantom sweep" — and it is the EFFECT's
 * one-shot world sweep (0x409EF0), not any arm of the pig's: sphere of
 * the whole RANGE centred 128 ABOVE the blast, impulse
 * `strength · (1 − 3d/4R)` along centre→body (25% still standing at the
 * rim), the vertical DOUBLED, divided by the body's MASS (a pig's is 30),
 * a coin-flip spin; `strength` is the effect's own FORCE field — grenade
 * 2600, TNT 6500, the land death 3250 — and does NOT scale with the
 * damage. Gas, fire and heal are built with the impulse flag off: damage
 * without throw. In per-frame Δv that is ~87 for a grenade at the centre,
 * ~108 for a corpse, ~217 for TNT — the same order this model's 6×points
 * lands (180/120/200-capped), so the two disagree in SHAPE (falloff, the
 * doubled vertical, damage-independence) more than in size. This model
 * stays `[play]`-tuned until play asks for the exe's numbers.
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
export const FLING_PER_POINT = 6
/** …and no harder than the hardest knock in the engine: the cattle prod's. */
export const FLING_CAP = fromExeSpeed(200)

/** How hard a blast that took `points` off a pig throws it. */
export const flingSpeed = (points: number): number =>
  Math.min(FLING_CAP, fromExeSpeed(FLING_PER_POINT * points))

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
    const outcome = hurt(pig, amount, world.training)
    emit({ kind: 'damaged', at: body, amount, pig: pig.id })
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
        flingSpeed(amount),
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
