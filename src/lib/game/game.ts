// The game domain model — pure, like the format readers: no Electron, no
// three.js, no IPC. The renderer draws what this says; tests drive it
// directly (e2e/002/game-logic.spec.ts).
//
// Turn structure follows the original: players rotate round-robin, and each
// player fields their pigs in order — every time a player's turn comes up,
// the next pig of that squad is the one that acts.

import type { Slot } from './inventory'
import { isDead, maxHealthFor } from './health'
import { NO_BODY } from './body'
import type { BodyExtent } from './body'

export interface PigSpawn {
  x: number
  z: number
  /** Where the SOLES start, game space (Y-down). A marker does not carry one
   * — the ground does — so whoever fields the squad drops the pig on the
   * terrain and says where that was; without it a pig starts at zero and the
   * first frame of its turn puts it right. */
  y?: number
  /** How big this pig's body is, measured off its own art (lib/game/body.ts).
   * Absent where there is no art — the pure specs field squads with none. */
  body?: BodyExtent
  /** Facing the map asked for; pigs start looking north without one. */
  heading?: number
  /** Class index — Grunt 0, Gunner 1, … The map's own spawn markers carry
   * it (lib/game/spawns.ts); a fabricated spawn leaves it a grunt. */
  pigClass?: number
  /** Whether the pig drops into the level under a canopy instead of
   * standing on the marker from the first frame (lib/game/parachute.ts). */
  parachutes?: boolean
}

export const GRUNT = 0

export interface Pig {
  /**
   * What NAMES this pig anywhere but in memory.
   *
   * Flat across the whole battle and handed out as the squads are built, so it
   * survives a trip through anything that cannot carry an object reference —
   * the event bus first (lib/game/events.ts), and a port to another process
   * next. Nothing in the rules looks a pig up by it; everything that leaves
   * the engine is named by it.
   */
  id: number
  name: string
  /** Index into the player's squad. */
  index: number
  /**
   * Points, and its CLASS says how many it started with — a grunt fifty, a
   * heavy a hundred and twenty (lib/game/health.ts). At or below zero the pig
   * is dead; nothing here caps it above, because the original's heal does
   * not either.
   */
  health: number
  /** What it is carrying: up to fifteen skills, in the order they were
   * picked up (lib/game/inventory.ts). A pig starts with nothing — every
   * shipped map hands out its weapons in crates. */
  carrying: Slot[]
  /** The skill chosen out of the menu, or null for empty hands. The pig
   * takes its model in hand and aims it (lib/game/weapons.ts, aim.ts);
   * nothing FIRES it yet. */
  holding: number | null
  /**
   * Where it stands, game space (Y-DOWN) — and `y` is the SOLES, the same
   * quantity `restingY` and the locomotion state carry.
   *
   * The body's ORIGIN, which is what a blow is measured against, sits
   * `body.footOffset` above it: `originY`. Both used to live in the renderer's
   * mesh, which is why anything that could hit a pig had to reach into the
   * scene for it.
   */
  position: { x: number; y: number; z: number }
  /** How big this pig's body is (lib/game/body.ts) — a measurement of the
   * art, held here so the rules never have to ask the renderer. */
  body: BodyExtent
  /** Facing, radians around Y in the game's own space. */
  heading: number
  /** Class index — what the pig is, before it is anywhere. */
  pigClass: number
  /** Whether it arrives by parachute when the level opens. Where it lands is
   * where it was always going to stand, so nothing else in the domain cares;
   * the battle scene owns the descent. */
  parachutes: boolean
}

export interface Player {
  name: string
  /**
   * Which nation this side wears, 0..6 — what dresses its pigs and colours
   * its markers (lib/game/nations.ts).
   *
   * It is NOT the side's slot on the map: the player's is chosen at SELECT
   * TEAM and the enemy's comes off the campaign's own schedule, so two sides
   * can hold slots 2 and 4 (DEVI does) and still be British and whoever the
   * save says.
   */
  nation: number
  pigs: Pig[]
  /** Which pig acts the next time this player's turn comes up. */
  activePig: number
}

export interface GameConfig {
  /**
   * The sides. `nation` dresses them (lib/game/nations.ts) and defaults to the
   * side's own position — which is what a battle assembled without a campaign
   * behind it gets, and what every spec that does not care about uniforms
   * wants.
   */
  players: { name: string; nation?: number; pigNames: string[] }[]
  /** One spawn per pig, in player order then squad order. */
  spawns: PigSpawn[]
  /** Seconds a player has per turn (the original's turn clock). */
  turnSeconds?: number
}

/**
 * A turn's length where the map does not say otherwise — `turnSecondsFor`
 * has the decoded table and what is missing from it.
 */
export const DEFAULT_TURN_SECONDS = 45

/**
 * The beat at the top of every turn, before the clock starts.
 *
 * It is a MODE of its own in the original, with its own debug line —
 * "START OF TURN - Press any key to continue" (exe 0x4d8a2c) — and three
 * ways out, each of which also announces itself: the timeout at 0x49134d,
 * any digital input at 0x491314, and the pause button at 0x491329.
 *
 * The timeout is `[+0x484]` = 0x3E6 = 998, and the unit is HUNDREDTHS of a
 * second: the same block sets the turn clock's own field to 4498, and the
 * per-level turn length is fed into it as seconds × 100 (0x4309f8), so 4498
 * is the 45 that table holds. Ten seconds, then — a "press any key" prompt
 * with the camera flying to the next pig behind it, not a wait anybody
 * sits through.
 *
 * The clock does not run during it and the pig cannot be driven; the first
 * input both ends the wait and is acted on, which is the remake's own
 * reading of "press any key" (the exe's mode machine is not decoded that
 * far, and swallowing the press would only annoy).
 */
export const TURN_START_SECONDS = 9.98

export class Game {
  readonly players: Player[]
  readonly turnSeconds: number
  private currentPlayerIndex = 0
  private turnNumber = 1
  private timeLeftSeconds: number
  /** Seconds left of the pause at the top of the turn (TURN_START_SECONDS). */
  private startingFor = TURN_START_SECONDS

  constructor(config: GameConfig) {
    // One is allowed: the training ground fields a single pig, and the turn
    // rotation over one player is simply that pig, turn after turn.
    if (config.players.length < 1) throw new Error('a game needs a player')
    this.turnSeconds = config.turnSeconds ?? DEFAULT_TURN_SECONDS
    this.timeLeftSeconds = this.turnSeconds
    const pigCount = config.players.reduce((sum, p) => sum + p.pigNames.length, 0)
    if (config.spawns.length !== pigCount) {
      throw new Error(`${pigCount} pigs need ${pigCount} spawns, got ${config.spawns.length}`)
    }
    let spawn = 0
    let id = 0
    this.players = config.players.map((player, side) => {
      if (player.pigNames.length === 0) throw new Error(`${player.name} has no pigs`)
      return {
        name: player.name,
        nation: player.nation ?? side,
        activePig: 0,
        pigs: player.pigNames.map((name, index) => {
          const at = config.spawns[spawn++]
          const pigClass = at.pigClass ?? GRUNT
          return {
            id: id++,
            name,
            index,
            health: maxHealthFor(pigClass),
            carrying: [],
            holding: null,
            position: { x: at.x, y: at.y ?? 0, z: at.z },
            body: at.body ?? NO_BODY,
            heading: at.heading ?? 0,
            pigClass,
            parachutes: at.parachutes ?? false
          }
        })
      }
    })
  }

  get turn(): number {
    return this.turnNumber
  }

  get currentPlayer(): Player {
    return this.players[this.currentPlayerIndex]
  }

  get currentPig(): Pig {
    const player = this.currentPlayer
    return player.pigs[player.activePig]
  }

  /** Seconds left on the turn clock. */
  get timeLeft(): number {
    return this.timeLeftSeconds
  }

  /**
   * Whether the turn has not begun yet — the beat the original waits out
   * before it starts counting (TURN_START_SECONDS).
   */
  get starting(): boolean {
    return this.startingFor > 0
  }

  /** Begin the turn now: what any input does, and what the wait does on its
   * own once it runs out. */
  beginTurn(): void {
    this.startingFor = 0
  }

  /**
   * Cut the clock to `seconds`, and keep the turn.
   *
   * What a PLANTED charge does instead of ending one: the exe re-stamps the
   * turn's deadline out of the skill's own wait and hands control straight back
   * (0x4945a5, lib/game/spend.ts). A SET rather than a bonus — ninety seconds
   * left becomes four — so plant it and run.
   */
  hurryTurn(seconds: number): void {
    this.timeLeftSeconds = seconds
  }

  /**
   * Advance the turn clock. Returns true exactly when this tick ran the
   * clock out — the caller ends the turn (and owns whatever ceremony that
   * involves).
   */
  tick(deltaSeconds: number): boolean {
    // The turn has not started yet: the pause burns down instead of the
    // clock, and nothing can run out.
    if (this.startingFor > 0) {
      this.startingFor = Math.max(0, this.startingFor - deltaSeconds)
      return false
    }
    if (this.timeLeftSeconds <= 0) return false
    this.timeLeftSeconds -= deltaSeconds
    return this.timeLeftSeconds <= 0
  }

  /** Move the acting pig — the clock is the only movement limit, so this
   * always succeeds; the caller validated the ground. `y` is the soles, and
   * comes from the locomotion state that worked the step out. */
  moveCurrentPig(x: number, y: number, z: number, heading: number): void {
    const pig = this.currentPig
    pig.position = { x, y, z }
    pig.heading = heading
  }

  /** Involuntary displacement — sliding, knockback. */
  displaceCurrentPig(x: number, y: number, z: number): void {
    this.currentPig.position = { x, y, z }
  }

  /** Turn the acting pig on the spot. */
  turnCurrentPig(heading: number): void {
    this.currentPig.heading = heading
  }

  /** Whether this side still has anyone standing. */
  private standing(player: Player): boolean {
    return player.pigs.some((pig) => !isDead(pig))
  }

  /** The next pig of a squad still standing after `from`, or −1 for a side
   * that has been wiped out. A squad of one answers with the same pig. */
  private nextStanding(player: Player, from: number): number {
    for (let step = 1; step <= player.pigs.length; step++) {
      const at = (from + step) % player.pigs.length
      if (!isDead(player.pigs[at])) return at
    }
    return -1
  }

  /** Whether anyone at all is left to play. */
  get over(): boolean {
    return !this.players.some((player) => this.standing(player))
  }

  /**
   * Hand over to the next player; their squad advances to its next pig.
   *
   * The DEAD are stepped over on both counts — a fallen pig never comes up
   * again, and a side with none left is passed by rather than handed a turn
   * it cannot take. A battle with nobody standing leaves everything where it
   * is: `over` is what says so.
   */
  endTurn(): void {
    if (this.over) return
    const player = this.currentPlayer
    const nextPig = this.nextStanding(player, player.activePig)
    if (nextPig >= 0) player.activePig = nextPig
    for (let step = 1; step <= this.players.length; step++) {
      const at = (this.currentPlayerIndex + step) % this.players.length
      const next = this.players[at]
      if (!this.standing(next)) continue
      // The pig THIS side left off on may have fallen since — it advances
      // when its own turn ends, so a squad coming back up can be pointing at
      // a body. Step it on before handing anything over.
      if (isDead(next.pigs[next.activePig])) {
        next.activePig = this.nextStanding(next, next.activePig)
      }
      // Coming back round to a side we have already had is a new turn — the
      // same rule as before, only now a wiped-out side does not get one.
      if (at <= this.currentPlayerIndex) this.turnNumber++
      this.currentPlayerIndex = at
      break
    }
    this.timeLeftSeconds = this.turnSeconds
    this.startingFor = TURN_START_SECONDS
  }
}
