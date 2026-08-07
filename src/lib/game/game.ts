// The game domain model — pure, like the format readers: no Electron, no
// three.js, no IPC. The renderer draws what this says; tests drive it
// directly (e2e/002/game-logic.spec.ts).
//
// Turn structure follows the original: players rotate round-robin, and each
// player fields their pigs in order — every time a player's turn comes up,
// the next pig of that squad is the one that acts.

export interface PigSpawn {
  x: number
  z: number
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
  name: string
  /** Index into the player's squad. */
  index: number
  health: number
  position: { x: number; z: number }
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
  pigs: Pig[]
  /** Which pig acts the next time this player's turn comes up. */
  activePig: number
}

export interface GameConfig {
  players: { name: string; pigNames: string[] }[]
  /** One spawn per pig, in player order then squad order. */
  spawns: PigSpawn[]
  /** Seconds a player has per turn (the original's turn clock). */
  turnSeconds?: number
}

export const DEFAULT_TURN_SECONDS = 45

/**
 * The beat at the top of every turn, before the clock starts.
 *
 * It is a MODE of its own in the original, with its own debug line —
 * "START OF TURN - Press any key to continue" (exe 0x4d8a2c) — and three
 * ways out, each of which also announces itself: the timeout at 0x49134d,
 * any digital input at 0x491314, and the pause button at 0x491329. The
 * timeout is `[+0x484]`, set to 0x3E6 in the block of them at 0x48f1f9,
 * and its neighbours (0x7CE, 0x1F2, 0x1192) read as milliseconds two short
 * of a round number — so 998 ms, near enough one second.
 *
 * The clock does not run during it and the pig cannot be driven; the first
 * input both ends the wait and is acted on, which is the remake's own
 * reading of "press any key" (the exe's mode machine is not decoded that
 * far, and swallowing the press would only annoy).
 */
export const TURN_START_SECONDS = 0.998

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
    this.players = config.players.map((player) => {
      if (player.pigNames.length === 0) throw new Error(`${player.name} has no pigs`)
      return {
        name: player.name,
        activePig: 0,
        pigs: player.pigNames.map((name, index) => {
          const at = config.spawns[spawn++]
          return {
            name,
            index,
            health: 100,
            position: { x: at.x, z: at.z },
            heading: at.heading ?? 0,
            pigClass: at.pigClass ?? GRUNT,
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
   * always succeeds; the caller validated the ground. */
  moveCurrentPig(x: number, z: number, heading: number): void {
    const pig = this.currentPig
    pig.position = { x, z }
    pig.heading = heading
  }

  /** Involuntary displacement — sliding, knockback. */
  displaceCurrentPig(x: number, z: number): void {
    this.currentPig.position = { x, z }
  }

  /** Turn the acting pig on the spot. */
  turnCurrentPig(heading: number): void {
    this.currentPig.heading = heading
  }

  /** Hand over to the next player; their squad advances to its next pig. */
  endTurn(): void {
    const player = this.currentPlayer
    player.activePig = (player.activePig + 1) % player.pigs.length
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length
    if (this.currentPlayerIndex === 0) this.turnNumber++
    this.timeLeftSeconds = this.turnSeconds
    this.startingFor = TURN_START_SECONDS
  }
}
