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
import { WALK_SPEED } from './movement'

/** How an order ended: carried out, or the world refused it. */
export type Outcome = 'done' | 'blocked'

/**
 * WHAT refused it — telemetry's half of `blocked`. The brain deliberately
 * never reads this: to it every refusal is the same "think of something
 * else". But to a person watching for stupidity they are three different
 * stories — a wall (or a body, or the wedge) under a walk, the water guard,
 * and the aim clamp — and a log that collapses them says only "stuck".
 */
export type Refusal = 'stuck' | 'water' | 'clamp'

/** What the actuator holds — the player's own controls, and the readings a
 * player has anyway. Handed in by the battle (lib/game/battle.ts). */
export interface Rig {
  /** Where the acting pig stands and faces. */
  at(): { x: number; z: number; heading: number }
  /** Whether that point is WATER — what a player sees at a glance, and what
   * the hands refuse to march into (the walk guard below). */
  wet(x: number, z: number): boolean
  /** Whether THIS pig crosses water alive — its class swims
   * (lib/game/drowning.ts). The water guard stands down for one that does:
   * for a swimmer the water is a road (docs/ai.md). */
  swims(): boolean
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
  /** …and what refused it, when that was `blocked`. Null after a `done`. */
  refusal(): Refusal | null
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

/**
 * A walk is TURN FIRST, THEN GO — play's own spec ("надо сделать повороты и
 * хождение полностью отдельными") — but the band that decides WHICH turns
 * get a full stop has now been set twice by play, in opposite directions,
 * and the second reading is the one that stands.
 *
 * It began strict, and every small elbow of a grid route became a full stop
 * ("повернулся — шаг — повернулся — шаг… тупил, пока время не кончилось").
 * It was softened to an eighth of a turn, and play watched a pig stop dead
 * at every corner of its route anyway. The correction, 2026-08-25: "поиск
 * пути ищет путь по точкам — но надо чтобы по дороге можно было выворачивать
 * на них; то что я говорил про повороты во время ходьбы касалось тупого
 * чередования и зависания." So the complaint was never about STEERING while
 * walking — it was about the alternation, one step then one turn then one
 * step, which is a route rebuilt under the pig rather than a bend taken on
 * the move (that half is fixed in lib/game/plan.ts).
 *
 * So the band goes to SIXTY DEGREES, and no further, and the geometry is
 * what sets the ceiling rather than taste: the legs cover 1040 units a
 * second and the turn rate is 32/4096 of a circle a frame, which is 42° a
 * second, so a bend taken on the move carves an arc about 1400 units
 * across. At 60° that is a wide corner; at 90° it is a loop that would miss
 * whatever the corner was there to avoid. Sharper than 60° is a reversal
 * and is still taken on the spot. The brain hands the next corner over a
 * stride early (lib/game/grunt.ts, `TURN_IN`) so the swing begins before the
 * corner rather than at it.
 */
const REALIGN = Math.PI / 3

/**
 * The circle a pig walking flat out and turning flat out travels: the legs
 * over the swing, `WALK_SPEED / TURN_SPEED`, about 1400 units — the same arc
 * the band above is reasoned from, written down instead of quoted.
 */
export const TURN_RADIUS = WALK_SPEED / TURN_SPEED

/**
 * …and its CHORD, which is the number the walk actually asks with.
 *
 * A target `d` away at a bearing error `off` sits outside the turning circle
 * — and so can be reached by riding it round — exactly when
 * `d ≥ 2·TURN_RADIUS·sin|off|`. (The turn centre is `R` off the beam, so the
 * distance from it to the target is `√(d² + R² − 2dR·sin|off|)`, and that is
 * `≥ R` precisely when the chord fits.) Inside it, no amount of steering
 * closes the gap: the pig orbits.
 */
export const TURN_CHORD = 2 * TURN_RADIUS

/** The shortest way round: (-π, π]. Brains borrow it (lib/game/grunt.ts). */
export const shortest = (angle: number): number => {
  const turn = 2 * Math.PI
  const wound = ((angle % turn) + turn) % turn
  return wound > Math.PI ? wound - turn : wound
}

export function createActuator(rig: Rig): Actuator {
  let order: Order | null = null
  let ended: Outcome | null = null
  let refused: Refusal | null = null
  /** The fire order's charge, normalised once at `take`. */
  let charge = 0
  /** The walk's (or the aim's) best distance so far, and how long since it
   * improved. */
  let best = Infinity
  let stalled = 0
  /** The walk's phase: facing the bearing yet? Turn first, then go. */
  let aligned = false
  /** The fire button: pressed yet? */
  let pressed = false

  const finish = (how: Outcome, why: Refusal | null = null): void => {
    order = null
    ended = how
    refused = why
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
        // TURN FIRST, THEN GO (see REALIGN above) — with one softening play
        // asked for after watching the strict version: a BIG turn happens on
        // the spot, but a bend inside the band is steered THROUGH while
        // walking ("повернулся — шаг — повернулся — шаг" was the strict
        // version taking every small elbow as a full stop).
        // …and the SECOND question, which is the one that had a pig walking
        // in circles: CAN the arc get there at all? A pig that walks and
        // turns at once travels a circle of `TURN_RADIUS`, and a point closer
        // than the chord `2R·sin|off|` lies INSIDE that circle — the legs
        // carry it round the target for ever, never closing, because the
        // bearing runs away exactly as fast as the pig can swing onto it.
        // That is play's report, and its diagnosis is play's too: "третий
        // свин круги нарезал на месте — он похоже хочет в точку прийти, но не
        // может из-за того что идёт и поворачивает одновременно."
        //
        // A stall would end the order after STUCK_SECONDS, but the brain then
        // orders the same leg again and the circle starts over, which is what
        // was on the screen. So the geometry is asked BEFORE the stride: too
        // close for the arc means turn on the spot, exactly as a big turn
        // does, and the walk resumes the moment the chord fits.
        const reaches = distance >= TURN_CHORD * Math.abs(Math.sin(off))
        if (Math.abs(off) <= REALIGN && reaches) aligned = true
        else if (aligned) aligned = false
        if (!aligned) {
          const turn = turnToward(bearing, delta)
          if (turn !== 0) {
            // Turning on the spot is never a stall: a half-turn takes over
            // four seconds and the engine never refuses one.
            rig.intent(0, turn)
            return
          }
          aligned = true
        }
        // THE WATER GUARD: about to stride, from dry ground, onto water —
        // stop where a player would. The probe looks along the HEADING,
        // because that is the way the legs actually carry the pig. A pig
        // whose class SWIMS is waved through: for it the water is a road,
        // and the brain's own transit rule keeps it from stopping there.
        if (
          !rig.swims() &&
          !rig.wet(x, z) &&
          rig.wet(x + Math.sin(heading) * WATER_PROBE, z + Math.cos(heading) * WATER_PROBE)
        ) {
          rig.intent(0, 0)
          finish('blocked', 'water')
          return
        }
        // Walking, with the small correction the band allows — the deadband
        // in `turnToward` keeps it from sawing about the bearing.
        rig.intent(1, turnToward(bearing, delta))
        // No progress WHILE WALKING is the world saying no — a wall, a body,
        // the wedge counter — and the brain hears `blocked`.
        if (distance < best - PROGRESS) {
          best = distance
          stalled = 0
        } else if ((stalled += delta) >= STUCK_SECONDS) {
          rig.intent(0, 0)
          finish('blocked', 'stuck')
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
          finish('blocked', 'clamp')
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
    aligned = false
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
    refusal: () => refused,
    reset() {
      order = null
      ended = null
      refused = null
      clear()
      rig.intent(0, 0)
      rig.aimStep(0)
      rig.fire(false, false)
    }
  }
}
