// The computer's turn: the BRAIN's seat. The brain in it today is the GRUNT
// (lib/game/grunt.ts).
//
// The design is docs/ai.md and the shape is three parts. The brain (here)
// is asked what it wants ONLY when the hands are free — think when idle —
// and answers with one order (lib/game/orders.ts). The actuator
// (lib/game/actuator.ts) then works that order through the player's own
// inputs, and the battle's ordinary driving code carries them out. What the
// brain DECIDES and what the world RESOLVES are different things, and every
// honest miss lives in that gap.
//
// PACING IS NOT THINKING. The seat reads the GET READY card out and mulls
// between decisions (AI_START_SECONDS, AI_MULL_SECONDS — carried out in the
// battle's machine block); the brain is never asked to stall for effect, so
// there is no "wait" in the order vocabulary at all.
//
// Deterministic on purpose: a decision is a function of the world it is
// shown and nothing else — never the wall clock — because a lockstep battle
// has to roll the same on both machines (CLAUDE.md, "the engine steps in
// fixed quanta"). A real brain draws any chance from the battle's one
// random stream, and any trajectory it dry-runs takes a THROWAWAY rng
// (docs/ai.md) so the lookahead never eats the battle's own numbers.

import type { Order } from './orders'
import type { Outcome } from './actuator'
import type { Slot } from './inventory'

/** A pig as the brain SEES one — a position and a health bar, which is what
 * the screen shows a player about anybody else's pig. `y` is the SOLES,
 * Y-DOWN like everything in the engine: higher ground is the smaller y.
 * `name` is the plate over its head — the brain never reads it, but the
 * TELEMETRY line is written for a person, and "Marcel" reads where
 * "1234,-567" does not. */
export interface Seen {
  x: number
  y: number
  z: number
  health: number
  name?: string
}

/**
 * One choice as the price list weighed it (lib/game/evaluate.ts) — what the
 * telemetry keeps where the selection would throw the losers away. The
 * flip-flop class of bug is INVISIBLE without these: two foes pricing level
 * makes the winner swap on a stride, and a log that shows only winners shows
 * two sensible decisions instead of one oscillation.
 */
export interface Candidate {
  skill: number
  kind: 'gun' | 'melee' | 'lob' | 'plant' | 'crate'
  target: Seen
  /** What the selection compares — worth less the approach tax. */
  score: number
  /** The undiscounted HP differential. */
  worth: number
  /** What the brain BELIEVED it was worth, misjudgment applied — set only
   * on the options the selection actually weighed (lib/game/grunt.ts,
   * `MISJUDGE`; the per-target losers keep their exact arithmetic). What
   * the telemetry prints beside the true score. */
  judged?: number
}

/**
 * One decision, explained — why the order is the order. Telemetry only:
 * nothing in the engine reads a thought back, so it can never steer play.
 */
export interface Thought {
  /** Which rung of the brain's ladder answered (lib/game/grunt.ts). */
  rung: string
  /** Everything the price list weighed, losers included — negatives too,
   * because "why did it PASS" is a question about scores under zero. */
  candidates: Candidate[]
  /** The winner, by reference one of `candidates`, or null when nothing
   * scored above zero. */
  chose: Candidate | null
}

/** What the brain is shown: the read-only face of the battle. It GROWS with
 * the brain — nothing goes on it until a decision reads it. */
export interface AiWorld {
  /** The turn clock, seconds. */
  timeLeft: number
  /** How well this machine THINKS, 0..1 — the campaign ramp's dial
   * (lib/game/wits.ts). It slides weights (the crate appetite, the
   * misjudgment); it never picks behaviours. */
  wits: number
  /** The battle's ONE random stream (lib/game/random.ts) — what the brain's
   * misjudgment draws from (lib/game/grunt.ts, `MISJUDGE`), because a
   * lockstep battle rolls the same on both machines and the brain gets no
   * stream of its own. */
  roll(): number
  /** How the last order ended — `blocked` is the world saying no, and the
   * cue to think of something else. Null before the first order finishes. */
  previous: Outcome | null
  /** The pig being played: where it stands, what it holds, what it carries
   * — and where the weapon POINTS (aim units, lib/game/aim.ts), because a
   * brain that wants a different pitch has to know the one it has. */
  acting: {
    x: number
    y: number
    z: number
    heading: number
    aim: number
    /** Its own health bar — the blast pricing counts the thrower among the
     * bodies a bad throw costs (lib/game/evaluate.ts). */
    health: number
    holding: number | null
    carrying: Slot[]
  }
  /** Everybody alive on the other sides. */
  foes: Seen[]
  /** Everybody alive on this side, the acting pig excepted. */
  friends: Seen[]
  /**
   * The route from where the acting pig stands to a point, as the corners
   * of a walk — BEST EFFORT, the nearest reachable approach when the goal
   * cannot be had (lib/game/pathfind.ts). Null only when the start is
   * outside the world. Empty when standing as close as the ground allows.
   */
  route(to: { x: number; z: number }): { x: number; z: number }[] | null
  /** The collision ground at a point, Y-DOWN — what a dry-run throw lands
   * against (lib/game/evaluate.ts). Over water this is the SURFACE, not the
   * seabed: the engine douses a lob at the waterline, and a dry run that
   * flies on down to the basin floor invents an arc the throw cannot have. */
  groundAt(x: number, z: number): number
  /** Whether a point is WATER — a glance any player takes. */
  wet(x: number, z: number): boolean
  /** Whether the acting pig is IN the water right now. Water KILLS a
   * non-swimmer by degrees (docs/ai.md), so a swimming brain has exactly
   * one thought: the shore (lib/game/grunt.ts). */
  swimming: boolean
  /** Whether the acting pig's CLASS crosses water alive — the commando
   * family (lib/game/drowning.ts, `SWIMMERS`). Play's rule on what that
   * buys: water is TRANSIT, never a destination — "в воде делать нечего,
   * максимум сократить путь". The route may cross it; nothing is ever done
   * in it, because the engine empties swimming hands. */
  swims: boolean
  /** The machine's own grenade still in the air or rolling, or null. While
   * one is live the fire key is the DETONATOR (lib/game/lobs.ts), and the
   * brain's business is timing it. */
  thrown: { x: number; z: number; resting: boolean } | null
  /** A charge PLANTED and armed — the brain's business is being somewhere
   * else when it goes off (lib/game/grunt.ts, the flee). */
  planted: { x: number; z: number } | null
  /** The crates still on the ground: what walking over one would hand out —
   * a skill and rounds, or health when `skill` is null. */
  crates: { x: number; z: number; skill: number | null; amount: number }[]
}

export interface Brain {
  /** One decision. Asked only while the actuator is idle and the seat has
   * mulled, so an order is thought about once, not sixty times a second. */
  decide(world: AiWorld): Order
  /** The LAST decision explained — candidates, winner and the ladder rung —
   * for the telemetry line the seat writes (lib/game/battle.ts, `aiDecided`).
   * Optional: a brain owes an order, not an account of itself. */
  explain?(): Thought | null
  /** A new turn: forget the old one. The battle calls it on every handover. */
  reset(): void
}

/**
 * How long the GET READY card hangs on the computer's turn before the seat
 * answers it — a "press any key" aimed at a player runs 9.98 s unanswered
 * (lib/game/game.ts); the machine answers sooner, and the pause is only so
 * the card can be read. `[deliberate]` — the remake's own number, tune it
 * in play.
 */
export const AI_START_SECONDS = 2

/** How long the seat MULLS before each decision — the visible beat of
 * "thought" between one order finishing and the next being asked for.
 * `[deliberate]`, same as above. */
export const AI_MULL_SECONDS = 1

/** …except while the machine's OWN GRENADE is live: none at all. The fire
 * key is the detonator, and the window a thrown grenade spends rolling past
 * a foe is a fraction of a second — a once-a-second glance missed it every
 * time (measured on ESTU: the roll crossed the foe's whole core between two
 * mulls, detonated "at rest" 2300 units past him, and the endgame looped on
 * that throw for a simulated hour). Watching a fuse is not thinking; the
 * mull is theatre and the theatre yields to the trigger. */
export const AI_FUSE_SECONDS = 0
