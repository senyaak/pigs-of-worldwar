// The battle view (phase 002): New Game lands here, on the map's OWN
// squads — a turn HUD and an End Turn button over them. Assets come through
// the same IPCs the debug viewers use; the rules live in lib/game.
//
// Its parts live in `battle/`, sharing one core (`battle/core.ts`).

import type { OwnSquad } from '../../../lib/game/muster'
import { PAUSE_SOUND } from '../../../lib/game/pauseMenu'
import { GAME_SOUNDS } from '../audio/battleSound'
import { loadMenuClick } from '../audio/menuClick'
import { createSpeech } from '../audio/speech'
import { createBattleInput } from '../input/battleInput'
import { controller } from '../input/controller'
import { exposeConsole } from './battle/console'
import type { UiCore } from './battle/core'
import { DEFAULT_MAP, leave, start } from './battle/open'
import { isBattleUp, pauseVerb, setPaused } from './battle/pause'
import { createUiState } from './battle/state'
import { goToStep, standingStep } from './battle/steps'
import { byId } from './dom'
import { createHud } from './hud'

/** How a battle came to be over: the engine's verdict, or the LEAVE button
 * before it gave one — which is the player walking out on the mission. */
export type BattleExit = 'won' | 'lost' | 'aborted'

export interface BattleView {
  /**
   * Open a battle. With no name it reopens whatever map the view is on,
   * which is the training ground until something asks for another — the
   * MULTI-PLAYER screen asks for a two-sided one (ui/multiPlayer.ts).
   *
   * `wearing` is which NATION each side fields, campaign side first: the
   * player's own choice and then whoever the save says this mission is against
   * (lib/game/nations.ts). Left out, each side wears its slot — which is what a
   * battle opened from the console gets, and what every spec that does not care
   * about uniforms sees.
   *
   * `own` is the campaign's squad off the SAVE — the team's name and the pigs
   * that take the field, each under its own name and rank-class
   * (lib/game/muster.ts). Left out, side 0 is dressed from `fetext` like
   * everybody else.
   */
  open(name?: string, wearing?: readonly number[], own?: OwnSquad): Promise<boolean>
  close(): void
}

/**
 * `fallen` on the way out is the roster SLOTS of side 0's dead, in the order
 * they went down — what `fall` marks the save's squad with (lib/game/roster.ts).
 * Empty on an abort, on a skirmish, and on a mission nobody died in.
 * `kills` is side 0's kill tally by roster slot — what `credit` adds to the
 * lifetime scores when a win is taken.
 */
export function initBattle(
  onLeave: (exit: BattleExit, fallen: number[], kills: number[], points: number[]) => void
): BattleView {
  const canvasHost = byId<HTMLDivElement>('battle-canvas')
  const hudCanvas = byId<HTMLCanvasElement>('battle-hud')
  const hud = createHud(hudCanvas)
  // Nothing to do with the dashboard: this is the debug readout for
  // reporting a tile that looks wrong in play.
  const tileEl = byId<HTMLSpanElement>('battle-tile')
  // The instructor. One voice for the whole app: a battle restarting on
  // another map does not want a second sergeant talking over the first.
  const speech = createSpeech()
  const state = createUiState()

  // Tank controls, original style — but the battle view never touches keys:
  // it listens to the controller, which the keyboard AND the e2e suite drive
  // through the same three methods (input/controller.ts).
  const battleEl = byId<HTMLDivElement>('battle')

  /**
   * The controls, read once a frame in the SCENE's own loop
   * (`input/battleInput.ts`). This file used to interpret them itself, on a
   * change notification, and both halves of that were wrong: a control set can
   * change while nothing on the keyboard moves, and the dashboard's loop is not
   * the one the game steps in.
   */
  const input = createBattleInput({
    // The ENGINE, not the scene: input drives the game and knows nothing about
    // what is drawing it (lib/game/battle.ts).
    battle: () => state.scene?.battle ?? null,
    game: () => state.game,
    // …and what a control ANNOUNCES goes on the battle's own bus, so the noise
    // of the inventory opening belongs to the audio bank like every other
    // (lib/game/events.ts).
    emit: (event) => state.scene?.battle.announce(event),
    skills: hud.skills,
    up: () => isBattleUp(core),
    paused: () => state.paused,
    pauseVerb: (verb) => pauseVerb(core, verb),
    // ESCAPE, read in the battle's own poll like every other verb — and the
    // poll rides the scene's INPUT pass, which is ahead of the frame the
    // pause freezes, so the key that starts a pause is also the key that can
    // end one (three/scene.ts).
    togglePause: () => setPaused(core, !state.paused)
  })
  controller.bindKeyboard(() => isBattleUp(core))

  const core: UiCore = {
    canvasHost,
    hudCanvas,
    hud,
    tileEl,
    speech,
    battleEl,
    input,
    onLeave,
    state
  }

  // The button is just another way to fire the action.
  byId<HTMLButtonElement>('battle-end-turn').addEventListener('click', () => {
    // The whole gesture in one click, because that is what a button labelled END
    // TURN means: take SKIP TURN in hand, then use it. It is not the menu applying
    // a skill on being chosen — the menu still only hands it over — it is the
    // remake's own shortcut for both halves (lib/game/controls.ts).
    controller.press('endTurn')
    controller.tap('fire')
  })

  // The one sample the menu makes every one of its noises with, on a context
  // of its own because the pause suspends the game's (audio/menuClick.ts).
  void loadMenuClick(GAME_SOUNDS, PAUSE_SOUND)

  // F11 and F12: back a training step and on one. They come through the
  // controller like every other key and stop HERE — the battle's own poll drops
  // them (input/actions.ts, `DEBUG_ACTIONS`), because this is not something a
  // pig does. Restarting the level is what a step back is, and only this file
  // can do that.
  controller.onAction((action) => {
    if (!isBattleUp(core)) return
    if (action === 'trainingBack') void goToStep(core, standingStep(core) - 1)
    if (action === 'trainingNext') void goToStep(core, standingStep(core) + 1)
  })

  byId<HTMLButtonElement>('battle-leave').addEventListener('click', () => leave(core))

  // The console IS the map selector — no UI for it, by request. `pow.swapMap()`
  // with no argument lists what ships; with a name it restarts the battle
  // there. The scene rebuild re-merges `pow.debug`, so the spread keeps this.
  exposeConsole(core)

  return {
    // No name means ONE PLAYER, and ONE PLAYER is the training ground — not
    // "wherever the battle was last". It used to fall back to the current map,
    // which was harmless while only `pow.swapMap` could change it; the
    // MULTI-PLAYER screen made a MENU action change it, and then ONE PLAYER
    // opened CAMP's squad on LIBERATE's terrain. It cost a spec three phases
    // away — the pig walked into water it should never have been near.
    open: (name, wearing, own) => start(core, name ?? DEFAULT_MAP, wearing, own),
    close() {
      state.scene?.dispose()
      state.scene = null
      state.game = null
      if (state.frame !== 0) cancelAnimationFrame(state.frame)
      state.frame = 0
      state.painted = 0
      speech.stop()
      hud.clear()
    }
  }
}
