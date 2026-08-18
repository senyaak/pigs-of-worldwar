// What a player can DO, named once. Everything downstream — the battle
// scene, the menu, the e2e suite — speaks in these, never in key codes.

export const ACTIONS = [
  'walkForward',
  'walkBack',
  'turnLeft',
  'turnRight',
  'jump',
  'enter',
  'fire',
  'aimUp',
  'aimDown',
  'aimMode',
  'endTurn',
  'menuUp',
  'menuDown',
  'menuLeft',
  'menuRight',
  'menuSelect',
  'menuBack',
  'skills',
  'assets',
  'trainingBack',
  'trainingNext'
] as const

export type Action = (typeof ACTIONS)[number]

/**
 * Actions the RULES never see — the remake's own conveniences, which go through
 * the controller so that the e2e suite drives them the way a player does
 * (docs/testing.md) and stop there.
 *
 * They are filtered out of the battle's own poll (`input/battleInput.ts`), and
 * that is not tidiness: a queued verb is what ends the beat at the top of a turn
 * ("press any key"), so jumping the tutorial a step would also have started the
 * turn it landed in.
 */
export const DEBUG_ACTIONS: readonly Action[] = ['assets', 'trainingBack', 'trainingNext']

/**
 * The FRONTEND's own verbs, which the battle must never queue.
 *
 * No key in `DEFAULT_BINDINGS` produces one, so the only way a battle hears
 * these is a screen handing over SYNCHRONOUSLY inside a single dispatch: the
 * briefing's `menuSelect` shows the battle, and the listeners after it in the
 * same `fired()` pass then see a battle that is up and queue the very key
 * that left the screen before. The keyboard half of that is stopped at the
 * event (`input/controller.ts`); this is the half that never touched an
 * event at all.
 */
export const MENU_ACTIONS: readonly Action[] = [
  'menuUp',
  'menuDown',
  'menuLeft',
  'menuRight',
  'menuSelect',
  'menuBack'
]

/**
 * The keys that DRIVE — the axes, as opposed to the verbs.
 *
 * They are dropped whenever the control set changes, so a new set always starts
 * from nothing held. Play asked for it and gave both halves of the reason: the
 * sights already stopped the pig and wanted W pressed again, while opening the
 * inventory left it walking. One rule instead of two behaviours.
 */
export const DRIVING_ACTIONS: readonly Action[] = [
  'walkForward',
  'walkBack',
  'turnLeft',
  'turnRight',
  'aimUp',
  'aimDown'
]

/** Actions that do something while HELD, as opposed to on each press. */
export const HELD_ACTIONS: readonly Action[] = [
  'walkForward',
  'walkBack',
  'turnLeft',
  'turnRight',
  'aimUp',
  'aimDown',
  // The aim view is HELD in the original — 0x4928dc tests two button bits of
  // this frame's mask every frame and the frame either goes up, the remembered
  // camera mode comes back (`weapons/fire.md`).
  'aimMode',
  // …and so is FIRE, because that is what the power gauge is: a weapon with
  // one charges while the button is down and throws when it comes up
  // (0x493796, `lib/game/gauge.ts`). A weapon without one still goes off on
  // the press, so the scene reads the EDGE for those — held here means the
  // scene is told both edges rather than only the first.
  'fire'
]

/** Physical keys → actions, in the battle. Several keys may share one. */
export const DEFAULT_BINDINGS: Record<string, Action> = {
  KeyW: 'walkForward',
  ArrowUp: 'walkForward',
  KeyS: 'walkBack',
  ArrowDown: 'walkBack',
  KeyA: 'turnLeft',
  ArrowLeft: 'turnLeft',
  KeyD: 'turnRight',
  ArrowRight: 'turnRight',
  Space: 'jump',
  // The original opens the skill menu with RETURN, and every tutorial line
  // about it says so — but RETURN ends the turn here, so the menu is on R
  // and the tutorial's wording is the one thing that disagrees.
  KeyR: 'skills',
  // The original aims with PAGE UP and PAGE DOWN — a pair of keys nowhere
  // near the walking hand. Q and E sit beside W and are held the same way
  // the exe holds its own: they ramp (lib/game/aim.ts). Which way round is
  // play's call and they swapped them on sight.
  KeyQ: 'aimDown',
  KeyE: 'aimUp',
  // The original fires with the SELECT button, bit 0x20 of its mask — the
  // very same button that takes a skill out of the menu (exe 0x493796). That
  // bit is SPACE here, and space already jumps, so firing gets a key of its
  // own rather than a pig that cannot hop while it is armed.
  KeyF: 'fire',
  // The aim view. The original holds it on a pad bit (0x100 or 0x1000) and
  // steers with the ordinary controls underneath; G is the remake's key for
  // it, and while it is down W and S drive the ANGLE instead of walking.
  KeyG: 'aimMode',
  // **Getting into a building has a key of its own, and SPACE is not it.**
  // Play: "я не говорил по пробелу — там просто анимация входа, запрыгивание;
  // сделай отдельную кнопку, пробел уже прыжок." Right — a door on the jump key
  // is one thing wearing two meanings, and the pig would stop being able to hop
  // anywhere near a shelter. C is beside the walking hand and unbound.
  //
  // The ORIGINAL puts it in the menu instead — skill 61 BUILDING INOUT — which is
  // still where it belongs the day the other five buildings are worth entering
  // (lib/game/buildings.ts). A key is the remake's, and this is where it says so.
  KeyC: 'enter',
  // **The training ground's own steps, back and forward.** The remake's, like
  // F1 and `pow.swapMap`: the tutorial is a chain nine dummies long and the
  // thing being fixed is usually the last link of it (lib/game/training.ts).
  // Forward runs the script on; back is the level starting over and running to
  // the step behind, because a broken dummy does not stand up again.
  F11: 'trainingBack',
  F12: 'trainingNext'
  // …and there is no key for ENDING a turn. That is a SKILL — 65, SKIP TURN,
  // always in the menu whatever the pig carries — taken in hand from the menu
  // like a weapon and applied with FIRE (lib/game/controls.ts). Enter used to be
  // bound here and play asked for it gone.
}

/**
 * The same keys mean other things on a menu screen, so the frontend binds
 * its own map. `assets` is the remake's own: F1 opens the asset browsers,
 * which the original has no notion of.
 */
export const MENU_BINDINGS: Record<string, Action> = {
  KeyW: 'menuUp',
  ArrowUp: 'menuUp',
  KeyS: 'menuDown',
  ArrowDown: 'menuDown',
  KeyA: 'menuLeft',
  ArrowLeft: 'menuLeft',
  KeyD: 'menuRight',
  ArrowRight: 'menuRight',
  Enter: 'menuSelect',
  Space: 'menuSelect',
  Escape: 'menuBack',
  F1: 'assets'
}
