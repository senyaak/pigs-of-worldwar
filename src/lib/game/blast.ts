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
   * Throw a pig: `speed` game units a second along `bearing`, 45° up
   * (lib/game/tumble.ts). WHERE the velocity goes is the caller's business — the
   * acting pig has a locomotion state of its own and everybody else has one made
   * for the flight (lib/game/battle.ts).
   *
   * Optional, and a blast without it only hurts: the pure specs that measure
   * damage have no bodies to move and no ground to land on.
   */
  fling?: (pig: Pig, speed: number, bearing: number) => void
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
 * The six, and the cap, are the REMAKE's — play's word standing in for a read
 * that came up empty. `Pig::OnHit`'s own blast arm (0x477c22) carries no impulse at
 * all: it takes the falloff damage through `[vtbl+0x34]`, adds **twice it** to the
 * tally at `[pig+0x1b8]` — which is where the melee's knockback goes too, in
 * another scale — raises the reeling counter at `[pig+0x1b4]` and squeals. So the
 * original throws a pig through something this pass did not find, most likely the
 * physics: the blast effect has a BODY, a sphere of radius 35 (`weapons/fire.md`),
 * and that contact's impulse is not decoded.
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
    const dz = body.z - at.z
    const amount = took(dx, body.y - at.y, dz)
    if (amount <= 0) continue
    const outcome = hurt(pig, amount, world.training)
    emit({ kind: 'damaged', at: body, amount, pig: pig.id })
    if (outcome === 'died' || outcome === 'gibbed')
      emit({ kind: 'killed', pig: pig.id, by, gibbed: outcome === 'gibbed' })
    // …AND IT GOES FLYING. Away from the blast — the bearing from the centre to
    // the pig — as hard as the damage it just took (`flingSpeed`), which is what
    // makes standing back save your footing as well as your health. A corpse flies
    // too: the exe throws bodies about, and a pig killed by the blast is a body
    // from that instant.
    //
    // A charge that went off UNDER the trotters has no direction to give (both
    // legs of the bearing are nil), and the pitch is fixed at 45° — so it throws
    // the pig the way it was facing rather than the way +Z happens to point.
    const away = Math.hypot(dx, dz) < 1 ? pig.heading : Math.atan2(dx, dz)
    world.fling?.(pig, flingSpeed(amount), away)
  }
  const standing = world.targets
  for (let i = standing.length - 1; i >= 0; i--) {
    const dummy = standing[i]
    if (!world.present(dummy.id)) continue
    const amount = took(dummy.x - at.x, dummy.y - at.y, dummy.z - at.z)
    if (amount <= 0) continue
    hurt(dummy, amount, false)
    emit({ kind: 'damaged', at: dummy, amount })
    if (isDead(dummy)) {
      standing.splice(i, 1)
      emit({ kind: 'broke', target: dummy.id, at: { x: dummy.x, y: dummy.y, z: dummy.z } })
    }
  }
}
