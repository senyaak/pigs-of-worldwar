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
import { hurt, isDead } from './health'
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
 * The six, and the cap, are the REMAKE's — and so is the throw itself, which
 * the 2026-08-23/24 reads settled for good: **neither original's blast throws
 * anybody.** The PC arm (0x477c22) was read to its `ret` — damage, twice it
 * onto `[pig+0x1b8]` (a FATIGUE meter, not a knockback tally), smoke, a
 * squeal — every caller of the two throw primitives (27 sites) accounted for
 * without it, the blast effect owning no physics body at all, and zero
 * indirect references in the whole image. Then the PSX build (SLES-01041,
 * psx/notes.md in the disasm repo) answered the same: its blast arm
 * (0x800B22C4) is the same damage-fatigue-smoke-squeal and return. The pigs
 * play remembers flying were projectile hits, buildings and melee. So the
 * fling is `[play]`'s rule with no original behind it — kept because the
 * game plays better thrown about, which is the ruling that started it:
 * "мины не отбрасывают — как и тнт… это общая проблема."
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
    const amount = took(dx, dy, dz)
    if (amount <= 0) continue
    const outcome = hurt(pig, amount, world.training)
    emit({ kind: 'damaged', at: body, amount, pig: pig.id })
    if (outcome === 'died' || outcome === 'gibbed')
      emit({ kind: 'killed', pig: pig.id, by, gibbed: outcome === 'gibbed' })
    // …AND IT GOES FLYING. Where the burst stood against the body decides —
    // under the trotters is straight UP, over the head is straight DOWN, and
    // everything past the footprint is the engine's 45° knock along the flat
    // bearing (`hurlVelocity` says why) — as hard as the damage it just took
    // (`flingSpeed`), which is what makes standing back save your footing as
    // well as your health. A corpse flies too: the exe throws bodies about,
    // and a pig killed by the blast is a body from that instant.
    world.fling?.(pig, hurlVelocity(flingSpeed(amount), { x: dx, y: dy, z: dz }))
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
