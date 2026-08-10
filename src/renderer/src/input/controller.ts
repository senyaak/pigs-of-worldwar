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

  const fired = (action: Action): void => {
    for (const listener of actionListeners) listener(action)
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
  /** …and how many sprites its fireball has (three/effects.ts). */
  fire(): number
  /** What the map script is still holding back, and what is in the air. */
  script(): { absent: number[]; falling: number }
  /** How many bullets are in flight (three/shots.ts). */
  shots(): number
  /** Where the weapon in hand points, in the game's own angle units, or null
   * when nothing that aims is out (lib/game/aim.ts). */
  aim(): number | null
  /** How many grenades are in the air or lying about (three/grenades.ts). */
  grenades(): { x: number; y: number; z: number; fuse: number }[]
  /** How each planted charge STANDS: its fuse's world direction — (0, −1, 0) is
   * straight up, game space being Y-down — and the y of its lowest corner. */
  charges(): { fuse: { x: number; y: number; z: number }; base: number }[]
  /** Mines that have been trodden on and are counting down (lib/game/mines.ts). */
  mines(): { x: number; y: number; z: number; fuse: number }[]
  /** How many buried mines are being DRAWN for the side whose turn it is — a
   * marker only a nearby pig of the right class gets (three/mineArt.ts). */
  mineMarkers(): number
  /** How full the power gauge is, 0..1, or null when nothing is charging
   * (lib/game/gauge.ts). */
  charging(): number | null
  /** Where the shot sequence has got to — 'fuse', 'flight', or null when the
   * pig is its own again (lib/game/shot.ts). */
  firing(): string | null
  /** Every voice line the pigs have said, in order (audio/pigVoice.ts). */
  barks(): string[]
  /** Whether the game is holding on what a blow left behind — the clock is
   * stopped and the camera is on the spot or on the crate coming down
   * (lib/game/aftermath.ts). */
  aftermath(): boolean
  /** The beat at the END of a turn — the exe's mode 13, WALK AWAY — and how
   * many pigs it is still waiting to see out of the water. Null while a turn is
   * being played (lib/game/walkAway.ts). */
  walkAway(): { swimming: number } | null
  /** The acting pig's pose from both ends of the chain — the engine's sampler
   * and the bone the mesh wears — for telling a frozen clip from a renderer that
   * is not applying one (three/battle.ts). */
  pose(): {
    clip: number | null
    elapsed: number
    /** What the keyframe head lifts the whole body by — the gait's BOB, which is
     * the only motion the rump has of its own (lib/game/clipPose.ts). */
    lift: number
    /** Every bone the MESH wears, HIR order: 0 the hip and the tail with it,
     * 1 the torso where the run cycle's swing lives, 9..14 the legs. */
    bones: [number, number, number, number][]
    foot: [number, number, number] | null
    drawn: [number, number, number, number] | null
  }
  /** Every pig's health, in turn order. Water takes FRACTIONS of a point
   * (lib/game/drowning.ts), so this is not always whole. */
  health(): { name: string; health: number }[]
  /** Where the chase camera actually is, world space. */
  camera(): { x: number; y: number; z: number }
  /** Where it is LOOKING, as a unit vector — the rig eases its position and
   * not its aim, so a shake in the view lives here (three/debug.ts). */
  facing(): { x: number; y: number; z: number }
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
    at: { name: string; x: number; y: number; z: number; order: number }[]
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
  /** …and the beat at the END of one, cut short the same way and for the same
   * reason: there is no player input for it at all, and a spec that is not about
   * the beat should not spend a second a turn on it (lib/game/walkAway.ts). */
  cutTurnBeat(): void
}

/** How a spec reads a frontend screen: the frontend draws on a canvas, so
 * there is no markup to assert on (ui/barScreen.ts). */
export interface BarScreenView {
  selected(): number
  labels(): string[]
  /** What each bar says on the RIGHT — null where it carries no setting. */
  values(): (string | null)[]
  /** Whether a bar is still turning over. A spec that presses during a flip
   * is pressing into a refusal, which is the machine working as designed. */
  flipping(): boolean
}

declare global {
  interface Window {
    pow?: {
      controller: Controller
      debug?: DebugHooks
      /** The main menu, while it is the view: which bar is lit, what the bars
       * say, and what each says on the right where it carries a setting. The
       * frontend draws on a canvas, so this is how a spec reads it
       * (docs/testing.md). */
      menu?: BarScreenView
      /** The MULTI-PLAYER screen, read the same way (ui/multiPlayer.ts). */
      multiPlayer?: BarScreenView
      /** Where the frontend's furniture sits, live: nudge a piece in the
       * console and `print()` it back out to paste into ui/barScreen.ts.
       * Placing this art is eyework, the same as `pow.hud`. */
      screen?: { layout: unknown; print(): unknown }
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
      /** Console command: put a skill in the acting pig's hands —
       * `pow.give(19)` for a grenade. The remake's own: no crate on the
       * training ground carries one, so nothing else can reach it. */
      give?(skill?: number, amount?: number): boolean
      /** Which map the battle is on. */
      map?(): string
    }
  }
}
window.pow = { controller }
