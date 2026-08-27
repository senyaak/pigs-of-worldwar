// POISON — a bit on the pig, ten points at every one of its own turns, and
// any heal takes it off.
//
// The exe's status word is `[pig+0x3a4]` and the poison is its bit 8, set by
// the gas cloud's contact arm (lib/game/gas.ts) — and by the SWAMP, which is
// not built. There is NO timer on it. The per-turn pass over the acting pig
// (`0x4703A0`, five call sites in the turn machine) is two instructions:
//
// ```
// 47040a  test [pig+0x3a4], 8
// 470413  TakeDamage(0x500, kind 3)      ; ten points, at the pig's own turn
// ```
//
// — so a poisoned pig pays ten at the start of every turn it takes, for ever,
// with no floor: under eleven it dies the moment its turn comes round, which
// is how the fan FAQ describes it too. What ends it is `Pig::Heal` (0x467fd0),
// whose tail zeroes the whole status word (0x4680a6) — a medic dart, a health
// crate, the healing hands, any of them. The engine cures on the `healed`
// event, which every heal path already announces (lib/game/engine.ts).
//
// The read is `weapons/gas.md` in the disasm repo. Per-pig state lives in a
// Set OUT of the Pig type, the way the drowning counter does
// (lib/game/drowning.ts): the domain object stays data the whole battle
// agrees on, and a status is this module's own business.
//
// Pure, like the rest of lib/game.

import { hurt } from './health'
import { originY } from './body'
import type { Emit, PigId } from './events'
import type { Pig } from './game'

/** The exe's 0x500 in the 128ths its health counts: TEN points a turn. */
export const POISON_PER_TURN = 0x500 / 128

export interface Poison {
  /** Put the bit ON — a refresh is silent, only a fresh one is announced. */
  afflict(pig: Pig): void
  /** Whether this pig carries it. */
  poisoned(pig: Pig): boolean
  /** Take it off — the tail of `Pig::Heal`, reached through the `healed`
   * event. Silent: the heal's own number is the announcement. */
  cure(pig: PigId): void
  /**
   * The acting pig's own turn has just begun: the ten points, the floating
   * number and — under eleven health — the death. Called at the handover,
   * which is where the exe's turn machine runs its per-turn pass.
   */
  turnStarted(pig: Pig): void
  /** Drop the lot — a new battle. */
  clear(): void
}

export function createPoison(world: { training: boolean }, emit: Emit): Poison {
  /** Who carries the bit, by pig id. */
  const bitten = new Set<number>()

  return {
    afflict(pig) {
      if (bitten.has(pig.id)) return
      bitten.add(pig.id)
      emit({ kind: 'poisoned', pig: pig.id })
    },
    poisoned: (pig) => bitten.has(pig.id),
    cure(pig) {
      bitten.delete(pig)
    },
    turnStarted(pig) {
      if (!bitten.has(pig.id)) return
      const at = { x: pig.position.x, y: originY(pig.position.y, pig.body), z: pig.position.z }
      const outcome = hurt(pig, POISON_PER_TURN, world.training)
      // The number floats and the pig squeals off the same event every other
      // hit rides; the exe's 0x500 is over its own show-it threshold too.
      emit({ kind: 'damaged', at, amount: POISON_PER_TURN, pig: pig.id })
      // Nobody is credited: the exe's per-turn pass carries no attacker, and
      // ten from full can never reach the gib line.
      if (outcome === 'died') emit({ kind: 'killed', pig: pig.id })
    },
    clear: () => bitten.clear()
  }
}
