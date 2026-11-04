// THE CONSOLE'S SURFACE: the shape of `window.pow` — the controller, the
// battle's debug hooks, each frontend screen's reader and the console's own
// commands. The controller module puts it on the window (input/controller.ts);
// every view hangs its own part off it.

import type { ActionEnd } from '../actions/actions'
import type { Controller } from './controller'

export interface DebugHooks {
  currentPig(): { x: number; z: number }
  currentHeading(): number
  currentNodeY(): number
  /** Where a pig's MESH is drawn — the node, not the engine's body
   * (three/debug.ts). Null for a pig no soldier was built for. */
  nodeAt(id: number): { x: number; y: number; z: number } | null
  /** Throw the first living NON-acting pig at a grenade's full 45° knock —
   * the flung-pig paint spec's trigger (three/battle.ts). Returns who was
   * thrown and from where, or null on a one-pig map. */
  flingOther(): { pig: number; x: number; z: number } | null
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
  /** What the healing hands measured on their last press — who stood where
   * against the cone, who was taken and what went back on
   * (lib/game/healing.ts). */
  heal(): unknown
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
  /** Where each burning fuse's tip lands in the picture, in clip space. */
  fuseTips(): { x: number; y: number; z: number }[]
  /** Mines that have been trodden on and are counting down (lib/game/mines.ts). */
  mines(): { x: number; y: number; z: number; fuse: number }[]
  /** How many buried mines are being DRAWN for the side whose turn it is — a
   * marker only a nearby pig of the right class gets (three/mineArt.ts). */
  mineMarkers(): number
  /** How many pairs of BOOTS are drawn — the renderer's word that a `remains`
   * event became art (three/remains.ts). */
  remains(): number
  /** …and how many DISGUISES — a hidden pig's decoy became art
   * (three/decoyArt.ts). */
  decoys(): number
  /** How full the power gauge is, 0..1, or null when nothing is charging
   * (lib/game/gauge.ts). */
  charging(): number | null
  /** Where the shot sequence has got to — 'fuse', 'wind' (a throw's clip is
   * on and the grenade not yet out), 'flight', or null when the pig is its
   * own again (lib/game/shot.ts). */
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
  /** The SERGEANT's own beat, between the walk away and the handover — he says
   * well done for a kill and bad luck for a loss (lib/game/sergeant.ts). */
  sergeant(): boolean
  /** …and which of his lines have been played, as file paths (audio/sarge.ts). */
  sargeSpoken(): string[]
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
  /** WHERE the machine is thinking, and how much of it has come back
   * (lib/game/brainPort.ts, src/brain/). `remote` is whether the battle was
   * built with a port to the AI's own process at all. */
  brain(): { remote: boolean; asked: number; answered: number }
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
    at: {
      name: string
      x: number
      y: number
      z: number
      order: number
      /** The texture each of its face groups is drawn in, off the mesh itself. */
      maps: string[]
      /** The sum of the colour bytes of its last group's texture. */
      texels: number
    }[]
  }
  /** Where a SIGN's board is in the frame, as fractions of the canvas, or null
   * if the record has no mesh. */
  boardOnScreen(id: number): { left: number; top: number; right: number; bottom: number } | null
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
      /** ONE PLAYER — NEW GAME, LOAD GAME, PROVING GROUND (ui/onePlayer.ts). */
      onePlayer?: BarScreenView
      /** LOAD GAME — the eight slots (ui/loadScreen.ts). */
      loadScreen?: BarScreenView
      /** MISSION SELECT — the completed missions and their PP records
       * (ui/missionSelect.ts). */
      missionSelect?: BarScreenView
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
        /** Walk the bank hands-free, each sound held for its own length.
         * `pow.sfx.walk('L_')` is the launches, `walk(undefined, { fresh: true })`
         * is everything not heard yet; the handle stops it. */
        walk(
          filter?: string,
          opts?: { gap?: number; fresh?: boolean }
        ): { stop(): void; at(): string | null; heard(): string[] }
        /** …or step it by hand: `const g = pow.sfx.each('I_'); g.next()`.
         * `each(undefined, true)` skips what has already sounded. */
        each(
          filter?: string,
          fresh?: boolean
        ): Generator<{ index: number; name: string }, void, unknown>
        /** What is left to hear — the same list `fresh` walks. */
        left(filter?: string): { index: number; name: string }[]
        /** One more each time you ask: the generator kept for you, so the
         * console's up-arrow is the whole interface. */
        next(
          filter?: string,
          /** Skip what is already settled. TRUE by default; `false` steps all
           * ninety-nine in bank order. */
          fresh?: boolean
        ): { index: number; name: string } | null
        /** Start `next()` over. */
        rewind(): void
        /** Point `next()` at a list of FILE PATHS instead of at the bank —
         * a shortlist, stepped one key at a time. */
        queue(paths: readonly string[]): number
        /** Any audio file in the install, by path — the battle bank is not all
         * there is: `pow.sfx.file('FESounds/hiss1.wav')`. */
        file(path: string): Promise<string>
        now(): Record<string, unknown>
        set(
          moment: string,
          name: string | number,
          mix?: { volume?: number; pitch?: number; jitter?: number }
        ): string | null
        print(): Record<string, unknown>
      }
      /**
       * The SERGEANT, live — `pow.sarge.play(2, 1)` is the praise for a kill.
       *
       * Which of his 22 categories belongs to which moment is an EAR's
       * question and nobody else's: the lines carry no subtitles anywhere in
       * either text table, so listening is the only way to place one. Two are
       * built (lib/game/sergeant.ts); the other nineteen are decoded, written
       * up, and waiting for a moment to be pinned to (docs/history/turns.md).
       */
      sarge?: {
        /** By the exe's own SECTION argument, 0-based. */
        play(section: number, line: number): string
        /** …and by the FILE's number, which is what the folder shows: `file(3,
         * 1)` is SGEN0301, the praise. One higher than the section, always. */
        file(category: number, line: number): string
        stop(): void
        spoken(): string[]
        /** What each of the 22 is, as far as the exe says — the MOMENT is read,
         * the WORDS are not, and no table in the game holds them. */
        list(): Record<number, string>
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
      /** Open a battle on `map` from wherever the app is — `pow.open('ARTGUN')`
       * — with no campaign behind it and, unless `drop`, the squads already
       * standing. Resolves with the action's end: how it went and how long it
       * took (actions/actions.ts). The specs start here (`e2e/load.ts`). */
      open?(map: string, drop?: boolean): Promise<ActionEnd>
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
