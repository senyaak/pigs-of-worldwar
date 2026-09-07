// THE SEAT'S FAR END — how the battle asks for a decision when the brain is
// not in the tick.
//
// The engine used to call `brain.decide(world)` inside one 1/60 step and take
// the order on the same step. That is a 400 ms flood standing on the frame
// the renderer was about to draw: play saw the whole picture stop for about a
// second every time a plan was made. So the call is cut in half — ASK, and
// pick the ANSWER up on a later step — and the wait lands wherever the brain
// lives instead of on the frame.
//
// **The pig standing still while it thinks is not a regression, it is the
// mull.** The seat already holds the hands for `AI_MULL_SECONDS` between
// decisions (lib/game/ai.ts); a thought that takes longer than the beat just
// makes the beat longer. Nothing else in the battle waits on it — the clock
// runs, the world moves, the frame draws.
//
// **What this costs and what pays for it.** A brain answering whenever it is
// done cannot draw from the battle's one random stream in a fixed order, so
// it gets a stream of its own (lib/game/ai.ts, `AiOracles.roll`). Lockstep is
// kept a rung up instead: the brain's ORDERS are inputs, exactly like a
// player's keys, so peers agree by replaying the same orders rather than by
// re-thinking the same thoughts. That is the design docs/ai.md wrote down as
// "the brain is a PLAYER", and play chose it for the same reason — "выложить
// в НОД процесс — как раз хорошо для сетевой игры, что НПС будет ходить на
// хосте и думать там".
//
// TWO implementations, and both are load-bearing. `localBrain` thinks on the
// spot and answers the same step, which is what a headless run wants — unit/
// and e2e/ have no Electron to put a process in, and a spec that had to pump
// frames waiting for a pipe would be testing the pipe. `remoteBrain` speaks
// the protocol below to whatever is on the other end. The app uses the
// second; everything else uses the first.
//
// Pure — the transport is injected, so this file knows nothing about
// Electron, ports or sockets.

import type { AiFacts, Brain, Thought } from './ai'
import type { AiGround } from './aiGround'
import { oraclesFor } from './aiGround'
import type { Order } from './orders'
import type { MapObject } from '../formats/pog'

/** An order, and the account of how it was reached — for the telemetry line
 * the seat writes. Nothing in the engine reads the account. */
export interface Decision {
  order: Order
  thought: Thought | null
}

/**
 * The seat's end of the brain.
 *
 * `ask` never blocks and returns nothing; `answer` is polled and yields each
 * decision exactly once. `thinking` is what stops the seat asking twice for
 * the same beat.
 */
export interface BrainPort {
  /** Ask for one decision. Ignored while one is already outstanding. */
  ask(facts: AiFacts): void
  /** The decision that has come back, once, or null. */
  answer(): Decision | null
  /** Whether an ask is still outstanding. */
  thinking(): boolean
  /**
   * Abandon whatever is outstanding: its answer is thrown away when it
   * arrives.
   *
   * The cue is the pig LOSING CONTROL mid-thought — flung, falling, dead. A
   * walk decided from where the pig stood before a mine went off is an order
   * about a world that is gone, and the seat's own "no control, no thinking"
   * rule (lib/game/battle.ts) would have thrown it away in the tick too. It
   * does NOT forget the turn's plan; that is `reset`.
   */
  drop(): void
  /** A new turn: the brain forgets the last one, and anything outstanding is
   * dropped with it. */
  reset(): void
  /** The battle is over. */
  close(): void
}

/**
 * How long the seat waits for an answer before writing that ask off and
 * mulling again.
 *
 * Long enough that a cold first plan is never cut short — it was measured at
 * ~400 ms and play has watched a whole second of it — and short enough that a
 * brain which died does not leave the machine standing until the turn clock
 * runs out.
 */
export const BRAIN_PATIENCE = 5

/**
 * A brain that thinks HERE, on the calling step, and answers at once.
 *
 * Used by every headless run and by any build with no process to put a brain
 * in. `thinking()` is never true after `ask` returns, so a seat written
 * against the port behaves exactly as the old in-tick call did.
 */
export function localBrain(brain: Brain, ground: AiGround, roll: () => number): BrainPort {
  let pending: Decision | null = null
  return {
    ask(facts) {
      const order = brain.decide({ ...facts, ...oraclesFor(ground, facts, roll) })
      pending = { order, thought: brain.explain?.() ?? null }
    },
    answer() {
      const held = pending
      pending = null
      return held
    },
    thinking: () => false,
    drop() {
      pending = null
    },
    reset() {
      pending = null
      brain.reset()
    },
    close() {
      pending = null
    }
  }
}

/** What has changed in the collision world since the battle began. */
export interface SceneryDelta {
  /** Records taken out of it — a crate collected, a barrel burst. */
  gone: number[]
  /** …and the ones that have MOVED: a driven vehicle is a solid box that
   * drives (lib/game/drive.ts), so its bucket membership follows it. */
  moved: { id: number; x: number; z: number; turn: number }[]
}

/** What the seat sends the far brain. */
export type BrainRequest =
  | {
      /**
       * One battle: the map to think about, and the objects on it.
       *
       * The TERRAIN is not in here — the far side reads the same `.PMG` and
       * `.PTG` off disk, because the flood's grid is 193 squared and the art
       * the water mask is built from is megabytes. WHERE off disk is not in
       * here either: the game directory is the host's business and reaches
       * the brain when it is started, so a renderer never has to hold a
       * filesystem path. The OBJECTS are sent because the engine's own list
       * is the authority: `fielded` drops some and the map script places
       * others.
       */
      kind: 'battle'
      map: string
      objects: MapObject[]
      seed: number
    }
  | {
      kind: 'ask'
      id: number
      facts: AiFacts
      /** The collision world's changes, sent WHOLE with every ask rather than
       * mirrored as a stream of events: it is a handful of numbers once a
       * second, and a snapshot cannot drift the way a stream can. */
      scenery: SceneryDelta
    }
  | { kind: 'reset' }
  | { kind: 'close' }

/** …and what comes back. */
export type BrainReply = { kind: 'order'; id: number; order: Order; thought: Thought | null }

/** The pipe, whatever it is made of. */
export interface BrainTransport {
  post(message: BrainRequest): void
  onMessage(handler: (message: BrainReply) => void): void
  close(): void
}

/**
 * A brain on the other end of `transport`.
 *
 * Every ask carries an id and every answer quotes it, and that is the whole
 * of the correctness argument: an answer whose id is not the one outstanding
 * was asked about a world that no longer exists, and is dropped unread.
 */
export function remoteBrain(
  transport: BrainTransport,
  setup: Extract<BrainRequest, { kind: 'battle' }>,
  scenery: () => SceneryDelta,
  now: () => number = () => Date.now() / 1000
): BrainPort {
  let asked = 0
  /** The id being waited for, or 0 for none. */
  let outstanding = 0
  let askedAt = 0
  let pending: Decision | null = null
  transport.onMessage((message) => {
    if (message.kind !== 'order' || message.id !== outstanding) return
    outstanding = 0
    pending = { order: message.order, thought: message.thought }
  })
  transport.post(setup)
  return {
    ask(facts) {
      if (outstanding !== 0) return
      asked++
      outstanding = asked
      askedAt = now()
      transport.post({ kind: 'ask', id: outstanding, facts, scenery: scenery() })
    },
    answer() {
      const held = pending
      pending = null
      return held
    },
    thinking() {
      if (outstanding === 0) return false
      if (now() - askedAt > BRAIN_PATIENCE) {
        outstanding = 0
        return false
      }
      return true
    },
    drop() {
      outstanding = 0
      pending = null
    },
    reset() {
      outstanding = 0
      pending = null
      transport.post({ kind: 'reset' })
    },
    close() {
      outstanding = 0
      pending = null
      transport.post({ kind: 'close' })
      transport.close()
    }
  }
}
