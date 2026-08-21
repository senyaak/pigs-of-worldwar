// The GRUNT: the first real brain, and the bottom of the ladder docs/ai.md
// climbs. One thought at a time, nothing clever on purpose.
//
// The CHOOSING is not here any more: the price list is
// (lib/game/evaluate.ts — every carried thing against every target, one
// currency, class-blind). What is here is the CARRYING OUT, re-derived on
// every decision from the world it is shown (almost stateless — "the
// walking has failed me" and "I have set my pitch" are the only memories):
//
//   1. nothing priceable — pass, the stub's old game (SKIP TURN, fire).
//   2. the winning option's weapon not in hand — take it out.
//   3. too far for it — ROUTE to its reach (world.route) and walk the next
//      corner.
//   4. a friend on a GUN's firing line — step aside instead of shooting
//      through him. A lob arcs over friends and a blade never reaches one:
//      their own risks are already in the price.
//   5. facing off — turn onto the bearing.
//   6. a GUN pitches at the target once — soles to soles, which is chest to
//      chest; what the clamp refuses stays refused. A lob keeps its 45°
//      come-up: the CHARGE is the aim, solved by the price list.
//   7. fire, at the option's own charge.
//
// A `blocked` walk — or a route already walked to its best end — flips the
// one bit of memory: stop trying to close in, shoot if the option still
// reaches, pass otherwise. Better a poor shot than a pig grinding a wall
// until the clock takes the turn away.

import type { AiWorld, Brain, Seen } from './ai'
import type { Order } from './orders'
import { shortest } from './actuator'
import { AIM_UNITS } from './aim'
import { priceKit } from './evaluate'
import { GRID_STEP } from './pathfind'
import { SKILL } from './skills'

/** Close enough on the heading to trust the shot — under two turn steps. */
export const FACING = 0.02

/** A friend within this of the firing line is IN THE WAY (a pig's body is
 * ~32 across; the lane is wider because the grunt is careful, not precise). */
export const FRIEND_CLEARANCE = 60

/** How far aside the grunt steps to clear a friend off the line. */
export const SIDE_STEP = 150

/** The pitch is corrected when it is off by more than this (aim units) —
 * twice the actuator's own arrival tolerance, so a wanted angle it has
 * already reached is never re-asked. */
export const PITCH_WITHIN = 12

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

      const option = priceKit(world)
      if (!option) return pass(world)

      const me = world.acting
      const target = option.target
      const dx = target.x - me.x
      const dz = target.z - me.z
      const distance = Math.hypot(dx, dz)

      if (me.holding !== option.skill) return { kind: 'hold', skill: option.skill }

      if (distance > option.reach && !grounded) {
        // Stop short of the reach mark, so arrival lands INSIDE it — and go
        // by the ROUTE, not the crow's line: the next corner of the best
        // path round the walls, the water and the known mines. A route with
        // no corner left to walk means this is as close as the ground
        // allows, and the grunt is grounded the same as a refused step.
        const shy = option.reach * 0.8
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

      // Only a GUN's shot travels the flat line a friend can stand in; a lob
      // clears heads (and its blast already paid for whoever it lands near),
      // a blade never reaches past arm's length.
      const friend = option.kind === 'gun' ? inTheWay(me, target, world.friends) : null
      if (friend !== null && !grounded) {
        // Step off the line the OTHER way from where the friend leans.
        const ux = dx / distance
        const uz = dz / distance
        const side = -Math.sign(friend.across) * SIDE_STEP
        return { kind: 'walkTo', x: me.x + uz * side, z: me.z - ux * side }
      }

      // Grounded and hopeless — past the option's whole limit, or a friend
      // still in the way with nowhere to step — is a pass, not a blind
      // volley.
      if (grounded && (distance > option.limit || friend !== null)) return pass(world)

      const bearing = Math.atan2(dx, dz)
      if (Math.abs(shortest(bearing - me.heading)) > FACING) {
        return { kind: 'turnTo', heading: bearing }
      }

      // The pitch, GUNS only: Y-DOWN, so standing ABOVE the target means my
      // y is the smaller and the barrel goes DOWN — atan2 of the drop over
      // the reach, in the aim's own 4096-a-turn units. Once. A lob's pitch
      // is its 45° come-up; its aim is the charge.
      if (option.kind === 'gun' && !pitched) {
        const wanted = Math.round(
          (Math.atan2(me.y - target.y, distance) / (2 * Math.PI)) * AIM_UNITS
        )
        if (Math.abs(wanted - me.aim) > PITCH_WITHIN) {
          pitched = true
          return { kind: 'aimTo', angle: wanted }
        }
      }
      return option.charge === undefined
        ? { kind: 'fire' }
        : { kind: 'fire', charge: option.charge }
    },
    reset() {
      grounded = false
      pitched = false
    }
  }
}
