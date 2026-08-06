// What a player can DO, named once. Everything downstream — the battle
// scene, the menu, the e2e suite — speaks in these, never in key codes.

export const ACTIONS = [
  'walkForward',
  'walkBack',
  'turnLeft',
  'turnRight',
  'jump',
  'endTurn',
  'menuUp',
  'menuDown',
  'menuSelect',
  'menuBack',
  'assets'
] as const

export type Action = (typeof ACTIONS)[number]

/** Actions that do something while HELD, as opposed to on each press. */
export const HELD_ACTIONS: readonly Action[] = ['walkForward', 'walkBack', 'turnLeft', 'turnRight']

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
  Enter: 'endTurn'
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
  Enter: 'menuSelect',
  Space: 'menuSelect',
  Escape: 'menuBack',
  F1: 'assets'
}
