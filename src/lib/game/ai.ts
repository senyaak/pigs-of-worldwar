// The computer's turn: the seam an AI will live in, and the stub that holds
// the seat today.
//
// The original has one — the exe carries an AI passability map (0x461f60)
// and per-class behaviour nobody has read yet — and the remake has none.
// What exists NOW is the shape: which side the machine plays is the battle's
// `computer(side)` (side 0 is the campaign's own; in the app every other
// side is the machine's), input never drives a computer pig
// (input/battleInput.ts), and the machine's turn travels the one road every
// turn takes — `endTurnBeat`, the WALK AWAY beat, the handover
// (lib/game/battle.ts). The brain only says WHAT the side does with its
// turn, and today's brain thinks for a moment and PASSES.
//
// Deterministic on purpose: an order is a function of the battle's own
// stepped time, never the wall clock, because a lockstep battle has to roll
// the same on both machines (CLAUDE.md, "the engine steps in fixed quanta").
// A real brain keeps that rule and draws any chance from the battle's one
// random stream.
//
// Pure: stepped time in, orders out.

/** What the brain wants done this step. The battle carries it out. */
export type Order = 'wait' | 'begin' | 'think' | 'pass'

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

export interface Brain {
  /** One engine step of the computer's turn: what it wants done now.
   * `starting` is the beat at the top of the turn, still unresolved. */
  update(delta: number, starting: boolean): Order
  /** A new turn: forget the old one. The battle calls it on every handover. */
  reset(): void
}

/** The stand-in: wait out the card, begin, think, pass. */
export function createStubBrain(): Brain {
  let seconds = 0
  let thought = false
  return {
    update(delta, starting) {
      seconds += delta
      if (starting) {
        if (seconds < AI_START_SECONDS) return 'wait'
        seconds = 0
        return 'begin'
      }
      // 'think' is said ONCE — it is the order that takes SKIP TURN in hand
      // and puts the pose on; the wait after it is the thinking itself.
      if (!thought) {
        thought = true
        seconds = 0
        return 'think'
      }
      return seconds >= AI_THINK_SECONDS ? 'pass' : 'wait'
    },
    reset() {
      seconds = 0
      thought = false
    }
  }
}
