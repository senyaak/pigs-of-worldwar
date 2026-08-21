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
 * the screen shows a player about anybody else's pig. */
export interface Seen {
  x: number
  z: number
  health: number
}

/** What the brain is shown: the read-only face of the battle. It GROWS with
 * the brain — nothing goes on it until a decision reads it. */
export interface AiWorld {
  /** The turn clock, seconds. */
  timeLeft: number
  /** How the last order ended — `blocked` is the world saying no, and the
   * cue to think of something else. Null before the first order finishes. */
  previous: Outcome | null
  /** The pig being played: where it stands, what it holds, what it carries. */
  acting: {
    x: number
    z: number
    heading: number
    holding: number | null
    carrying: Slot[]
  }
  /** Everybody alive on the other sides. */
  foes: Seen[]
  /** Everybody alive on this side, the acting pig excepted. */
  friends: Seen[]
}

export interface Brain {
  /** One decision. Asked only while the actuator is idle and the seat has
   * mulled, so an order is thought about once, not sixty times a second. */
  decide(world: AiWorld): Order
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
