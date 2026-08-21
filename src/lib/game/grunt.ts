// The GRUNT: the first real brain, and the bottom of the ladder docs/ai.md
// climbs. One thought at a time, nothing clever on purpose.
//
// Its whole game, re-derived on every decision from the world it is shown
// (almost stateless — "the walking has failed me" and "I have set my pitch"
// are the only memories):
//
//   1. no gun, no foes — pass, the stub's old game (SKIP TURN, fire).
//   2. the BEST gun in the kit, by its own damage table — and the best
//      TARGET by the seed of docs/ai.md's HP differential: what a shot is
//      WORTH is the health it takes, and a foe it would FINISH is worth a
//      kill bonus on top, because a dead pig loses every future turn. 30
//      into a pig with 20 left beats 30 into a pig with 120.
//   3. gun not in hand — take it out.
//   4. too far — ROUTE to a point shy of the gun's range (world.route,
//      lib/game/pathfind.ts) and walk the next corner of it.
//   5. a friend on the firing line — step aside instead of shooting through
//      him: the one grain of "do not damage your own" the grunt has.
//   6. facing off — turn onto the bearing.
//   7. the ground is not flat — PITCH the barrel at the target: soles to
//      soles, which is chest to chest, because both stand the same height
//      over their feet. Asked for ONCE; what the clamp refuses stays
//      refused (the actuator's blocked), and the shot goes as it lies.
//   8. fire. No lead and no wind (there is none, docs/ai.md) — the grunt's
//      misses are honest.
//
// A `blocked` walk — or a route already walked to its best end — flips the
// one bit of memory: stop trying to close in, shoot if there is any reach
// at all, pass otherwise. Better a poor shot than a pig grinding a wall
// until the clock takes the turn away.

import type { AiWorld, Brain, Seen } from './ai'
import type { Order } from './orders'
import { shortest } from './actuator'
import { AIM_UNITS } from './aim'
import { GRID_STEP } from './pathfind'
import { SKILL } from './skills'
import { damageOf, projectileOf, rangeOf } from './projectile'

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

/** What FINISHING a pig is worth on top of the health it takes — the seed
 * of the kill bonus docs/ai.md prices whole turns at. In health points, so
 * a kill outbids any wound the kit can deal instead. */
export const KILL_BONUS = 50

/** The pitch is corrected when it is off by more than this (aim units) —
 * twice the actuator's own arrival tolerance, so a wanted angle it has
 * already reached is never re-asked. */
export const PITCH_WITHIN = 12

/** What one shot of `damage` at this foe is WORTH. */
const worth = (damage: number, foe: Seen): number =>
  Math.min(damage, foe.health) + (damage >= foe.health ? KILL_BONUS : 0)

/** The best-paying target; the NEARER one on equal pay. */
const bestTarget = (from: { x: number; z: number }, damage: number, foes: Seen[]): Seen =>
  foes.reduce((best, foe) => {
    const pay = worth(damage, foe) - worth(damage, best)
    if (pay > 0) return foe
    if (pay < 0) return best
    return Math.hypot(foe.x - from.x, foe.z - from.z) <
      Math.hypot(best.x - from.x, best.z - from.z)
      ? foe
      : best
  })

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
  /** Walking has been refused: stop trying to close in. */
  let grounded = false
  /** The pitch has been set (or refused by the clamp): do not chase it. */
  let pitched = false

  const pass = (world: AiWorld): Order =>
    world.acting.holding === SKILL.SKIP_TURN
      ? { kind: 'fire' }
      : { kind: 'hold', skill: SKILL.SKIP_TURN }

  return {
    decide(world) {
      if (world.previous === 'blocked') grounded = true

      // The best gun the kit holds, by the damage table's own word.
      const gun = world.acting.carrying
        .filter((slot) => slot.amount !== 0 && projectileOf(slot.skill) !== null)
        .reduce<{ skill: number } | null>(
          (best, slot) =>
            best === null || damageOf(slot.skill) > damageOf(best.skill) ? slot : best,
          null
        )
      if (!gun || world.foes.length === 0) return pass(world)

      const me = world.acting
      const target = bestTarget(me, damageOf(gun.skill), world.foes)
      const dx = target.x - me.x
      const dz = target.z - me.z
      const distance = Math.hypot(dx, dz)
      const range = rangeOf(projectileOf(gun.skill)!)

      if (me.holding !== gun.skill) return { kind: 'hold', skill: gun.skill }

      if (distance > range * CLOSE_TO && !grounded) {
        // Stop short of the range mark, so arrival lands INSIDE it — and go
        // by the ROUTE, not the crow's line: the next corner of the best
        // path round the walls, the water and the known mines. A route with
        // no corner left to walk means this is as close as the ground
        // allows, and the grunt is grounded the same as a refused step.
        const shy = range * CLOSE_TO * 0.8
        const corners = world.route({
          x: target.x - (dx / distance) * shy,
          z: target.z - (dz / distance) * shy
        })
        const next = corners?.find(
          (corner) => Math.hypot(corner.x - me.x, corner.z - me.z) > GRID_STEP / 2
        )
        if (next) return { kind: 'walkTo', x: next.x, z: next.z }
        grounded = true
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

      // The pitch: Y-DOWN, so standing ABOVE the target means my y is the
      // smaller and the barrel goes DOWN — atan2 of the drop over the reach,
      // in the aim's own 4096-a-turn units. Once.
      if (!pitched) {
        const wanted = Math.round(
          (Math.atan2(me.y - target.y, distance) / (2 * Math.PI)) * AIM_UNITS
        )
        if (Math.abs(wanted - me.aim) > PITCH_WITHIN) {
          pitched = true
          return { kind: 'aimTo', angle: wanted }
        }
      }
      return { kind: 'fire' }
    },
    reset() {
      grounded = false
      pitched = false
    }
  }
}
