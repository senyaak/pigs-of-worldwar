// THE COMPUTER'S TURN: the brain asked while the hands are free, its answer
// picked up when it comes back, and the hands working the order into the same
// inputs the player's keys write (lib/game/ai.ts, lib/game/brainPort.ts).

import { AI_FUSE_SECONDS, AI_MULL_SECONDS, AI_START_SECONDS } from '../ai'
import type { Pig } from '../game'
import { isDead } from '../health'
import { passOrder } from '../orders'
import type { BattleCore } from './core'
import { factsFor } from './machineFacts'

/**
 * **PICK UP A DECISION THAT HAS COME BACK** — the second half of the ask
 * (lib/game/brainPort.ts).
 *
 * A local brain answers on the step it was asked; a brain in another
 * process answers whenever it is done, and this runs on every step of
 * the machine's turn until it does. What was true at the ask is re-read
 * HERE — the outcome and the refusal — because the seat only ever waits
 * with the hands idle, so neither can have changed, and one reading is
 * one story for the brain and the telemetry both.
 */
export const takeAnswer = (core: BattleCore, pig: Pig, step: number): void => {
  const { emit, actuator, brain, state } = core
  const decision = brain.answer()
  if (decision === null) return
  const decided = decision.order
  const previous = actuator.outcome()
  const refusal = actuator.refusal()
  // THE DECISION, ANNOUNCED — telemetry first, the same road `flung`
  // took (lib/game/events.ts): the session log is what a "he's acting
  // stupid" report gets settled against. Nothing in the engine listens.
  emit({
    kind: 'aiDecided',
    pig: pig.id,
    name: pig.name,
    at: { ...pig.position },
    heading: pig.heading,
    health: pig.health,
    previous,
    refusal,
    order: decided,
    thought: decision.thought
  })
  if (typeof process !== 'undefined' && process.env?.AI_LOG === '1') {
    console.log(
      `[ai] ${pig.name} @${Math.round(pig.position.x)},${Math.round(pig.position.z)} y=${Math.round(pig.position.y)} h=${pig.heading.toFixed(2)} hp=${pig.health} prev=${previous}${refusal ? `(${refusal})` : ''} -> ${JSON.stringify(decided)}`
    )
  }
  actuator.take(decided)
  state.lastOrder = decided.kind
  // …and the mull starts OVER: without this an instant order (watch,
  // hold) left the counter full and the brain re-decided every frame —
  // 904 decisions in a 185-second battle, measured before the reset.
  state.mullSeconds = 0
  actuator.step(step)
}

// **THE COMPUTER'S TURN.** The machine plays this side, so nothing the
// player holds is read past here — input is muted at the source too
// (input/battleInput.ts). The brain is asked what it wants only while
// the hands are FREE — think when idle, so an order is thought about
// once, not sixty times a second — and the actuator then works the order
// into the same inputs the player's keys write. **NO RETURN**: the
// driving code below carries those inputs out exactly as it would a
// player's, so every clamp and speed holds, the pass is SKIP TURN fired
// like any skill (`attack.begin` answers 'skip' and the one road through
// `endTurnBeat` stays one road), and the THINKING pose is the ordinary
// skill-in-hand rule further down. If the brain ever stalls, the clock
// above still runs the turn out.
export const machineStep = (core: BattleCore, acting: Pig, delta: number): void => {
  const { game, grenades, tumbles, actuator, brain, state } = core
  if (game.starting) {
    // The card is read out by the SEAT, not decided by the brain —
    // pacing is theatre (lib/game/ai.ts). `beginTurn` only OFFERS the
    // press, same as a player's key.
    if ((state.cardSeconds += delta) >= AI_START_SECONDS) game.beginTurn()
  } else if (
    state.loco.airborne !== null ||
    state.loco.getUp > 0 ||
    tumbles.has(acting) ||
    isDead(acting)
  ) {
    // **NO CONTROL, NO THINKING.** Play, after the mine: "при потере
    // контроля — никаких думаний!" A pig in the air, getting up or dead
    // is not a pig whose hands can take an order, and the walk it was
    // carrying out is not something to go on pressing keys for from
    // inside a flight — it is dropped, the controls stilled, and the
    // mull starts over when the pig is its own again. The exe's own
    // shape: `Pig::MayAct` is false through a fall and the AI's step
    // never reaches its think from there (0x467a10).
    if (!actuator.idle()) actuator.reset()
    // …and a thought STILL IN THE POST is dropped with the order it
    // would have become: a walk decided from where this pig stood
    // before the blast is an order about a world that is gone
    // (lib/game/brainPort.ts, `drop`).
    brain.drop()
    state.mullSeconds = 0
  } else if (!actuator.idle()) {
    actuator.step(delta)
    state.mullSeconds = 0
  } else if (core.proving) {
    // **A DUMMY ONLY EVER PASSES.** `[play]`, 2026-11-02: "real enemy pigs that
    // skip their turns" (docs/facts/proving-ground.md). Nothing is thought, so
    // the brain is not asked; the choice to pass is the only thing that is the
    // map's, and the pass itself is the ordinary one, through the same hands.
    actuator.take(passOrder(acting.holding))
    actuator.step(delta)
  } else if (brain.thinking()) {
    // **THE BRAIN IS OUT, AND THE BATTLE IS NOT WAITING FOR IT.** With a
    // brain in another process the ask and the answer are different
    // steps, and every step between them lands here: the hands stay
    // still — which is the mull, and looks like one — while the clock
    // runs, the world moves and the frame draws. A local brain never
    // reaches this branch at all; it answers on the step it was asked.
    takeAnswer(core, acting, delta)
  } else if (state.spent && grenades.thrown() === 0) {
    // **THE WEAPON HAS SPENT THE TURN: the seat is DONE.** Without this
    // the mull ran on through the blow's own beat and the brain started
    // a plan it could never finish — telemetry caught NOBBY, throw
    // detonated, deciding `turnTo` a second later and spinning on the
    // spot until the handover ("крутился на месте"). The one exception
    // is a THROWN grenade still live: the fire key is the detonator and
    // the decision to press it is still owed.
    state.mullSeconds = 0
  } else if (
    (state.mullSeconds += delta) >=
    (grenades.thrown() > 0
      ? AI_FUSE_SECONDS
      : // A route is ONE plan: a walk that ended well chains into the
        // next corner with no mull at all (see `lastOrder`).
        state.lastOrder === 'walkTo' && actuator.outcome() === 'done'
        ? 0
        : AI_MULL_SECONDS)
  ) {
    const facts = factsFor(core, acting)
    brain.ask(facts)
    takeAnswer(core, acting, delta)
  }
}
