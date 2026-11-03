// THE BRAIN'S WHOLE VIEW of a turn: read-only copies, nothing live, because the
// brain may not be in this process at all (docs/ai.md).

import type { AiFacts } from '../ai'
import { drowns } from '../drowning'
import type { Pig } from '../game'
import { blastRange, lobOf } from '../grenade'
import { isDead, maxHealthFor } from '../health'
import { SKILL } from '../skills'
import type { BattleCore } from './core'

/** What the machine is told when it is asked. */
export const factsFor = (core: BattleCore, acting: Pig): AiFacts => {
  const { game, scenery, grenades, sights, actuator, state } = core
  // Hands free and the mulling beat spent: ASK. The facts handed over
  // are the brain's whole view — read-only copies, nothing live
  // (docs/ai.md) — and they are DATA, because the brain may not be in
  // this process at all (lib/game/brainPort.ts). The answer is picked
  // up in the branch above, which may be this same step (a local
  // brain) or a dozen steps later (a brain down a pipe).
  const AI_LOG = typeof process !== 'undefined' && process.env?.AI_LOG === '1'
  const actingSide = game.players.indexOf(game.currentPlayer)
  const seen = (
    pig: Pig
  ): { x: number; y: number; z: number; health: number; id: number; name: string } => ({
    x: pig.position.x,
    y: pig.position.y,
    z: pig.position.z,
    health: pig.health,
    // WHICH pig — what a turn's plan is held on (lib/game/plan.ts):
    // a plan about a SPOT quietly transfers to whoever walks onto it.
    id: pig.id,
    // For the telemetry line alone — the brain never reads a name
    // (lib/game/ai.ts, `Seen`).
    name: pig.name
  })
  // How the LAST order ended, read once: the brain's cue and the
  // telemetry's story must be the same reading.
  const previous = actuator.outcome()
  const refusal = actuator.refusal()
  const facts: AiFacts = {
      timeLeft: game.timeLeft,
      // …and how long a whole turn is here, so the price list can cost
      // a walk in TURNS rather than in an opinion (evaluate.ts).
      turnSeconds: game.turnSeconds,
      wits: core.wits ?? 0,
      previous,
      acting: {
        x: acting.position.x,
        y: acting.position.y,
        z: acting.position.z,
        heading: acting.heading,
        aim: sights.angle(),
        health: acting.health,
        maxHealth: maxHealthFor(acting.pigClass),
        holding: acting.holding,
        carrying: acting.carrying.map((slot) => ({ ...slot }))
      },
      foes: game.players.flatMap((player, side) =>
        side === actingSide
          ? []
          : // A DISGUISED pig is not on the list at all — the exe's
            // `Team::BuildTargetList` skips the hidden flag before
            // anything is priced (lib/game/hide.ts).
            player.pigs.filter((pig) => !isDead(pig) && !pig.hidden).map(seen)
      ),
      friends: game.currentPlayer.pigs
        .filter((pig) => pig !== acting && !isDead(pig))
        .map(seen),
      swimming: state.loco.swimming,
      swims: !drowns(acting.pigClass),
      // The machine's own live grenade: the newest lob while any
      // THROWN one is live — planted charges are not it, and must
      // never be detonated from beside (lib/game/lobs.ts).
      thrown: (() => {
        if (grenades.thrown() === 0) return null
        const head = grenades.head()
        return head === null
          ? null
          : {
              x: head.x,
              z: head.z,
              resting: head.resting,
              // How fast it still moves: the brain's own "it is down"
              // bar (lib/game/grunt.ts, SETTLED) — the draw flag's bar
              // is so low a missed throw rolled until its fuse blew it
              // (telemetry, GINGER 2026-08-24).
              speed: Math.hypot(head.vx, head.vy, head.vz),
              age: head.age,
              // The blast's outer edge — what the dumbest detonation
              // window is as wide as (lib/game/grunt.ts).
              rim: blastRange(lobOf(head.skill) ?? lobOf(SKILL.GRENADE)!)
            }
      })(),
      // …and a PLANTED one: live but not thrown — the newest lob is it,
      // because planting is the only other way a lob gets made.
      planted: (() => {
        if (grenades.live() <= grenades.thrown()) return null
        const head = grenades.head()
        return head === null ? null : { x: head.x, z: head.z }
      })(),
      crates: scenery
        .remaining()
        .filter((one) => one.kind === 'crate')
        .map((one) => ({ x: one.x, z: one.z, skill: one.skill, amount: one.amount }))
    }
  return facts
}
