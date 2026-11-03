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
  /**
   * Did this HELD action go DOWN since the last time anyone asked? Asking
   * consumes it.
   *
   * The battle polls its controls once a frame (`input/battleInput.ts`), and a
   * press with its release can both land between two frames — `isDown` is false
   * at either end, so without a latch every quick tap is lost: a player's snap
   * shot and a spec's `tap('fire')` alike. Two taps inside one frame do collapse
   * into one.
   */
  tookPress(action: Action): boolean
  /** Release everything — used when a view closes or a turn is handed over. */
  releaseAll(): void
  /** Called for one-shot actions (jump, endTurn). */
  onAction(listener: (action: Action) => void): () => void
  /**
   * THE ACTION IS SPENT: stop delivering it to anyone else.
   *
   * A listener that changes the VIEW calls this, and `show()` in the renderer
   * is the one place that happens. Without it an action outlives the screen
   * that answered it: every view listens through the same controller gated on
   * being the view that is up, and a handover is synchronous, so the screen
   * arriving is already "up" while the same action is still being handed
   * down the list. Play met it twice — the briefing's key cutting the squad's
   * parachutes, and then the map's key skipping the briefing outright, which
   * is a loading screen and must be waited on.
   *
   * It is the software half of the exe's own rule: the pad is read once a
   * frame and a press has to be FRESH, so an action can never be spent twice.
   */
  stopDispatch(): void
  /** Route real keyboard events into the controller while `enabled()` is
   * true; returns an unbind function. Each view binds the map it reads by —
   * the same arrow keys walk a pig and move a menu bar. */
  bindKeyboard(enabled: () => boolean, bindings?: Record<string, Action>): () => void
}

export function createController(): Controller {
  const held = new Set<Action>()
  /** Held actions that have gone down since anyone last looked — see
   * `tookPress`. A one-shot action needs no latch: it is announced through
   * `onAction` the moment it happens, and the battle queues those in order. */
  const latched = new Set<Action>()
  const actionListeners = new Set<(action: Action) => void>()

  /**
   * Set by `stopDispatch` when a listener changes the view under an action:
   * the rest of that action's delivery is cancelled.
   */
  let handed = false

  const fired = (action: Action): void => {
    handed = false
    for (const listener of actionListeners) {
      if (handed) return
      listener(action)
    }
  }

  const controller: Controller = {
    press(action) {
      if (HELD_ACTIONS.includes(action)) {
        if (held.has(action)) return
        held.add(action)
        latched.add(action)
      } else {
        fired(action)
      }
    },
    release(action) {
      held.delete(action)
    },
    tap(action) {
      controller.press(action)
      controller.release(action)
    },
    isDown: (action) => held.has(action),
    tookPress: (action) => latched.delete(action),
    releaseAll() {
      held.clear()
      latched.clear()
    },
    onAction(listener) {
      actionListeners.add(listener)
      return () => actionListeners.delete(listener)
    },
    stopDispatch() {
      handed = true
    },
    bindKeyboard(enabled, bindings = DEFAULT_BINDINGS) {
      const down = (event: KeyboardEvent): void => {
        if (!enabled()) return
        const action = bindings[event.code]
        if (!action) return
        event.preventDefault()
        /**
         * ONE keydown is ONE action, and this is what says so.
         *
         * Every view binds its own map on the same `window`, gated on being
         * the view that is up — which holds right up to the moment a view
         * hands over SYNCHRONOUSLY. The briefing's `menuSelect` shows the
         * battle before the event has finished dispatching, so the listener
         * registered after it then read the same Space through the BATTLE's
         * map, where it is `jump` — and a jump during the drop-in cuts every
         * canopy. Play landed the whole squad without parachutes.
         *
         * The exe cannot have this bug: its own canopy cut (0x490c20) tests
         * the pad for a FRESH press — down this frame and not the last — so a
         * key carried in from the screen before reads as already held and
         * does nothing.
         */
        event.stopImmediatePropagation()
        // Auto-repeat must not re-fire one-shot actions.
        if (event.repeat && !HELD_ACTIONS.includes(action)) return
        controller.press(action)
      }
      const up = (event: KeyboardEvent): void => {
        const action = bindings[event.code]
        if (action) controller.release(action)
      }
      /**
       * A window that loses focus never sees the key come UP.
       *
       * Alt-tab out with G down and the sights are held for ever: the control set
       * stays on the aim view, and since W POINTS rather than walks down there,
       * the pig cannot be driven again until G is pressed and released. Play hit
       * exactly that — "нажал g, сделал альт-таб, вернулся, прицел не вышел… и
       * кстати поломалась ходьба от этого" — and it took a shot and a crate coming
       * down before it was obvious. Nothing downstream can recover from it,
       * because as far as the controller is concerned the key IS down.
       *
       * So the window losing focus drops everything, held keys and latches alike.
       * `visibilitychange` as well as `blur`: a minimised window gets one and not
       * always the other.
       */
      const drop = (): void => controller.releaseAll()
      window.addEventListener('keydown', down)
      window.addEventListener('keyup', up)
      window.addEventListener('blur', drop)
      document.addEventListener('visibilitychange', drop)
      return () => {
        window.removeEventListener('keydown', down)
        window.removeEventListener('keyup', up)
        window.removeEventListener('blur', drop)
        document.removeEventListener('visibilitychange', drop)
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

window.pow = { controller }
