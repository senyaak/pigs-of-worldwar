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
}

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
    const amount = took(body.x - at.x, body.y - at.y, body.z - at.z)
    if (amount <= 0) continue
    const outcome = hurt(pig, amount, world.training)
    emit({ kind: 'damaged', at: body, amount })
    if (outcome === 'died' || outcome === 'gibbed') emit({ kind: 'killed', pig: pig.id })
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
