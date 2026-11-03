// WHAT THE BATTLE HANDS BACK when it is put away: the verdict, side 0's fallen
// and kills by roster slot, and the promotion points picked up.

import { handling } from '../../../../lib/game/events'
import type { BattleBus } from '../../../../lib/game/events'
import { clipForClosing } from '../../../../lib/game/tutorial'
import type { UiCore } from './core'
import { leave } from './open'
import { sergeant } from './tutorial'

/** The deaths, the points and the end of the mission, off the bus. */
export const listenRecord = (core: UiCore, bus: BattleBus): void => {
  const { state } = core
  bus.on(
    handling({
      // **A pig of OURS went down.** Its squad index is its slot in the
      // save's roster — side 0 fields `squad.slice(0, fieldedAt(position))`
      // in roster order — and the ORDER of this list is what `fell` encodes
      // (lib/game/roster.ts). **And a pig of ours may have done it**: `by`
      // is the weapon's owner, and an enemy it brought down goes on that
      // slot's kill tally — the count the squad screen's board prints.
      killed: ({ pig, by }) => {
        const one = state.game?.players[0]?.pigs.find((p) => p.id === pig)
        if (one && !state.fallen.includes(one.index)) state.fallen.push(one.index)
        if (by === undefined || one) return
        const killer = state.game?.players[0]?.pigs.find((p) => p.id === by)
        if (killer) state.kills[killer.index] = (state.kills[killer.index] ?? 0) + 1
      },
      promotionPoint: ({ id }) => {
        if (!state.points.includes(id)) state.points.push(id)
      },
      // **THE LAST DUMMY IS DOWN.** The sergeant signs off — one of two lines,
      // by how many turns it took (lib/game/tutorial.ts) — over the beat the
      // engine holds the battle in.
      missionOver: ({ won, turns }) => {
        state.verdict = won ? 'won' : 'lost'
        if (won) sergeant(core, clipForClosing(turns))
      },
      // …and that beat has run out: the battle goes away, exactly as the LEAVE
      // button puts it away (lib/game/endOfGame.ts).
      //
      // NOT on the spot, though. This arrives from inside `engine.update`,
      // which is called from the middle of the scene's own frame — and the
      // rest of that frame still draws the thing `leave` would have disposed.
      // A microtask runs as soon as the frame's stack is empty and before the
      // next one, which is exactly late enough.
      missionEnded: () => queueMicrotask(() => leave(core))
    })
  )
}
