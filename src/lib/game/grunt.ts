// The GRUNT: the first real brain, and the bottom of the ladder docs/ai.md
// climbs. One thought at a time, nothing clever on purpose.
//
// Its whole game, re-derived on every decision from the world it is shown
// (almost stateless — only "the walking has failed me" is remembered):
//
//   1. no gun, no foes — pass, the stub's old game (SKIP TURN, fire).
//   2. gun not in hand — take it out.
//   3. too far — walk at the nearest foe, stopping shy of the gun's range.
//   4. a friend on the firing line — step aside instead of shooting through
//      him: the one grain of "do not damage your own" the grunt has.
//   5. facing off — turn onto the bearing.
//   6. fire, level, from wherever it stands. No lead, no pitch, no wind of
//      any kind (there is none, docs/ai.md) — the grunt's misses are honest.
//
// A `blocked` walk flips the one bit of memory: stop trying to close in,
// shoot if there is any reach at all, pass otherwise. Better a poor shot
// than a pig grinding a wall until the clock takes the turn away.

import type { AiWorld, Brain, Seen } from './ai'
import type { Order } from './orders'
import { shortest } from './actuator'
import { SKILL } from './skills'
import { projectileOf, rangeOf } from './projectile'

/** Close enough on the heading to trust the shot — under two turn steps. */
export const FACING = 0.02

/** How much of the gun's range the grunt closes to before it shoots: near
 * enough to hit something, not so near it walks into the bayonet. */
export const CLOSE_TO = 0.6

/** A friend within this of the firing line is IN THE WAY (a pig's body is
 * ~32 across; the lane is wider because the grunt is careful, not precise). */
export const FRIEND_CLEARANCE = 60

/** How far aside the grunt steps to clear a friend off the line. */
export const SIDE_STEP = 150

const nearest = (from: { x: number; z: number }, seen: Seen[]): Seen =>
  seen.reduce((best, foe) =>
    Math.hypot(foe.x - from.x, foe.z - from.z) < Math.hypot(best.x - from.x, best.z - from.z)
      ? foe
      : best
  )

/** The friend most in the way of a shot from `at` toward `target`, or null
 * for a clear lane. Flat geometry: distance from the segment, 2D. */
const inTheWay = (
  at: { x: number; z: number },
  target: Seen,
  friends: Seen[]
): { across: number } | null => {
  const dx = target.x - at.x
  const dz = target.z - at.z
  const span = Math.hypot(dx, dz)
  if (span === 0) return null
  const ux = dx / span
  const uz = dz / span
  for (const friend of friends) {
    const along = (friend.x - at.x) * ux + (friend.z - at.z) * uz
    if (along <= 0 || along >= span) continue
    const across = (friend.x - at.x) * uz - (friend.z - at.z) * ux
    if (Math.abs(across) < FRIEND_CLEARANCE) return { across }
  }
  return null
}

export function createGruntBrain(): Brain {
  /** The one memory: walking has been refused, stop trying to close in. */
  let grounded = false

  const pass = (world: AiWorld): Order =>
    world.acting.holding === SKILL.SKIP_TURN
      ? { kind: 'fire' }
      : { kind: 'hold', skill: SKILL.SKIP_TURN }

  return {
    decide(world) {
      if (world.previous === 'blocked') grounded = true

      const gun = world.acting.carrying.find(
        (slot) => slot.amount !== 0 && projectileOf(slot.skill) !== null
      )
      if (!gun || world.foes.length === 0) return pass(world)

      const me = world.acting
      const target = nearest(me, world.foes)
      const dx = target.x - me.x
      const dz = target.z - me.z
      const distance = Math.hypot(dx, dz)
      const range = rangeOf(projectileOf(gun.skill)!)

      if (me.holding !== gun.skill) return { kind: 'hold', skill: gun.skill }

      if (distance > range * CLOSE_TO && !grounded) {
        // Stop short of the range mark, so arrival lands INSIDE it.
        const shy = range * CLOSE_TO * 0.8
        return {
          kind: 'walkTo',
          x: target.x - (dx / distance) * shy,
          z: target.z - (dz / distance) * shy
        }
      }

      const friend = inTheWay(me, target, world.friends)
      if (friend !== null && !grounded) {
        // Step off the line the OTHER way from where the friend leans.
        const ux = dx / distance
        const uz = dz / distance
        const side = -Math.sign(friend.across) * SIDE_STEP
        return { kind: 'walkTo', x: me.x + uz * side, z: me.z - ux * side }
      }

      // Grounded and hopeless — out of reach entirely, or a friend still in
      // the way with nowhere to step — is a pass, not a blind volley.
      if (grounded && (distance > range || friend !== null)) return pass(world)

      const bearing = Math.atan2(dx, dz)
      if (Math.abs(shortest(bearing - me.heading)) > FACING) {
        return { kind: 'turnTo', heading: bearing }
      }
      return { kind: 'fire' }
    },
    reset() {
      grounded = false
    }
  }
}
