// What a player can DO, named once. Everything downstream — the battle
// scene, the menu, the e2e suite — speaks in these, never in key codes.

export const ACTIONS = [
  'walkForward',
  'walkBack',
  'turnLeft',
  'turnRight',
  'jump',
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
  'assets'
] as const

export type Action = (typeof ACTIONS)[number]

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
  // camera mode comes back (`../../../../pigs-disasm/weapons/fire.md`).
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
  KeyG: 'aimMode'
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
  // Left and right CHANGE a setting where a bar carries one, which is the
  // original's own instruction: "TO CHANGE THE RANK OF A PIG, POSITION CURSOR
  // OVER IT AND INDICATE LEFT OR RIGHT" (fetext 780).
  KeyA: 'menuLeft',
  ArrowLeft: 'menuLeft',
  KeyD: 'menuRight',
  ArrowRight: 'menuRight',
  Enter: 'menuSelect',
  Space: 'menuSelect',
  Escape: 'menuBack',
  F1: 'assets'
}
