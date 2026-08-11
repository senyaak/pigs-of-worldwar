// MINEFIELDS, which are not objects — they are a bit in the ground.
//
// Play: "мины тут на карте должны быть." They are, and they have been in every
// shipped map's data all along: **bit 6 of a tile's type byte** (`TILE_MINE`,
// lib/formats/pmg.ts), 99 tiles of it on CAMP and 997 on BUTE. The original draws
// nothing for one — the tile's own texture is the whole of what a player sees,
// which is why the training ground can say "FOLLOW THE PATH THROUGH THE
// MINEFIELD" about a patch of ground with nothing standing on it. What the remake
// draws, and for whom, is `revealed` below.
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
import { MINE_EFFECT_ID, burst } from './blast'
import type { BlastWorld } from './blast'
import { fromExeFrames } from './ballistics'
import { isDead } from './health'
import type { Pig } from './game'
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

/**
 * **A MINE IS HIDDEN.** Play: "мины скрыты — текстуры видны только тем кто рядом
 * и то только тем у кого есть класс специальный — и наверно ещё тем кто
 * поставил."
 *
 * Play's rule, and NOT a reading: the exe's terrain draw never looks at the mine
 * bit at all. Every one of its readers was chased this pass — the pig's trigger,
 * the projectile's, the AI's own passability map (0x461f60) and the eight copies
 * of a tile walk in 0x447xxx-0x453xxx — and none of them is in the renderer. What
 * the ORIGINAL shows is whatever the map's art shows: CAMP paints its 99 mine
 * tiles with four textures no other tile uses, and BOOM's 628 sit on ordinary
 * ground. So a shipped minefield is visible exactly when the map's author painted
 * one, and there is nothing per-viewer in it.
 *
 * The marker this reveals is therefore the remake's own: the game's own `WE_MINE`
 * model, put on the ground where a pig who KNOWS about mines can see it.
 *
 * **The range is a GROUND range** — play, asked: "к земле тоже". So what a detector
 * gets is the field around it lit up where it walks, and the same rule hides mines
 * from the enemy on the MAP VIEW when there is one to hide them on. The 1024 is
 * invented; the rule is play's.
 */
export const DETECT_RANGE = 1024

/**
 * Which classes see them — the ones whose OWN KIT is mines, read off the
 * 128-byte class record at 0x4d02e0 rather than picked by name.
 *
 * The record's pairs after the health and the walk grant are `(skill, amount)`,
 * and 35 MINE appears in exactly three of the twelve: classes **5, 6 and 7**,
 * which are the ENGINEER and its two promotions — 5 carries `1 ∞, 12 ∞, 35 ×3,
 * 37 ×1`, and 6 and 7 the same with more of it. A pig that lays mines for a living
 * is a pig that knows where one is. The whole table is in `weapons/mines.md`.
 *
 * Which class play meant by "специальный" is not settled — the ESPIONAGE family
 * (8, 9, 10: `55 CONCEAL` and `54 PICK POCKET`) is the other candidate, and one
 * line here moves it.
 */
const DETECTORS = new Set([5, 6, 7])

/** Whether a pig of this class can see what is buried. */
export const detectsMines = (pigClass: number): boolean => DETECTORS.has(pigClass)

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
  /**
   * Which buried mines these eyes can SEE — every unspent one within
   * `DETECT_RANGE` of a watcher whose class detects them.
   *
   * The caller says whose eyes: the side whose turn it is, so an enemy engineer
   * walking past does not light the field up for the player (three/battle.ts).
   * Points on the ground, ready to draw.
   */
  revealed(watchers: readonly Pig[]): { x: number; y: number; z: number }[]
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
        // …and it does not look like a grenade. The mine's own destructor names
        // effect 0x4c, which reads parameter row 14 (lib/game/effects.ts).
        burst(
          mine,
          { damage: MINE_DAMAGE, reach: blastReach(MINE_BLAST), effect: MINE_EFFECT_ID },
          world,
          emit
        )
      }
    },
    revealed(watchers) {
      const seeing = watchers.filter((pig) => detectsMines(pig.pigClass) && !isDead(pig))
      if (seeing.length === 0) return []
      const out: { x: number; y: number; z: number }[] = []
      for (const tile of query.mineTiles()) {
        if (spent.has(key(tile.col, tile.row))) continue
        const near = seeing.some(
          (pig) =>
            Math.hypot(pig.position.x - tile.x, pig.position.z - tile.z) <= DETECT_RANGE
        )
        if (near) out.push({ x: tile.x, y: query.height(tile.x, tile.z), z: tile.z })
      }
      return out
    },
    live: () => counting.length,
    at: () => counting,
    clear() {
      counting.length = 0
    }
  }
}
