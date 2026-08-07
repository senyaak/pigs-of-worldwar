// The controller: the ONE way anything drives a pig.
//
// A keyboard press and an e2e test call the same three methods, so a test
// exercises the real control path instead of a parallel one built for it.
// The controller knows nothing about three.js or the game rules — it holds
// which actions are down and tells whoever is listening.

import { DEFAULT_BINDINGS, HELD_ACTIONS } from './actions'
import type { Action } from './actions'

export interface Controller {
  /** Start holding an action (idempotent). */
  press(action: Action): void
  /** Stop holding an action (idempotent). */
  release(action: Action): void
  /** A single press-and-release, for one-shot actions like jump. */
  tap(action: Action): void
  /** Is this action currently held? */
  isDown(action: Action): boolean
  /** Release everything — used when a view closes or a turn is handed over. */
  releaseAll(): void
  /** Called whenever the held set changes; the scene reads intent here. */
  onChange(listener: () => void): () => void
  /** Called for one-shot actions (jump, endTurn). */
  onAction(listener: (action: Action) => void): () => void
  /** Route real keyboard events into the controller while `enabled()` is
   * true; returns an unbind function. Each view binds the map it reads by —
   * the same arrow keys walk a pig and move a menu bar. */
  bindKeyboard(enabled: () => boolean, bindings?: Record<string, Action>): () => void
}

export function createController(): Controller {
  const held = new Set<Action>()
  const changeListeners = new Set<() => void>()
  const actionListeners = new Set<(action: Action) => void>()

  const changed = (): void => {
    for (const listener of changeListeners) listener()
  }
  const fired = (action: Action): void => {
    for (const listener of actionListeners) listener(action)
  }

  const controller: Controller = {
    press(action) {
      if (HELD_ACTIONS.includes(action)) {
        if (held.has(action)) return
        held.add(action)
        changed()
      } else {
        fired(action)
      }
    },
    release(action) {
      if (!held.delete(action)) return
      changed()
    },
    tap(action) {
      controller.press(action)
      controller.release(action)
    },
    isDown: (action) => held.has(action),
    releaseAll() {
      if (held.size === 0) return
      held.clear()
      changed()
    },
    onChange(listener) {
      changeListeners.add(listener)
      return () => changeListeners.delete(listener)
    },
    onAction(listener) {
      actionListeners.add(listener)
      return () => actionListeners.delete(listener)
    },
    bindKeyboard(enabled, bindings = DEFAULT_BINDINGS) {
      const down = (event: KeyboardEvent): void => {
        if (!enabled()) return
        const action = bindings[event.code]
        if (!action) return
        event.preventDefault()
        // Auto-repeat must not re-fire one-shot actions.
        if (event.repeat && !HELD_ACTIONS.includes(action)) return
        controller.press(action)
      }
      const up = (event: KeyboardEvent): void => {
        const action = bindings[event.code]
        if (action) controller.release(action)
      }
      window.addEventListener('keydown', down)
      window.addEventListener('keyup', up)
      return () => {
        window.removeEventListener('keydown', down)
        window.removeEventListener('keyup', up)
      }
    }
  }
  return controller
}

/**
 * The controller the app runs on. Exposed on `window.pow` so the e2e suite
 * drives the real control path (docs/testing.md) rather than synthesising
 * key events that only look like input.
 */
export const controller = createController()

export interface DebugHooks {
  currentPig(): { x: number; z: number }
  currentHeading(): number
  currentNodeY(): number
  /** What the dashboard is saying: whose turn, which pig, how it stands. */
  hud(): {
    turn: number
    side: string
    pig: string
    health: number
    seconds: number
    swimming: boolean
    still: number
    /** Whether the turn has not begun yet — the beat before the clock
     * starts, which any input ends (lib/game/game.ts). */
    starting: boolean
  }
  /** What the acting pig is carrying, in pickup order — skill id, name and
   * amount, where −1 means unlimited (lib/game/inventory.ts). */
  carrying(): { skill: number; name: string; amount: number }[]
  /** The skill in hand, chosen out of the menu, or null. */
  holding(): number | null
  /** Whether the acting pig is mid-swing — the ten-frame wind-up and the
   * attack clip together (lib/game/melee.ts). */
  swinging(): boolean
  /** What the last hand-to-hand strike measured — the blade's three points
   * and how near every other pig came, per axis (three/swing.ts). */
  strike(): unknown
  /** How many effect rings a blow has in the air (three/effects.ts). */
  effects(): number
  /** How many puffs of smoke a breaking has in the air (three/effects.ts). */
  smoke(): number
  /** What the map script is still holding back, and what is in the air. */
  script(): { absent: number[]; falling: number }
  /** How many bullets are in flight (three/shots.ts). */
  shots(): number
  /** Where the shot sequence has got to — 'fuse', 'flight', or null when the
   * pig is its own again (lib/game/shot.ts). */
  firing(): string | null
  /** Every voice line the pigs have said, in order (audio/pigVoice.ts). */
  barks(): string[]
  /** Whether the game is holding on what a blow left behind — the clock is
   * stopped and the camera is on the spot or on the crate coming down
   * (lib/game/aftermath.ts). */
  aftermath(): boolean
  /** Every pig's health, in turn order. */
  health(): { name: string; health: number }[]
  /** Where the chase camera actually is, world space. */
  camera(): { x: number; y: number; z: number }
  /** Every sound the battle has played, in order. */
  sounds(): string[]
  /** The squads as fielded: where each pig started, the class the map gave
   * it, and the art it wears. */
  squads(): {
    name: string
    pigs: { name: string; pigClass: number; art: string; x: number; z: number; heading: number }[]
  }[]
  /** What the map's .POG put on the ground: how many records were drawn out
   * of how many, and where each one landed (game space, Y-down). */
  props(): {
    placed: number
    objects: number
    at: { name: string; x: number; y: number; z: number }[]
  }
  /** The level's opening drop: who is still coming down under a canopy, and
   * how far up. `running` false is what says the battle has begun — nothing
   * else moves until it has (lib/game/parachute.ts). */
  dropIn(): {
    running: boolean
    pigs: { name: string; y: number; landed: boolean; canopy: boolean }[]
  }
  /** Set the acting pig down somewhere, facing somewhere. Not a player move:
   * it exists so a spec can stage a situation it could not walk to. */
  warp(x: number, z: number, heading: number): void
  /** Start the turn now, skipping the beat at the top of it. A player does
   * this by pressing anything — but every key a player has also DRIVES the
   * pig, and a spec that wanted a running clock would have to move first and
   * measure after. This is that press without the pig moving. */
  beginTurn(): void
}

declare global {
  interface Window {
    pow?: {
      controller: Controller
      debug?: DebugHooks
      /** The main menu, while it is the view: which bar is lit and what the
       * bars say. The frontend draws on a canvas, so this is how a spec
       * reads it (docs/testing.md). */
      menu?: { selected(): number; labels(): string[] }
      /** The dashboard's layout, live: nudge a piece in the console and
       * `print()` it back out to paste into ui/hud.ts. */
      hud?: { layout: unknown; print(): unknown }
      /** The battle's sounds, live: list the bank, hear one, rebind a moment
       * to it and `print()` the table back out (audio/console.ts). Most of
       * that table is a name pick and only play can settle it. */
      sfx?: {
        list(filter?: string): { index: number; name: string }[]
        play(which: string | number): string | null
        now(): Record<string, unknown>
        set(
          moment: string,
          name: string | number,
          mix?: { volume?: number; pitch?: number; jitter?: number }
        ): string | null
        print(): Record<string, unknown>
      }
      /** Console command: restart the battle on another map —
       * `pow.swapMap('ARTGUN')`. No argument lists what ships. */
      swapMap?(name?: string): Promise<boolean>
      /** Console command: put a line through the briefing bar —
       * `pow.say('USE SHIFT BUTTON TO JUMP THE GAP.')`. With no argument it
       * sends the tutorial's own line 227. The tutorial script will drive
       * the same bar when it lands. */
      say?(text?: string): void
      /** Which map the battle is on. */
      map?(): string
    }
  }
}
window.pow = { controller }
