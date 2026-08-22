// The machine's HANDS: one order in, the player's own inputs out, frame by
// frame, until the order is finished or stuck.
//
// The rig below is the honesty boundary. Everything the actuator may WRITE
// is an input the player's keys write — the walk/turn intent, the aim keys,
// the fire button, the skill in hand — and everything it may READ is what a
// player watching the screen knows about their own pig. It never moves a
// pig, never sets an angle, never fires a shot: it asks, and the battle's
// ordinary driving code answers under the ordinary speeds and clamps
// (docs/ai.md). If the world refuses — a wall, a clamp, a wedge — the order
// finishes `blocked` and it is the BRAIN's problem, exactly as it would be a
// player's.
//
// Deterministic like everything in lib/game: pure state stepped in the
// battle's own quanta, no wall clock, no chance at all.

import type { Order } from './orders'
import { TURN_SPEED } from './locomotion'

/** How an order ended: carried out, or the world refused it. */
export type Outcome = 'done' | 'blocked'

/** What the actuator holds — the player's own controls, and the readings a
 * player has anyway. Handed in by the battle (lib/game/battle.ts). */
export interface Rig {
  /** Where the acting pig stands and faces. */
  at(): { x: number; z: number; heading: number }
  /** Whether that point is WATER — what a player sees at a glance, and what
   * the hands refuse to march into (the walk guard below). */
  wet(x: number, z: number): boolean
  /** The weapon's pitch, aim units (lib/game/sights.ts). */
  aim(): number
  /** The power gauge, 0..1 while one is filling, null otherwise. */
  gauge(): number | null
  /** Tank controls: walk -1|0|1, turn -1|0|1 — `Battle.setIntent`. */
  intent(walk: number, turn: number): void
  /** The aim keys: -1 down, 0 nothing, +1 up — `Battle.setAim`. */
  aimStep(direction: number): void
  /** The fire button — `Battle.setFiring`, airborne guard included. */
  fire(held: boolean, pressed: boolean): void
  /** The skill menu's write: what the pig holds. */
  hold(skill: number | null): void
}

export interface Actuator {
  /** Nothing in the hands: time to ask the brain. */
  idle(): boolean
  /** Take an order. Only when idle — a new order replaces nothing. */
  take(order: Order): void
  /** One engine step of carrying it out. */
  step(delta: number): void
  /** How the LAST order ended, until the next one finishes. */
  outcome(): Outcome | null
  /** A new turn: drop everything, still the controls. */
  reset(): void
}

/** Close enough to a walk target to call it arrival — over one 60 Hz stride
 * (~17 units), so the last step cannot orbit the point. */
export const ARRIVE_WITHIN = 24

/** A walk that improves its distance by less than this is not progressing. */
const PROGRESS = 1

/** How long a walk may fail to progress before it is `blocked`. */
export const STUCK_SECONDS = 1.5

/** Close enough on the pitch — under two taps of the aim key. */
export const AIM_WITHIN = 6

/**
 * How far ahead of the feet the walk looks for WATER — a stride and a half.
 *
 * The guard of last resort under every walk order, whatever planned it:
 * the pathfinder's grid samples cell CENTRES a quarter-tile apart, and a
 * water margin thinner than that let a route's straight leg march a pig
 * into the bay (measured: a grunt crossed 4300 units of ESTU and drowned
 * holding a grenade). The hands see the water the way a player does and
 * STOP — `blocked`, the brain thinks again. Only from DRY ground: a pig
 * already swimming is walking OUT, and stopping it would drown it.
 */
export const WATER_PROBE = 150

/** How long the pitch may fail to move before the clamp is taken for an
 * answer. */
const AIM_STUCK_SECONDS = 0.5

/** Keep walking while facing within this of the bearing; outside it, turn
 * on the spot first. */
const WALK_CONE = Math.PI / 4

/** The shortest way round: (-π, π]. Brains borrow it (lib/game/grunt.ts). */
export const shortest = (angle: number): number => {
  const turn = 2 * Math.PI
  const wound = ((angle % turn) + turn) % turn
  return wound > Math.PI ? wound - turn : wound
}

export function createActuator(rig: Rig): Actuator {
  let order: Order | null = null
  let ended: Outcome | null = null
  /** The fire order's charge, normalised once at `take`. */
  let charge = 0
  /** The walk's (or the aim's) best distance so far, and how long since it
   * improved. */
  let best = Infinity
  let stalled = 0
  /** The fire button: pressed yet? */
  let pressed = false

  const finish = (how: Outcome): void => {
    order = null
    ended = how
  }

  /** Turn toward `heading`: -1|0|1, or 0 when one step's sweep covers it —
   * the deadband is the step itself, so it cannot oscillate. */
  const turnToward = (heading: number, delta: number): number => {
    const off = shortest(heading - rig.at().heading)
    return Math.abs(off) <= TURN_SPEED * delta ? 0 : Math.sign(off)
  }

  const step = (delta: number): void => {
    if (order === null) return
    switch (order.kind) {
      case 'watch':
        // Nothing to do with the hands: done at once, and the seat's mull
        // spaces the next ask (lib/game/ai.ts).
        finish('done')
        return
      case 'hold':
        rig.hold(order.skill)
        finish('done')
        return
      case 'turnTo': {
        const turn = turnToward(order.heading, delta)
        rig.intent(0, turn)
        if (turn === 0) finish('done')
        return
      }
      case 'walkTo': {
        const { x, z } = rig.at()
        const dx = order.x - x
        const dz = order.z - z
        const distance = Math.hypot(dx, dz)
        if (distance <= ARRIVE_WITHIN) {
          rig.intent(0, 0)
          finish('done')
          return
        }
        // The engine's own frame: heading 0 walks +z, positive swings to +x
        // (lib/game/movement.ts `step`), which is exactly atan2(dx, dz).
        const bearing = Math.atan2(dx, dz)
        const { heading } = rig.at()
        const off = shortest(bearing - heading)
        const walking = Math.abs(off) < WALK_CONE
        // THE WATER GUARD: about to stride, from dry ground, onto water —
        // stop where a player would. The probe looks along the HEADING,
        // because that is the way the legs actually carry the pig.
        if (
          walking &&
          !rig.wet(x, z) &&
          rig.wet(x + Math.sin(heading) * WATER_PROBE, z + Math.cos(heading) * WATER_PROBE)
        ) {
          rig.intent(0, 0)
          finish('blocked')
          return
        }
        rig.intent(walking ? 1 : 0, turnToward(bearing, delta))
        // No progress WHILE WALKING is the world saying no — a wall, a body,
        // the wedge counter — and the brain hears `blocked`. Turning on the
        // spot is not counted: a half-turn takes over four seconds and the
        // engine never refuses one.
        if (distance < best - PROGRESS) {
          best = distance
          stalled = 0
        } else if (walking && (stalled += delta) >= STUCK_SECONDS) {
          rig.intent(0, 0)
          finish('blocked')
        }
        return
      }
      case 'aimTo': {
        const off = order.angle - rig.aim()
        if (Math.abs(off) <= AIM_WITHIN) {
          rig.aimStep(0)
          finish('done')
          return
        }
        rig.aimStep(Math.sign(off))
        // The clamp answers some asks with silence (lib/game/aim.ts,
        // `clampAim`) — a mortar refuses to level out. Silence is `blocked`.
        if (Math.abs(off) < best - PROGRESS) {
          best = Math.abs(off)
          stalled = 0
        } else if ((stalled += delta) >= AIM_STUCK_SECONDS) {
          rig.aimStep(0)
          finish('blocked')
        }
        return
      }
      case 'fire': {
        if (!pressed) {
          pressed = true
          rig.fire(true, true)
          return
        }
        const gauge = rig.gauge()
        if (gauge === null || gauge >= charge) {
          // Letting go is what looses a charged weapon; a gun already went
          // on the press and reads null here.
          rig.fire(false, false)
          finish('done')
          return
        }
        rig.fire(true, false)
        return
      }
    }
  }

  const clear = (): void => {
    charge = 0
    best = Infinity
    stalled = 0
    pressed = false
  }

  return {
    idle: () => order === null,
    take(next) {
      order = next
      clear()
      if (next.kind === 'fire') charge = Math.max(0, Math.min(1, next.charge ?? 0))
    },
    step,
    outcome: () => ended,
    reset() {
      order = null
      ended = null
      clear()
      rig.intent(0, 0)
      rig.aimStep(0)
      rig.fire(false, false)
    }
  }
}
