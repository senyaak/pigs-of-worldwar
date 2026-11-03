// THE FIRE BUTTON, seen from the turn: its one write, ONE BLOW A TURN, and what
// a use spends (lib/game/spend.ts). What the press sets going is
// lib/game/attack.ts.

import type { Pig } from '../game'
import { isMine } from '../mines'
import { SKILL } from '../skills'
import { MINE_HURRY_SECONDS, endsTurn, hurryFor } from '../spend'
import type { BattleCore } from './core'
import { endTurnBeat } from './turnEnd'

/** The press answered; true when it was SKIP TURN and the turn is ending. */
export const fireButton = (core: BattleCore, acting: Pig): boolean => {
  const { game, grenades, emit, attack, state } = core
  // ONE BLOW A TURN: a pig that has already used a weapon answers the fire key
  // with nothing at all. Everything that ENDS the turn takes care of itself —
  // the beat is running by then and swallows the press anyway — so this is here
  // for the charges, which keep the turn and must not be planted twice.
  //
  // **Except while something it THREW is still live.** Play: "ты сломал взрывание
  // гранаты — больше нельзя нажать F чтобы подорвать по желанию." Right: the
  // hand-detonator lives inside `attack.begin`, so swallowing the press took the
  // grenade's own second use with it. Setting off what is already in the air is
  // not a second blow — it is the end of the first one.
  // …and neither is a HEAL: the hands are not a blow (they never set `struck`
  // below), and a pig that HAS struck — a charge planted, say — may still lay
  // them on inside the same turn. A MINE needs no exemption: the FIRST lay
  // does not set `struck` at all, and the SECOND sets it deliberately —
  // that is the "нельзя больше ничего использовать" half of its budget.
  if (
    state.struck &&
    acting.holding !== SKILL.SKIP_TURN &&
    acting.holding !== SKILL.HEALING_HANDS &&
    // A pocket picked is not a blow either — the exe's record keeps the
    // turn whole (lib/game/pickpocket.ts).
    acting.holding !== SKILL.PICK_POCKET &&
    grenades.thrown() === 0
  ) {
    attack.swallow()
  }

  // What the fire button set going — the whole of it, including WHICH weapon
  // answers (lib/game/attack.ts). SKIP TURN is the one answer this frame has
  // to act on itself, because ending a turn is the battle's business.
  const answered = attack.begin(acting, state.holding)
  if (answered === 'skip') {
    emit({ kind: 'skillUsed' })
    // Through the same beat the clock running out goes through: a skipped turn
    // is still a turn ending.
    endTurnBeat(core)
    return true
  }
  // …and a weapon that WENT OFF spends the turn, unless it is one of the
  // thirteen that do not — the planted explosives and the skills that are not
  // blows (lib/game/spend.ts). Asked of the PIG rather than of the cached
  // `holding`, which is only synced further down the frame and is a frame stale
  // here.
  if (answered === 'used') {
    // HEALING HANDS is the one use that is not a BLOW: the turn is not spent
    // (lib/game/spend.ts), and it does not take the turn's one strike either —
    // heal, walk on, and the rifle still answers. What it cannot do twice is
    // covered by its own bookkeeping: the charge only goes on a heal that
    // LANDED (lib/game/healing.ts). A MINE spends no strike either — its
    // budget below closes the hand itself, on the second lay.
    if (
      acting.holding !== SKILL.HEALING_HANDS &&
      acting.holding !== SKILL.PICK_POCKET &&
      !isMine(acting.holding)
    )
      state.struck = true
    // The exe counts it here too — this is the arm its own fire dispatcher
    // increments `[gameMode+0x334]` from (0x493E7A).
    state.weaponUses++
    if (endsTurn(acting.holding)) state.spent = true
    // A MINE has a BUDGET instead of a bill, and the numbers are PLAY's
    // (lib/game/spend.ts): the FIRST lay of a turn is free and the clock
    // runs on; the SECOND squeezes the clock to five seconds and closes
    // the hand — `struck` from here, so nothing else is used this turn
    // ("вторая мина уже не бесплатна - остаётся 5 секунд и нельзя больше
    // ничего использовать").
    else if (isMine(acting.holding)) {
      state.minesLaid++
      if (state.minesLaid >= 2) {
        game.hurryTurn(MINE_HURRY_SECONDS)
        state.struck = true
      }
    }
    // A PLANTED charge keeps the turn and takes the clock down to four seconds
    // instead: enough to get clear of the thing, and not enough to do anything
    // else with. TNT's own fuse is nearer six, so it goes off in the beat the
    // turn ends through (lib/game/walkAway.ts waits for it).
    else if (hurryFor(acting.holding) > 0) game.hurryTurn(hurryFor(acting.holding))
  }
  return false
}
