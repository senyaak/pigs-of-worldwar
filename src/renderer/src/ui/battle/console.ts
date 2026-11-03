// THE CONSOLE: `pow.swapMap`, `pow.step`, `pow.give` and the rest — the map
// selector and the testing hooks, with no UI by request.

import { give } from '../../../../lib/game/inventory'
import { TRAINING_STEPS } from '../../../../lib/game/training'
import { controller } from '../../input/controller'
import { BUILT_MAPS } from '../mapData'
import type { UiCore } from './core'
import { SAMPLE_LINE } from './lines'
import { normalizeMap, start } from './open'
import { updateHud } from './paint'
import { setPaused } from './pause'
import { goToStep, standingStep } from './steps'

/** Hang the battle's verbs off `window.pow`. */
export const exposeConsole = (core: UiCore): void => {
  const { hud, speech, state } = core
  window.pow = {
    ...(window.pow ?? { controller }),
    map: () => state.map,
    swapMap: async (name?: string) => {
      if (!name) {
        const files = await window.api.listFiles()
        const maps = files
          .map((f) => f.path.match(/^Maps[\\/](.+)\.PMG$/i)?.[1])
          .filter((n): n is string => n !== undefined)
          .sort()
        console.log(
          `usage: pow.swapMap('ARTGUN') — shipping maps: ${maps.join(', ')}; ` +
            `built: ${BUILT_MAPS.join(', ')}`
        )
        return false
      }
      if (!state.scene) {
        console.log('no battle is up — start one from the menu first')
        return false
      }
      return start(core, normalizeMap(name), true)
    },
    // The bar has no script driving it yet, so this is how it is watched:
    // any line, or the tutorial's own long one by default.
    say: (text?: string) => hud.say(text ?? state.battleText[SAMPLE_LINE] ?? ''),
    // Every clip the sergeant has spoken — **the APP's list, not this
    // battle's**, and it used to say otherwise here. The bank deliberately
    // outlives a mission (audio/speech.ts, and `002/audio.spec.ts` pins it),
    // and `heard` is only emptied by `dispose`. The script runs on speech, so
    // this is the only way to watch it work; a spec reading ORDER out of it has
    // to take a mark first and read its own stretch, which cost
    // `002/tutorial.spec.ts` a red the day the spec ahead of it stopped failing
    // half way through and started speaking into the list.
    spoken: () => speech.spoken(),
    /**
     * **The training ground, step by step.** `pow.step()` says where it stands,
     * `pow.step(9)` goes to the bazooka — the same jump F11 and F12 make
     * (lib/game/training.ts). The nine steps are CAMP's own chain: the bayonet,
     * the rifle, the sniper rifle, the two grenades, the gap in the bridge, the
     * TNT, the shelter and the bazooka.
     */
    step: async (want?: number) => {
      if (want === undefined) {
        const names = TRAINING_STEPS.map((one, index) => `${index} ${one.name}`).join(', ')
        console.log(`training step ${standingStep(core)} — usage: pow.step(9). ${names}`)
      } else {
        await goToStep(core, want)
      }
      return standingStep(core)
    },
    // …and the console is how a weapon nobody's crate carries gets tried.
    // The training ground hands out a bayonet and then a rifle and that is
    // the whole of it, so a GRENADE cannot be reached by playing at all —
    // `pow.give(19)` puts one in the acting pig's hands. The remake's own,
    // like `pow.swapMap`: the original has no such thing.
    give: (skill?: number, amount = 5) => {
      if (skill === undefined || !state.game) {
        console.log("usage: pow.give(19) — 19 is GRENADE; see pow.hud for the rest")
        return false
      }
      give(state.game.currentPig.carrying, skill, amount)
      state.game.currentPig.holding = skill
      updateHud(core)
      return true
    },
    // Whether the game is FROZEN, and a way to freeze it that is not the
    // keyboard — the same reader every view gives a spec (docs/testing.md).
    battle: {
      paused: () => state.paused,
      /** The menu's own state while it is up — which row is lit, whether the
       * question is armed, and the three settings. */
      menu: () => (state.pause ? { ...state.pause } : null),
      pause: (wanted = true) => {
        setPaused(core, wanted)
        return state.paused
      }
    }
  }
}
