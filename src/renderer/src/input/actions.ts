// What a player can DO, named once. Everything downstream — the battle
// scene, the HUD, the e2e suite — speaks in these, never in key codes.

export const ACTIONS = [
  'walkForward',
  'walkBack',
  'turnLeft',
  'turnRight',
  'jump',
  'endTurn'
] as const

export type Action = (typeof ACTIONS)[number]

/** Actions that do something while HELD, as opposed to on each press. */
export const HELD_ACTIONS: readonly Action[] = ['walkForward', 'walkBack', 'turnLeft', 'turnRight']

/** Physical keys → actions. Several keys may share one action. */
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
