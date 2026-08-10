// MINEFIELDS, which are not objects — they are a bit in the ground.
//
// Play: "мины тут на карте должны быть." They are, and they have been in every
// shipped map's data all along: **bit 6 of a tile's type byte** (`TILE_MINE`,
// lib/formats/pmg.ts), 99 tiles of it on CAMP and 997 on BUTE. Nothing is drawn
// for one and nothing needs to be — the tile's own texture is what warns you,
// which is why the training ground can say "FOLLOW THE PATH THROUGH THE
// MINEFIELD" about a patch of ground with nothing standing on it.
//
// The exe, end to end, and every step of it was read this pass:
//
// ```
// 46bfd9  the pig's own tile, [pig+0x382] == 1        ; on the ground
// 46c00c  the type byte >> 6 & 1                      ; a mine is here
// 46c048  Map::SampleHeight(x, z)                     ; the tile's GROUND
// 46c072  Sound::Play(0x28, 100, 100)                 ; 40 is L_MINETR
// 46c0e3  Projectile(0x1AD or 0x1AC, at the tile)     ; 429 / 428 -- the BLAST
// 46c169  Map::SetMine(col, row, 0, 0)                ; ...and the bit is CLEARED
// ```
//
// So a mine is ONE-SHOT, it goes off at the TILE'S CENTRE rather than under the
// foot that found it, and what it spawns is an ordinary projectile with no arming
// and a 12-frame fuse — you hear the trigger, and then it goes off. The slip
// byte's bit 7 picks 429 over 428 (`Map::SetMine`'s fourth argument writes it),
// and the two rows are identical in everything this engine models: same speed,
// same 2560 of damage, same 1024 of blast. Only the effect id differs, 0x55
// against 0x4c, and the remake has neither.
//
// **The mine WEAPON is the same mechanic from the other end** and is not
// implemented: skills 35 and 36 drop a projectile (kinds 38/39) which, on
// touching the ground, calls `Map::SetMine(col, row, 1, flavour)` (0x4374cf) and
// leaves the bit behind it. The day it lands, this module is where it plants.
//
// Pure, seconds and game space (Y-DOWN), like the rest of lib/game.

import { FUSE_JITTER, blastReach } from './grenade'
import { burst } from './blast'
import type { BlastWorld } from './blast'
import { fromExeFrames } from './ballistics'
import type { Random } from './random'
import type { TerrainQuery } from './terrain'
import type { Emit } from './events'

/**
 * The blast a tripped mine throws — projectile row 40/41 at 0x4c2030, read out
 * of the shipped exe.
 *
 * `damage` is 128ths of a point, so 2560 is twenty against a grunt's fifty
 * (lib/game/projectile.ts), and `blast` is the row's +0x04 the falloff is
 * measured from — the same 1024 a plain grenade carries.
 */
export const MINE_DAMAGE = 2560
export const MINE_BLAST = 1024
/**
 * Row +0x18, in engine frames — and it is a FUSE rather than a delay before
 * anything is decided.
 *
 * The row's arming count (+0x14) is zero, which is what sends the constructor
 * straight past state 0 into the fuse (0x43200c dispatches on +0x1C only when
 * the arming count is nil), so twelve frames is the whole of it: about four
 * tenths of a second between the trigger and the bang.
 */
export const MINE_FUSE_FRAMES = 12

/** One mine that has been trodden on and has not gone off yet. */
export interface Tripped {
  x: number
  y: number
  z: number
  /** Seconds left. */
  fuse: number
}

export interface MineWorld extends BlastWorld {
  query: TerrainQuery
  /** The battle's own stream: the fuse takes the same `rand() & 7` of jitter a
   * grenade's does (lib/game/grenade.ts), so it is a roll everyone must agree
   * on (lib/game/random.ts). */
  random: Random
}

export interface Mines {
  /**
   * Whatever is buried under (x, z) — set it off.
   *
   * True the frame one is trodden on, which is the caller's cue to make the
   * noise. The tile is cleared in the same breath, so standing on the spot does
   * not trip it twice and neither does the next pig.
   */
  tread(x: number, z: number): boolean
  /** Burn the fuses down, and blast whatever runs out. */
  update(delta: number): void
  /** How many are counting down — what the turn cannot end through
   * (lib/game/battle.ts). */
  live(): number
  /** Every one of them, for a spec to measure. */
  at(): readonly Tripped[]
  /** Whether a mine is still buried here: the map's bit, less the ones already
   * spent. */
  buried(x: number, z: number): boolean
  clear(): void
}

export function createMines(world: MineWorld, emit: Emit): Mines {
  const { query } = world
  /** Which tiles have been spent, by `row * 64 + col` — the exe clears the map's
   * own bit and this is that difference, held outside the map data so a query
   * still answers what the FILE said (lib/game/terrain.ts). */
  const spent = new Set<number>()
  const counting: Tripped[] = []

  const key = (col: number, row: number): number => row * 64 + col

  return {
    buried(x, z) {
      if (!query.hasMine(x, z)) return false
      const tile = query.tileCentre(x, z)
      return tile !== null && !spent.has(key(tile.col, tile.row))
    },
    tread(x, z) {
      if (!query.hasMine(x, z)) return false
      const tile = query.tileCentre(x, z)
      if (tile === null || spent.has(key(tile.col, tile.row))) return false
      spent.add(key(tile.col, tile.row))
      counting.push({
        x: tile.x,
        z: tile.z,
        // On the ground at the tile's middle, which is where the exe samples it.
        y: query.height(tile.x, tile.z),
        fuse: fromExeFrames(MINE_FUSE_FRAMES + Math.floor(world.random() * (FUSE_JITTER + 1)))
      })
      return true
    },
    update(delta) {
      for (let i = counting.length - 1; i >= 0; i--) {
        const mine = counting[i]
        mine.fuse -= delta
        if (mine.fuse > 0) continue
        counting.splice(i, 1)
        burst(mine, { damage: MINE_DAMAGE, reach: blastReach(MINE_BLAST) }, world, emit)
      }
    },
    live: () => counting.length,
    at: () => counting,
    clear() {
      counting.length = 0
    }
  }
}
