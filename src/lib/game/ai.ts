// The computer's turn: the BRAIN's seat, and the stub that holds it today.
//
// The design is docs/ai.md and the shape is three parts. The brain (here)
// is asked what it wants ONLY when the hands are free — think when idle —
// and answers with one order (lib/game/orders.ts). The actuator
// (lib/game/actuator.ts) then works that order through the player's own
// inputs, and the battle's ordinary driving code carries them out. What the
// brain DECIDES and what the world RESOLVES are different things, and every
// honest miss lives in that gap.
//
// Deterministic on purpose: a decision is a function of the world it is
// shown and nothing else — never the wall clock — because a lockstep battle
// has to roll the same on both machines (CLAUDE.md, "the engine steps in
// fixed quanta"). A real brain draws any chance from the battle's one
// random stream, and any trajectory it dry-runs takes a THROWAWAY rng
// (docs/ai.md) so the lookahead never eats the battle's own numbers.

import type { Order } from './orders'
import type { Outcome } from './actuator'
import { SKILL } from './skills'

/** What the brain is shown: the read-only face of the battle. It GROWS with
 * the brain — nothing goes on it until a decision reads it. */
export interface AiWorld {
  /** The beat at the top of the turn, still unresolved. */
  starting: boolean
  /** The turn clock, seconds. */
  timeLeft: number
  /** How the last order ended — `blocked` is the world saying no, and the
   * cue to think of something else. Null before the first order finishes. */
  previous: Outcome | null
}

export interface Brain {
  /** One decision. Asked only while the actuator is idle, so an order is
   * thought about once, not sixty times a second. */
  decide(world: AiWorld): Order
  /** A new turn: forget the old one. The battle calls it on every handover. */
  reset(): void
}

/**
 * How long the GET READY card hangs on the computer's turn before it begins.
 *
 * The beat at the top of a turn is a "press any key" aimed at a player and
 * runs 9.98 s unanswered (lib/game/game.ts); the machine answers sooner, and
 * the pause is only so the card can be read. `[deliberate]` — the remake's
 * own number, tune it in play.
 */
export const AI_START_SECONDS = 2

/** How long the pig stands THINKING (clip 46, the pose SKIP TURN wears)
 * before it passes. `[deliberate]`, same as above. */
export const AI_THINK_SECONDS = 2

/**
 * The stand-in: wait out the card, begin, take SKIP TURN in hand, think,
 * and pass. The pass IS a fire order — SKIP TURN used like any skill — so
 * it travels the player's whole road: `attack.begin` answers 'skip', the
 * same `endTurnBeat` runs, and the THINKING pose comes off the ordinary
 * skill-in-hand rule (lib/game/battle.ts), not off anything special here.
 */
export function createStubBrain(): Brain {
  let stage = 0
  return {
    decide(world) {
      if (world.starting) {
        if (stage === 0) {
          stage = 1
          return { kind: 'wait', seconds: AI_START_SECONDS }
        }
        return { kind: 'begin' }
      }
      // The beat can resolve on its own (game.ts burns it down in tick), so
      // the brain may never be asked while `starting` is up — the pass still
      // gets its think.
      if (stage < 2) stage = 2
      if (stage === 2) {
        stage = 3
        return { kind: 'hold', skill: SKILL.SKIP_TURN }
      }
      if (stage === 3) {
        stage = 4
        return { kind: 'wait', seconds: AI_THINK_SECONDS }
      }
      return { kind: 'fire', charge: 0 }
    },
    reset() {
      stage = 0
    }
  }
}
