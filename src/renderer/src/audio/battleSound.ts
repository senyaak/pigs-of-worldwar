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

import { SILENT, sharedBank } from './bank'
import type { Bank } from './bank'
import { createBattleSounds } from './battle'
import type { BattleSounds } from './battle'
import { createBattleAudio } from './battleAudio'
import { createPigVoice } from './pigVoice'
import { sarge as theSarge } from './sarge'
import type { Sarge } from './sarge'
import type { PigVoice } from './pigVoice'
import { createSoundConsole } from './console'
import { createMusic, trackFor } from './music'
import type { Music } from './music'
import { BATTLE_SOUNDS, playCue } from './battle'
import type { Cue } from './battle'
import { handling } from '../../../lib/game/events'
import type { BattleBus } from '../../../lib/game/events'
import { skinOf, speechOf } from '../../../lib/game/nations'
import type { SceneSound } from '../contracts/sound'

/** The battle's sound bank — 99 numbered effects (lib/formats/srl.ts). */
export const GAME_SOUNDS = 'Audio/sfxday.srl'

export interface BattleSound extends SceneSound {
  /** Which of the sergeant's lines have been played (audio/sarge.ts). */
  sargeSpoken(): string[]
  /** Which music clips have been started, in order — a spec's only ear on the
   * level's track (audio/music.ts). */
  music(): number[]
  dispose(): void
}

/**
 * Subscribe the whole of sound to `bus`. Nothing is returned that draws, and
 * nothing that draws is needed to build it.
 *
 */
export function createBattleSound(bus: BattleBus, nations: number[] = []): BattleSound {
  let bank: Bank = SILENT
  let sounds: BattleSounds = createBattleSounds(bank)
  /**
   * A cue asked for BEFORE the bank arrived, held rather than dropped.
   *
   * The battle's very first turn begins the frame the opening drop lands, and
   * on a slow load that is still inside the bank's own `await` — so the one
   * noise the player's first turn makes would simply be lost. One slot, not a
   * queue: nothing else here fires that early, and a backlog played all at
   * once the moment the bank lands would be worse than silence.
   */
  let waiting: Cue | null = null
  void sharedBank(GAME_SOUNDS).then((loaded) => {
    bank = loaded
    sounds = createBattleSounds(bank)
    if (waiting) {
      playCue(bank, waiting)
      waiting = null
    }
  })
  /** Play through the bank, or hold it for the bank to arrive. */
  const cue = (which: Cue): void => {
    if (bank === SILENT) waiting = which
    else playCue(bank, which)
  }
  // …and the console gets at it, because half the table is a name pick that
  // only play can settle: `pow.sfx.list()`, `pow.sfx.set('jump', …)`.
  if (window.pow) window.pow.sfx = createSoundConsole(() => bank)

  const audio = createBattleAudio(() => bank)
  bus.on(audio.listen)
  /** The pigs' own barks. The gun arm of `Pig::Fire` says one every shot,
   * walking twelve lines in rotation (audio/pigVoice.ts) — and a pig DIES on
   * a line too: the exe speaks category 04/05 the moment the dying clip
   * starts (0x46f947, the state 6→7 edge — exactly what `dying` announces),
   * unless it drowned, whose noise is the gurgle (audio/battleAudio.ts). */
  const voice: PigVoice = createPigVoice()
  /** What this side SPEAKS — its nation's skin's row, read 2026-08-24
   * (lib/game/nations.ts, `SKIN_SPEECH`). A battle with no nations handed in
   * (a console swap, a spec) is British throughout. */
  const tongue = (player: number): string => speechOf(nations[player] ?? player)
  bus.on(
    handling({
      bark: ({ player, voice: who }) => voice.fire(who, tongue(player)),
      dying: ({ player, voice: who, wet }) => {
        if (!wet) voice.death(who, tongue(player))
      }
    })
  )

  /** The level's MUSIC — a side's four tracks, one a turn (audio/music.ts). */
  const music: Music = createMusic()

  /**
   * THE SERGEANT, and the one thing he says that is built: well done for a
   * KILL, bad luck for a LOSS, at the end of the turn that did it. The rules
   * pick the line (lib/game/sergeant.ts); this speaks it.
   *
   * BORROWED rather than made: there is one of him, installed with the console
   * at the app's own start (audio/sarge.ts), and a battle only hands him a
   * moment to speak at.
   */
  const sarge: Sarge = theSarge()
  bus.on(handling({ sergeant: ({ section, line }) => sarge.play(section, line) }))

  /**
   * THE TOP OF A TURN, which is one moment with two halves and a fork between
   * them — the exe's `Pig::React(7)` (0x472320, case 7) splitting on whose
   * controller the acting pig has:
   *
   * - **anybody else's pig SPEAKS**, a line its own health picks out of
   *   category 01 (audio/pigVoice.ts);
   * - **your own pig only GRUNTS** — P_HMMM, no words — and the side's MUSIC
   *   steps instead, which is the one place a level's track is asked for
   *   (0x491240, audio/music.ts).
   *
   * So the thing you hear on your own turn is the music, and the thing you
   * hear on theirs is a pig. Play expected the other way round ("only the
   * player's own side says one") and the arm is not ambiguous, so this follows
   * the arm — the report to play says which.
   */
  bus.on(
    handling({
      turnBegan: ({ player, computer, health, voice: who }) => {
        if (computer) {
          voice.turn(who, health, tongue(player))
          return
        }
        cue(BATTLE_SOUNDS.ready)
        // The side's set is its nation's SKIN — read 2026-08-24
        // (audio/music.ts, `setFor`): the theme YOUR turn opens on is your
        // own nation's.
        music.turn(player, skinOf(nations[player] ?? player))
      }
    })
  )
  // …and the console drives it, because WHICH set of four a side owns is the
  // one thing about the music that has not been read (audio/music.ts) and only
  // an ear can settle it: `pow.music.play(7)` to hear any of the thirty.
  if (window.pow) {
    window.pow.music = {
      play: (clip) => (music.play(clip), clip),
      turn: (side) => (music.turn(side), side),
      stop: () => music.stop(),
      now: () => {
        const clip = music.playing()
        return { clip, track: clip === null ? null : trackFor(clip), played: music.played() }
      }
    }
  }

  return {
    music: () => music.played(),
    follow: (loco, inWater) => sounds.follow(loco, inWater),
    reset: () => sounds.reset(),
    chuteOverhead: audio.chuteOverhead,
    fuseBurning: audio.fuseBurning,
    played: () => bank.played(),
    spoken: () => voice.spoken(),
    sargeSaying: () => sarge.saying(),
    /** Every line of his played, in order — a spec's only ear on him. */
    sargeSpoken: () => sarge.spoken(),
    saying: () => voice.saying(),
    dispose() {
      // STOPPED, not disposed: he outlives the battle, and the console keeps
      // him between missions.
      sarge.stop()
      music.dispose()
      voice.dispose()
      // The BANK is borrowed the same way the sergeant is — `sharedBank` is
      // one promise for the whole app, and disposing it here is what play
      // heard as "перезапуск миссии ломает звуки": the second battle got the
      // same Bank object back with its `disposed` flag already up, and every
      // `play()` returned early for ever. Its buffers are a cache, not a
      // battle's property; nothing of it needs putting away.
    }
  }
}
