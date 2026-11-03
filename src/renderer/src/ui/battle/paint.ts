// WHAT THE DASHBOARD DRAWS, once a frame of its own, and the two readouts the
// game's changes refresh.

import { SKILL } from '../../../../lib/game/skills'
import { LAYOUT } from '../hud/layout'
import type { UiCore } from './core'
import { GET_READY, MISSION_ACCOMPLISHED, MISSION_FAILED, lensFor } from './lines'
import { applyStep } from './steps'
import { cue } from './tutorial'

export const updateTileText = (core: UiCore): void => {
  const { tileEl, state } = core
  if (!state.game) return
  const { x, z } = state.game.currentPig.position
  const tile = state.query?.tileAddress(x, z)
  tileEl.textContent = tile
    ? `tile ${tile.col},${tile.row}  tex ${tile.texture}  byte ${tile.rotateFlip}  type 0x${tile.type.toString(16)}`
    : ''
}

export const updateHud = (core: UiCore): void => {
  const { state } = core
  if (!state.game) return
  updateTileText(core)
  state.scene?.focus(state.game.currentPig)
}

// The dashboard is drawn over the 3D view, on its own canvas, for as long
// as the battle is the view. It keeps its own clock: the scene's frame loop
// is three's, and the bar's slide belongs to the dashboard. It DRAWS and
// nothing else — the controls are read in the scene's frame, which is the
// one the game steps in (input/battleInput.ts).
export const paint = (core: UiCore, now: number): void => {
  const { hudCanvas, hud, state } = core
  state.frame = requestAnimationFrame((now) => paint(core, now))
  const delta = state.painted === 0 ? 0 : Math.min(0.1, (now - state.painted) / 1000)
  state.painted = now
  if (!state.game || !state.scene) return
  // The script's first two beats: the sergeant starts talking over the
  // drop, and picks up again the moment the round is under way.
  cue(core, state.scene.dropping() ? 'drop' : 'round')
  // …and a step jumped BACK to is paid as soon as the squad is on the ground:
  // a pig still on its canopy has nowhere to be stood.
  if (state.stepWanted !== null && !state.reloading && !state.scene.dropping()) {
    const step = state.stepWanted
    // Cleared whether the scene takes it or not — a want left standing on a map
    // that has no such script would block every jump after it.
    state.stepWanted = null
    applyStep(core, step)
  }
  /** The mission being over, which is a card of its own (lib/game/endOfGame.ts). */
  const ended = state.scene.battle.view().ending
  hud.draw({
    delta,
    paused: state.paused,
    pause: state.pause,
    seconds: state.game.timeLeft,
    pigs: state.scene.plates(hudCanvas.clientWidth, hudCanvas.clientHeight, LAYOUT.plate.lift),
    numbers: state.scene.numbers(hudCanvas.clientWidth, hudCanvas.clientHeight),
    still: state.scene.still(),
    strings: state.battleText,
    aim: state.scene.aim(),
    charge: state.scene.charging(),
    // **A PIG INSIDE HOLDS THE DOOR.** Play: "когда прыгаю в здание — в оружии
    // должна быть иконка запрыгивания во что-то (есть в игре)." Skill 61 is
    // BUILDING INOUT and it has an icon of its own like every other
    // (lib/game/skills.ts), so the slot beside the dial carries it for as long
    // as the pig is in there — which is also the only thing it can do from in
    // there besides skipping the turn.
    //
    // A DRAWING decision and not a rule: `pig.holding` is what the fire key
    // acts on, and the remake's door is a key of its own (play asked for that),
    // so putting 61 in the pig's hands would arm a weapon nobody chose.
    holding: state.scene.battle.view().inside ? SKILL.BUILDING_INOUT : state.game.currentPig.holding,
    // …and how full the port's red lens is, which says what the thing in hand
    // DOES rather than how charged it is (ui/hud.ts, `DIAL.slot.lens`).
    lens: lensFor(state.game.currentPig.holding),
    scope: state.scene.scoped(),
    // The map is centred on the camera and turned by it, and it shows what
    // the side whose turn it is can see (lib/game/scanner.ts).
    eye: state.scene.eye(),
    blips: state.scene.blips(),
    // The card carries the mission's name for as long as anyone is still in the
    // air, "MISSION ACCOMPLISHED!" once it is over, and "GET READY >S..." for
    // the beat at the top of every turn — all three the same centred card the
    // exe draws off its own mode (0x45B94B).
    title: state.scene.dropping()
      ? state.title
      : ended
        ? (state.battleText[ended.won ? MISSION_ACCOMPLISHED : MISSION_FAILED] ?? '')
        : state.game.starting
          ? (state.battleText[GET_READY] ?? '').replace('>S', state.game.currentPlayer.name)
          : null
  })
}
