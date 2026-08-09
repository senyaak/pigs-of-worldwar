// The battle's whole sound domain, assembled: the bank, the listener on the
// engine's events, the pig's own voice, and the console that rebinds them.
//
// It exists so that NOTHING outside `audio/` has to know a sound is being made.
// The scene used to build all four itself, which is what `npm run boundaries`
// now refuses: graphics draws, and this listens.
//
// The bank loads asynchronously — a battle's first frames are silent, and an
// install with no `Audio` folder is silent for good — so everything here asks
// for it through a getter rather than holding one.

import { SILENT, loadBank } from './bank'
import type { Bank } from './bank'
import { createBattleSounds } from './battle'
import type { BattleSounds } from './battle'
import { createBattleAudio } from './battleAudio'
import { createPigVoice } from './pigVoice'
import type { PigVoice } from './pigVoice'
import { createSoundConsole } from './console'
import { handling } from '../../../lib/game/events'
import type { BattleBus } from '../../../lib/game/events'
import type { SceneSound } from '../contracts/sound'

/** The battle's sound bank — 99 numbered effects (lib/formats/srl.ts). */
const GAME_SOUNDS = 'Audio/sfxday.srl'

export interface BattleSound extends SceneSound {
  dispose(): void
}

/**
 * Subscribe the whole of sound to `bus`. Nothing is returned that draws, and
 * nothing that draws is needed to build it.
 */
export function createBattleSound(bus: BattleBus): BattleSound {
  let bank: Bank = SILENT
  let sounds: BattleSounds = createBattleSounds(bank)
  void loadBank(GAME_SOUNDS).then((loaded) => {
    bank = loaded
    sounds = createBattleSounds(bank)
  })
  // …and the console gets at it, because half the table is a name pick that
  // only play can settle: `pow.sfx.list()`, `pow.sfx.set('jump', …)`.
  if (window.pow) window.pow.sfx = createSoundConsole(() => bank)

  const audio = createBattleAudio(() => bank)
  bus.on(audio.listen)
  /** The pigs' own barks. The gun arm of `Pig::Fire` says one every shot,
   * walking twelve lines in rotation (audio/pigVoice.ts). */
  const voice: PigVoice = createPigVoice()
  bus.on(handling({ bark: ({ player }) => voice.fire(player) }))

  return {
    follow: (loco, inWater) => sounds.follow(loco, inWater),
    reset: () => sounds.reset(),
    chuteOverhead: audio.chuteOverhead,
    played: () => bank.played(),
    spoken: () => voice.spoken(),
    dispose() {
      voice.dispose()
      bank.dispose()
    }
  }
}
