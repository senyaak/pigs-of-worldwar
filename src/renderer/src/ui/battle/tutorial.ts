// THE TUTORIAL'S SERGEANT: the clip and its line, the two opening beats, and
// the script's own counters stepped off the bus (lib/game/tutorial.ts).

import { handling } from '../../../../lib/game/events'
import type { BattleBus } from '../../../../lib/game/events'
import {
  CLIP_FOR,
  MENU_ARMED,
  MINE_LINE,
  WASTED_TURN_LINE,
  clipForChosen,
  clipForMenu,
  clipForPlacement,
  isTrainingGround,
  lineFor
} from '../../../../lib/game/tutorial'
import type { Cue } from '../../../../lib/game/tutorial'
import type { UiCore } from './core'

/**
 * The tutorial speaking: the clip out of `Speech/Sku1/Train1`, and its line
 * through the briefing bar. Only on the training ground, and clip 0 is the
 * script's own "say nothing" (lib/game/tutorial.ts). Every step in the
 * script arrives here — the opening beats, a crate collected, a crate
 * placed.
 */
export const sergeant = (core: UiCore, clip: number): void => {
  const { hud, speech, state } = core
  if (!isTrainingGround(state.map) || clip === 0) return
  speech.play(clip)
  // Several of the lines are a single space — those steps are voice alone,
  // and the bar has nothing to open for.
  hud.say(lineFor(state.battleText, clip).trim())
}

/** The two beats that are not an object's doing: each fires once a battle. */
export const cue = (core: UiCore, kind: Cue): void => {
  const { state } = core
  if (state.cued.has(kind)) return
  state.cued.add(kind)
  sergeant(core, CLIP_FOR[kind])
}

/** The script steps that come off the bus rather than off a crate. */
export const listenTutorial = (core: UiCore, bus: BattleBus): void => {
  const { speech, state } = core
  bus.on(
    handling({
      placed: ({ skill, amount }) => {
        state.step = 0
        sergeant(core, clipForPlacement(skill, amount))
      },
      menuOpened: ({ first }) => {
        // The one line of the script that had nothing to fire it, and its gate
        // turned out to be the MENU: the exe reads the first cell, which is
        // the game object's own first dword (lib/game/tutorial.ts). Spoken
        // BEFORE the counter is armed, as the exe speaks it before writing 1.
        sergeant(core, clipForMenu(first, state.step))
        state.step = MENU_ARMED
      },
      chose: ({ skill }) => {
        // Never from a standing start: a menu that was not opened since the
        // last crate line counts nothing (`cmp eax,1 ; jl`, 0x4933c5).
        if (state.step < MENU_ARMED) return
        state.step += 1
        sergeant(core, clipForChosen(skill, state.step, speech.saying() === 0))
      },
      // **A MINE.** Once per minefield, and only after the crate that sent the
      // pig into one — the flag is the exe's `[gameMode+0x330]` and it is
      // spent by speaking. Its own site in the exe is the projectile
      // constructor, so it answers a mine however it was set off.
      mineTripped: () => {
        if (!state.mineLineArmed) return
        // The exe drops the line outright while the sergeant is mid-sentence
        // and leaves the flag clear, so it comes round on the next mine.
        if (speech.saying() !== 0) return
        state.mineLineArmed = false
        sergeant(core, MINE_LINE)
      },
      // **A TURN NOBODY DID ANYTHING WITH.** The clock ran out and no weapon
      // was used all turn; the engine counts that the way the exe does
      // (lib/game/battle.ts, `weaponUses`).
      turnWasted: () => {
        if (speech.saying() === 0) sergeant(core, WASTED_TURN_LINE)
      },
    })
  )
}
