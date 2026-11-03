// WHAT THE BRIEFING BAR SAYS when something is taken: a crate walked into, a
// pocket picked, a heal that found nobody.

import { handling } from '../../../../lib/game/events'
import type { BattleBus } from '../../../../lib/game/events'
import { UNLIMITED } from '../../../../lib/game/inventory'
import type { Collected } from '../../../../lib/game/scenery'
import { skillName } from '../../../../lib/game/skills'
import { armsMineLine, clipForPickup } from '../../../../lib/game/tutorial'
import type { UiCore } from './core'
import {
  FOUND_PROVISIONS,
  HEAL_ALREADY_WELL,
  HEAL_NOBODY,
  STEAL_NOTHING,
  STEAL_NO_REACH,
  TOO_MANY_TOYS
} from './lines'
import { sergeant } from './tutorial'

/** A pig by the id the bus named it with (lib/game/events.ts). */
export const nameOf = ({ state }: UiCore, id: number): string =>
  state.game?.players.flatMap((player) => player.pigs).find((pig) => pig.id === id)?.name ?? ''

/**
 * A crate the pig just walked into: what the bar says about it, and what
 * the sergeant makes of it.
 *
 * The wording is the exe's — the skill's own name with "X<count>" after it
 * unless it arrived unlimited (0x4CF9E8), `gtext 172` ">S FINDS USEFUL
 * PROVISIONS!" for a health crate, and `gtext 171` for a pig that already
 * has fifteen skills.
 */
export const collected = (core: UiCore, { skill, amount, given, result, pig }: Collected): void => {
  const { hud, state } = core
  if (result === 'full') {
    hud.say(state.battleText[TOO_MANY_TOYS] ?? '')
    return
  }
  // On the training ground the crate IS the script, and the exe says its
  // line FIRST: the tutorial is called at the top of `GiveSkill`, before
  // the pickup's own message is queued (lib/game/tutorial.ts). A crate line
  // starts the prompt counter over, whichever dispatcher spoke it.
  state.step = 0
  // …and the two crates that say "FOLLOW THE PATH THROUGH THE MINEFIELD" ARM
  // the mine line as they speak, which is what the exe does in the same two
  // arms (0x465D72, 0x465DBD).
  if (armsMineLine(skill, amount)) state.mineLineArmed = true
  sergeant(core, clipForPickup(skill, amount))
  if (skill === null) {
    hud.say((state.battleText[FOUND_PROVISIONS] ?? '').replace('>S', nameOf(core, pig)))
    return
  }
  const name = skillName(state.battleText, skill)
  hud.say(given === UNLIMITED ? name : `${name} X${given}`)
}

/** The pocket and the hands, off the bus. */
export const listenBar = (core: UiCore, bus: BattleBus): void => {
  const { hud, state } = core
  bus.on(
    handling({
      // The POCKET PICKED: the bar says what crossed, in the crate pickup's
      // own formats — the skill's name bare when the slot came unlimited,
      // "X<count>" otherwise — and the two refusals print the exe's literal
      // strings (weapons/espionage.md).
      stole: ({ skill, amount }) => {
        const name = skillName(state.battleText, skill)
        hud.say(amount === UNLIMITED ? name : `${name} X${amount}`)
      },
      stealFailed: ({ reason }) => {
        hud.say(reason === 'reach' ? STEAL_NO_REACH : STEAL_NOTHING)
      },
      // …and the same courtesy for the HANDS, which the exe does not do
      // (`HEAL_NOBODY`): a press that laid on nobody used to be a grunt of
      // pain and no reason at all.
      healFailed: ({ reason }) => {
        hud.say(reason === 'nobody' ? HEAL_NOBODY : HEAL_ALREADY_WELL)
      },
    })
  )
}
