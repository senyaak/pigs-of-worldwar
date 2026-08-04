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
}

export interface Pig {
  name: string
  /** Index into the player's squad. */
  index: number
  health: number
  position: { x: number; z: number }
  /** Facing, radians around Y in the game's own space. */
  heading: number
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
}

/** How far one pig may walk in one turn, world units (tile = 512). */
export const MOVE_BUDGET = 4000

export class Game {
  readonly players: Player[]
  private currentPlayerIndex = 0
  private turnNumber = 1
  private moveLeft = MOVE_BUDGET

  constructor(config: GameConfig) {
    if (config.players.length < 2) throw new Error('a game needs at least two players')
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
            heading: 0
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

  /** Movement remaining for the pig currently acting. */
  get remainingMove(): number {
    return this.moveLeft
  }

  /**
   * Move the acting pig to (x, z), paying `distance` from the turn's
   * movement budget. Refused (false) when the budget cannot cover it —
   * the caller validated the ground; this validates the rules.
   */
  moveCurrentPig(x: number, z: number, distance: number, heading: number): boolean {
    if (distance > this.moveLeft) return false
    this.moveLeft -= distance
    const pig = this.currentPig
    pig.position = { x, z }
    pig.heading = heading
    return true
  }

  /** Involuntary displacement — sliding, knockback: no budget is paid. */
  displaceCurrentPig(x: number, z: number): void {
    this.currentPig.position = { x, z }
  }

  /** Hand over to the next player; their squad advances to its next pig. */
  endTurn(): void {
    const player = this.currentPlayer
    player.activePig = (player.activePig + 1) % player.pigs.length
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length
    if (this.currentPlayerIndex === 0) this.turnNumber++
    this.moveLeft = MOVE_BUDGET
  }
}
