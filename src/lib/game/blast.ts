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
}

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
 * **What a blast THROWS with.** 0x40 — sixty-four units a frame — at the core,
 * falling off with the same share the damage does.
 *
 * The exe's whole vocabulary for shoving a pig is one call,
 * `0x4a9100(speed, 0x200, bearing, 0)`, and every site that makes it uses a speed
 * of **0x40** or 0x78: a pig shoved by another body (0x477695, 0x477842), the
 * melee's own knockback (0x4786c1, which passes the weapon's number instead), and
 * the map object at 0x44050c which sweeps up every pig around it, pushes each one
 * at `(0x40, 0x200, bearing)` and makes it squeal. 0x40 is the one attached to
 * something going off, so 0x40 is what a blast gets.
 *
 * **What is NOT read:** `Pig::OnHit`'s own blast arm (0x477c22) carries no impulse
 * at all — it takes the falloff damage through `[vtbl+0x34]`, adds twice it to the
 * tally at `[pig+0x1b8]`, raises the reeling counter at `[pig+0x1b4]` and squeals.
 * So the original throws a pig with a blast through something this pass did not
 * find, and the likeliest candidate is the physics: the blast effect has a BODY —
 * a sphere of radius 35 (`weapons/fire.md`) — and the solver resolves it against
 * the pig's. That contact's impulse is not decoded. What stands here is play's
 * rule ("не отбрасывают") wearing the engine's own numbers, and the FALLOFF is the
 * remake's: it is the one thing that makes standing back matter.
 */
export const BLAST_FLING = fromExeSpeed(0x40)

/**
 * Set one off at `at`: announce it, and hurt everything within reach.
 *
 * The announcement comes FIRST and unconditionally — the beat after a blow hangs
 * off it and the fireball is drawn from it, so a blast that hit nothing still
 * has to be seen (lib/game/battle.ts).
 */
export function burst(at: Point, charge: Charge, world: BlastWorld, emit: Emit): void {
  emit({ kind: 'blasted', at: { x: at.x, y: at.y, z: at.z } })
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
    emit({ kind: 'damaged', at: body, amount })
    if (outcome === 'died' || outcome === 'gibbed') emit({ kind: 'killed', pig: pig.id })
    // …AND IT GOES FLYING. Away from the blast — the bearing from the centre to
    // the pig — and by the same share the damage took, so standing back saves
    // your footing as well as your health. A corpse flies too: the exe throws
    // bodies about, and a pig killed by the blast is a body from that instant.
    //
    // A charge that went off UNDER the trotters has no direction to give (both
    // legs of the bearing are nil), and the pitch is fixed at 45° — so it throws
    // the pig the way it was facing rather than the way +Z happens to point.
    const share = blastShare(Math.hypot(dx, body.y - at.y, dz), charge.reach)
    const away = Math.hypot(dx, dz) < 1 ? pig.heading : Math.atan2(dx, dz)
    world.fling?.(pig, BLAST_FLING * share, away)
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
