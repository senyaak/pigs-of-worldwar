// THE SERGEANT: the score both of his moments turn on, the remark at the end of
// a turn, and the beat that remark holds before the handover
// (lib/game/sergeant.ts).

import { ANIM } from '../locomotion'
import { SARGE_FLOOR, SARGE_WON, noTally, sargeAfterTurn, winOrLose } from '../sergeant'
import type { BattleCore } from './core'
import { flyOn } from './flight'
import { handOver } from './handover'

/**
 * The acting side's WIN OR LOSE value — its total health against every other
 * side's (lib/game/sergeant.ts, 0x498620). Both of the sergeant's moments
 * turn on it, and it is the ACTING side's in each: the exe takes
 * `[turn+0x4fc]`'s own total and compares that one to the rest.
 */
export const standing = (core: BattleCore): number => {
  const { game } = core
  const health = game.players.map((player) =>
    player.pigs.reduce((sum, pig) => sum + Math.max(0, pig.health), 0)
  )
  const mine = game.players.indexOf(game.currentPlayer)
  return winOrLose(health[mine] ?? 0, health.filter((_, side) => side !== mine))
}

/**
 * Open the sergeant's beat, or answer false for a turn he sits out.
 *
 * **The remark is gated on the SCORE as well as on the kill** and that is the
 * arm, not a taste (0x4983CD): well done for killing only while your side
 * leads on total health, bad luck for losing one only while it trails. A kill
 * from behind is met with silence.
 *
 * The tally is cleared here rather than at the handover because the exe
 * clears it at the START of a turn (0x48FD92) — same moment, and doing it
 * here keeps the two reads of it, this one and the clear, side by side.
 */
export const beginSarge = (core: BattleCore): boolean => {
  const { game, anim, emit, computerTurn, state } = core
  const said = sargeAfterTurn(state.tally, standing(core), state.sargeLines)
  state.tally = noTally()
  if (!said) return false
  // **He speaks to the PLAYER and to nobody else** — `[play]`, the same rule
  // that moved the turn-start goad. This remark reads the ACTING side's own
  // tally, so on the machine's turn it congratulated the enemy for killing
  // one of ours. The tally above is still cleared, because that happens at
  // every turn's start whoever took it (0x48FD92).
  if (computerTurn()) return false
  state.sarge = { floor: SARGE_FLOOR }
  // The camera comes off the blow and back to the pig that made it — which is
  // what `focus` would do at the handover anyway, only the remark happens
  // first and wants to be watched.
  state.aftermath = null
  const acting = game.currentPig
  const cheer = said.section === SARGE_WON ? ANIM.CHEERED : ANIM.SLUMPED
  anim.playOnce(acting, cheer[core.random() < 0.5 ? 0 : 1])
  emit({ kind: 'sergeant', section: said.section, line: said.line })
  return true
}

/** The sergeant's remark, while he says it; true while it has the frame. */
export const sargeBeat = (core: BattleCore, delta: number): boolean => {
  const { attack, state } = core
  // **THE SERGEANT'S REMARK.** The turn is over, nobody is driving, and the
  // camera is back on the pig that took the shot while he says his piece.
  if (state.sarge) {
    state.jumpRequested = false
    attack.swallow()
    // A pig the last blow threw is still in the air — its flight owns its
    // position for as long as it lasts, remark or no remark (the same
    // rule the walk-away beat holds above).
    flyOn(core, delta)
    state.sarge.floor = Math.max(0, state.sarge.floor - delta)
    if (state.sarge.floor <= 0 && !state.sargeSpeaking) {
      state.sarge = null
      handOver(core)
    }
    return true
  }
  return false
}
