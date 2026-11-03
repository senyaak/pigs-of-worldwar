// THE PAUSE: whether the battle is the view and running, the menu opened and
// shut, and one key press against it (lib/game/pauseMenu.ts).

import { PAUSE_PITCH, clickLevel, newPause, pausePress } from '../../../../lib/game/pauseMenu'
import type { PauseVerb } from '../../../../lib/game/pauseMenu'
import {
  resumeAudio,
  setMasterVolume,
  setSfxVolume,
  setSpeechOn,
  suspendAudio
} from '../../audio/bank'
import { playMenuClick } from '../../audio/menuClick'
import { controller } from '../../input/controller'
import type { UiCore } from './core'
import { leave } from './open'

export const isBattleUp = ({ battleEl }: UiCore): boolean => !battleEl.classList.contains('hidden')

export const isRunning = (core: UiCore): boolean => {
  const { state } = core
  return isBattleUp(core) && !state.paused
}

export const setPaused = (core: UiCore, wanted: boolean): void => {
  const { state } = core
  if (state.paused === wanted || !isBattleUp(core)) return
  state.paused = wanted
  // Opening and closing make the same noise the cursor does — the exe plays
  // its one sample at 0x64 on both (0x491F84, 0x491FC7) — at the mix's own
  // level, because the click's player sits outside the suspended mixer
  // (audio/menuClick.ts).
  playMenuClick(PAUSE_PITCH.plain, clickLevel(state.mix.master, state.mix.sfx))
  if (state.paused) {
    state.pause = newPause(state.mix)
    suspendAudio()
    // Nothing stays HELD across a pause. The controller does the same on
    // blur, and for the same reason: a key that went down before the freeze
    // would drive the pig the moment it lifts.
    controller.releaseAll()
  } else {
    state.pause = null
    resumeAudio()
  }
}

/**
 * One key press against the pause menu: the rules say what it means and
 * what noise it makes (lib/game/pauseMenu.ts), and this is where the four
 * things it can ask for actually happen.
 */
export const pauseVerb = (core: UiCore, verb: PauseVerb): void => {
  const { speech, state } = core
  if (!state.pause) return
  const outcome = pausePress(state.pause, verb)
  // The settings live past the menu, so they are copied back out of it —
  // BEFORE the click, so a volume step's noise previews the NEW level,
  // which is the whole point of the exe's volume-step pitch
  // (lib/game/pauseMenu.ts, `clickLevel`).
  state.mix.master = state.pause.master
  state.mix.sfx = state.pause.sfx
  state.mix.speech = state.pause.speech
  setMasterVolume(state.mix.master)
  setSfxVolume(state.mix.sfx)
  setSpeechOn(state.mix.speech)
  if (outcome.sound) playMenuClick(PAUSE_PITCH[outcome.sound], clickLevel(state.mix.master, state.mix.sfx))
  // Turning SPEECH off cuts the line in the air, rather than waiting for it
  // to finish quietly (0x4923EB).
  if (outcome.cutSpeech) speech.stop()
  if (outcome.resume) setPaused(core, false)
  if (outcome.abort) {
    // **AN ABORT IS A LOSS**, and that is not an interpretation: the exe
    // writes −2 into the outcome word and falls straight through into the
    // same debrief call the ordinary end takes (0x47E643 into 0x47E652),
    // and the page asks only `outcome == 0` (0x482B5E) — so −2 and the
    // ordinary −1 are one page with one pair of keys. There is no MISSION
    // ABORTED screen; gtext 189 carries those words and has no reader
    // anywhere in the executable.
    //
    // So it leaves with a VERDICT rather than as `aborted`, which stays
    // what it always meant here: the toolbar's walk-out, a remake
    // convenience the original has no button for.
    state.verdict = 'lost'
    setPaused(core, false)
    leave(core)
  }
}
