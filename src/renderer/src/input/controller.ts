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

export interface DebugHooks {
  currentPig(): { x: number; z: number }
  currentHeading(): number
  currentNodeY(): number
  /** The terrain TYPE the acting pig is standing on — the tile byte's low five
   * bits (lib/game/terrain.ts). What its footsteps are picked by, and the only
   * way a spec can tell a stone one from a grass one (audio/battle.ts). */
  surface(): number
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
  /** How many planted charges have a spark alight on the fuse (three/fuse.ts). */
  burning(): number
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
  /** The MISSION being over — the exe's mode 2, END OF GAME: whether it was won,
   * which pig the camera's tour is on and how long the beat has run. Null while
   * there is a game to play (lib/game/endOfGame.ts). */
  ending(): { won: boolean; watching: number; elapsed: number } | null
  /** How many of the map's mission targets are still standing: every dummy the
   * map carries, whether its script has placed it yet or not. */
  targetsLeft(): number
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
  /**
   * The dashboard's map, from the side it is drawn for: where it is centred
   * and turned, and one entry per marker on it.
   *
   * `blips` is already filtered by whose turn it is, so an espionage pig
   * missing from this list is the rule working (lib/game/scanner.ts).
   */
  map(): {
    eye: { x: number; z: number; heading: number }
    blips: { x: number; z: number; icon: string; colour: [number, number, number] }[]
  }
  /** Where it is LOOKING, as a unit vector — the rig eases its position and
   * not its aim, so a shake in the view lives here (three/debug.ts). */
  facing(): { x: number; y: number; z: number }
  /** WHICH of the rig's views put it there: `chase`, `face`, `melee`, `scope`,
   * the two a thrown weapon gets — `lob` and `throw` — or `ride`, which is the
   * camera off the pig altogether (three/chase.ts). */
  view(): string
  /** Which building the acting pig is in and which it could jump into, by record
   * id, plus whether its model is drawn (three/battle.ts). */
  shelter(): { inside: number | null; doorway: number | null; drawn: boolean }
  /** The sky dome: which mood loaded, how big it is, and how far its centre
   * has drifted off the camera — which is meant to be nothing (three/sky.ts).
   * Null on a map whose dome would not load. */
  sky(): { mood: string; triangles: number; skins: number; offEye: number; radius: number } | null
  /** Snow or rain and how much of it, or null on a map whose mood draws
   * neither (three/weather.ts). */
  weather(): { kind: string; flakes: number; layers: number; onScreen: number; fallen: number } | null
  /** How many mines are drawn, and how many of those are TRODDEN ones wearing
   * the engine's own `WE_APMIN` out of the map's archive (three/mineArt.ts). */
  minesTripped(): number
  /** How long the last drawn frame took, seconds. Pairs with `facing()` to turn
   * a step into a RATE, which is the only way to measure judder on a machine
   * whose frame interval is itself uneven (three/debug.ts). */
  frame(): number
  /** Every sound the battle has played, in order. */
  sounds(): string[]
  /** The squads as fielded: where each pig started, the class the map gave
   * it, and the art it wears. */
  squads(): {
    name: string
    /** Which nation this side wears, and the SKIN that picks its art — a
     * side's slot on the map says neither (lib/game/nations.ts). */
    nation: number
    skin: number
    pigs: { name: string; pigClass: number; art: string; hat: boolean; x: number; z: number; heading: number }[]
  }[]
  /** What the map's .POG put on the ground: how many records were drawn out
   * of how many, and where each one landed (game space, Y-down). */
  props(): {
    placed: number
    objects: number
    /** How many props are faded because they stand between the camera and the
     * pig (three/props.ts). */
    faded: number
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
      /** ONE PLAYER — NEW GAME over LOAD GAME (ui/onePlayer.ts). */
      onePlayer?: BarScreenView
      /** LOAD GAME — the eight slots (ui/loadScreen.ts). */
      loadScreen?: BarScreenView
      /** PLAY TRAINING MISSION? — YES over NO (ui/askTraining.ts). */
      askTraining?: BarScreenView
      /** The PIG MAP — which of the chain's phases is up (ui/pigMap.ts):
       * 'off', 'world', 'zoom' or 'region'. */
      pigMap?: { phase(): string; patches(): number; flags(): number }
      /** THE BATTLE itself: whether it is frozen, and a way to freeze it
       * without the keyboard (ui/battle.ts). */
      battle?: {
        paused(): boolean
        menu(): {
          row: number
          confirming: boolean
          yes: boolean
          master: number
          sfx: number
          speech: boolean
        } | null
        pause(wanted?: boolean): boolean
      }
      /** The BRIEFING — whether the load is in and a key would start the
       * mission (ui/briefing.ts). */
      briefing?: { ready(): boolean }
      /** SELECT TEAM — the six armies (ui/teamScreen.ts). */
      teamScreen?: BarScreenView
      /** PLEASE NAME YOUR TEAM (ui/nameScreen.ts). `selected` is the exe's own
       * cursor — an index into the alphabet, or one of the three keys past its
       * end — and `type` is the remake's keyboard, which the original has no
       * way to offer. */
      nameScreen?: BarScreenView & { typed(): string; type(character: string): void }
      /** The PLAYER screen — the eight pigs and START MISSION
       * (ui/playerScreen.ts). `selected` is 0..7 a pig, then START. */
      /** The SQUAD screen, plus what its `pigpro` board is saying: the
       * team's tokens, then either the lit pig's lines or — while START
       * MISSION is lit — the next mission's name and number. */
      playerScreen?: BarScreenView & { board(): string[] }
      /** The PIG MENU over the squad — PROMOTE / SWAP POSITION / RENAME
       * (ui/pigMenu.ts); `open` says whether it is up at all. */
      pigMenu?: BarScreenView & { open(): boolean }
      /** CAREER PATH, a GRUNT's four ways out (ui/careerPath.ts). */
      careerPath?: BarScreenView & { open(): boolean }
      /** The MULTI-PLAYER screen, read the same way (ui/multiPlayer.ts). */
      multiPlayer?: BarScreenView
      /** Where the frontend's furniture sits, live: nudge a piece in the
       * console and `print()` it back out to paste into ui/barScreen.ts.
       * Placing this art is eyework, the same as `pow.hud`. */
      screen?: { layout: unknown; print(): unknown; reset(): void }
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
      /** The level's MUSIC, live — which of the thirty clips is sounding, and
       * a way to hear any of them: `pow.music.play(7)`, `pow.music.turn(0)`,
       * `pow.music.stop()` (audio/music.ts). Which SET of four a side owns is
       * the one thing about it that has not been read, so this is how it gets
       * settled by ear. */
      music?: {
        play(clip: number): number
        turn(side: number): number
        stop(): void
        now(): { clip: number | null; track: string | null; played: number[] }
      }
      /** Console command: restart the battle on another map —
       * `pow.swapMap('ARTGUN')`. No argument lists what ships. */
      swapMap?(name?: string): Promise<boolean>
      /** Console command: hand the machine's sides to the keyboard for THIS
       * battle — `pow.hotseat()` toggles, a boolean sets, and it lands on the
       * NEXT turn (the seat is decided at each handover). The next battle is
       * machine-on again (three/battle.ts). For testing weapons from both
       * ends; the original has no such thing. */
      hotseat?(on?: boolean): boolean
      /** Console command: put a line through the briefing bar —
       * `pow.say('USE SHIFT BUTTON TO JUMP THE GAP.')`. With no argument it
       * sends the tutorial's own line 227. The tutorial script drives the
       * same bar. */
      say?(text?: string): void
      /** Every training clip spoken this battle, in order — the tutorial
       * script runs on speech, so this is how it is watched (ui/battle.ts). */
      spoken?(): number[]
      /** Console command: put a skill in the acting pig's hands —
       * `pow.give(19)` for a grenade. The remake's own: no crate on the
       * training ground carries one, so nothing else can reach it. */
      give?(skill?: number, amount?: number): boolean
      /** Console command: go to one of the training ground's steps —
       * `pow.step(9)` for the bazooka, no argument to list them and say where
       * the battle stands. The same jump F11 and F12 make
       * (lib/game/training.ts). */
      step?(want?: number): Promise<number>
      /** Which map the battle is on. */
      map?(): string
    }
  }
}
window.pow = { controller }
