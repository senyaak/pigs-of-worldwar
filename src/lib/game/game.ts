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

export class Game {
  readonly players: Player[]
  readonly turnSeconds: number
  private currentPlayerIndex = 0
  private turnNumber = 1
  private timeLeftSeconds: number

  constructor(config: GameConfig) {
    if (config.players.length < 2) throw new Error('a game needs at least two players')
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
            pigClass: at.pigClass ?? GRUNT
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
   * Advance the turn clock. Returns true exactly when this tick ran the
   * clock out — the caller ends the turn (and owns whatever ceremony that
   * involves).
   */
  tick(deltaSeconds: number): boolean {
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
  }
}
