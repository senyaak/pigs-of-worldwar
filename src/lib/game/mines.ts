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
// **The mine WEAPON is the same mechanic from the other end**, and it lands
// here (2026-08-26, read out of the exe end to end for the sapper):
//
// Skills 35 and 36 lay a VISIBLE OBJECT at the layer's own feet (the lay
// clip's key-frame drops it, the same phase TNT's charge goes down at). The
// object arms after 25 frames with the L_MINETR click (0x43699d), and then
// **BEDS INTO THE GROUND** — becomes the tile bit — only when nobody is
// near: the bed-in walker (0x436e55) requires the mine on the ground, NOT
// ONE live pig within ±512 of it on either axis, the tile dry, and no bit
// already there; then `Map::SetMine(col, row, 1, flavour)` (0x4374cf) and
// the object vanishes quietly. **That clearance is why a layer never trips
// its own mine**: while anyone stands about, the mine is furniture; the
// moment the last pig walks away it sinks into the ground and the ordinary
// tread above takes over — the layer's own foot included, the exe checks
// nobody's side and neither does this.
//
// 35 against 36 is a FLAVOUR (SetMine's fourth argument, the slip byte's bit
// 7): trigger kinds 40/41, identical damage (2560) and blast (1024), only
// the effect id apart (0x55 against 0x4c) — and both read parameter row 14,
// so the remake detonates both through `MINE_EFFECT_ID`. No shipped kit
// carries 36 at all.
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
 * Play's rule for the MARKER, and NOT a reading: the exe's terrain draw never
 * looks at the mine bit at all — what the ORIGINAL shows is whatever the map's
 * art shows. The marker this reveals is therefore the remake's own: the game's
 * `WE_MINE` model, put on the ground where a pig who KNOWS about mines can see
 * it.
 *
 * **The RANGE is the exe's reveal block now** (todo B10, closed 2026-08-26):
 * the ground-texture reveal saves and stamps a **3×3 of tiles around the
 * detector's own tile** (0x4767a0/0x476ba5), so a mine is revealed when its
 * tile is within one tile of a detector's on both axes. The invented 1024-unit
 * radius is gone with it.
 */
export const DETECT_TILES = 1

/**
 * Which classes see them — **the exe's own gate now** (todo B10): the reveal
 * block runs for `[pig+0x19C]` in {4, 5, 6, 7, 0x0E} — the COMMANDO, the
 * whole engineer family, and the HERO — not merely the three whose kit
 * carries the mine.
 */
const DETECTORS = new Set([4, 5, 6, 7, 14])

/** Whether a pig of this class can see what is buried. */
export const detectsMines = (pigClass: number): boolean => DETECTORS.has(pigClass)

/** The two skills that LAY one — the sapper family's weapon
 * (lib/game/kits.ts: classes 5, 6 and 7 carry three of skill 35 each). */
export const isMine = (skill: number | null): boolean => skill === 35 || skill === 36

/** The laid object's arming count: 25 exe frames to the L_MINETR click
 * (the projectile state machine at 0x43699d), through the engine's own
 * frame knob like every count. */
export const ARM_FRAMES = 25

/** The bed-in clearance: NOT ONE live pig within this of the mine on either
 * axis — the walker at 0x436e55 compares x and z separately against the
 * row's own 512, a one-tile square. This is what keeps a layer from
 * tripping its own mine: while anybody stands about it is furniture. */
export const BED_CLEARANCE = 512

/** One mine LAID this battle and not yet part of the ground: furniture at
 * the layer's feet, arming and then waiting for everyone to leave. Drawn to
 * EVERYBODY — it is a visible object in the original too. */
export interface Laid {
  x: number
  y: number
  z: number
  /** Which skill laid it — the flavour, 35 or 36. */
  skill: number
  /** Seconds to the arming click, then 0. */
  arming: number
}

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
  /**
   * Lay one at the pig's own feet — the lay clip's key-frame calls this the
   * way TNT's calls `plant` (lib/game/attack.ts). Refused on a tile that
   * already holds a mine, laid or shipped: the bed-in would refuse a second
   * bit for ever, so the lay refuses instead of leaving eternal furniture
   * (`[deliberate]` — the exe drops the object regardless and lets it lie).
   */
  lay(pig: Pig, skill: number): boolean
  /** The mines laid and not yet bedded — furniture on the ground, for the
   * renderer and the specs. */
  laid(): readonly Laid[]
  /** Burn the fuses down, blast whatever runs out — and walk the laid mines
   * through arming and bed-in. */
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
  /** The furniture: laid this battle and not yet part of the ground. */
  const laid: Laid[] = []
  /** …and the tiles the sapper's mines HAVE bedded into — the runtime half
   * of the map's own bit, key → where and what. */
  const planted = new Map<number, { x: number; y: number; z: number; skill: number }>()

  const key = (col: number, row: number): number => row * 64 + col

  /** The tile under (x, z) with a LIVE bit — the map's less the spent ones,
   * or one the sapper bedded — or null. */
  const liveTile = (
    x: number,
    z: number
  ): { col: number; row: number; x: number; z: number } | null => {
    const tile = query.tileCentre(x, z)
    if (tile === null) return null
    const k = key(tile.col, tile.row)
    if (planted.has(k)) return tile
    if (query.hasMine(x, z) && !spent.has(k)) return tile
    return null
  }

  return {
    buried(x, z) {
      return liveTile(x, z) !== null
    },
    tread(x, z) {
      const tile = liveTile(x, z)
      if (tile === null) return false
      const k = key(tile.col, tile.row)
      planted.delete(k)
      spent.add(k)
      counting.push({
        x: tile.x,
        z: tile.z,
        // On the ground at the tile's middle, which is where the exe samples it.
        y: query.height(tile.x, tile.z),
        fuse: fromExeFrames(MINE_FUSE_FRAMES + Math.floor(world.random() * (FUSE_JITTER + 1)))
      })
      return true
    },
    lay(pig, skill) {
      const { x, z } = pig.position
      const tile = query.tileCentre(x, z)
      if (tile === null) return false
      const k = key(tile.col, tile.row)
      if (planted.has(k) || (query.hasMine(x, z) && !spent.has(k))) return false
      laid.push({ x, y: query.height(x, z), z, skill, arming: fromExeFrames(ARM_FRAMES) })
      return true
    },
    laid: () => laid,
    update(delta) {
      // The laid mines: arm with the click, then BED INTO THE GROUND the
      // moment nobody is near — the exe's own walker (0x436e55), asked every
      // step. A wet tile, or one already carrying a bit, refuses for good:
      // the mine lies there as furniture, which is the exe's own answer.
      for (let i = laid.length - 1; i >= 0; i--) {
        const mine = laid[i]
        if (mine.arming > 0) {
          mine.arming -= delta
          if (mine.arming > 0) continue
          mine.arming = 0
          emit({ kind: 'mineArmed', at: { x: mine.x, y: mine.y, z: mine.z } })
        }
        const near = world
          .pigs()
          .some(
            (pig) =>
              !pig.gone &&
              !isDead(pig) &&
              Math.abs(pig.position.x - mine.x) <= BED_CLEARANCE &&
              Math.abs(pig.position.z - mine.z) <= BED_CLEARANCE
          )
        if (near) continue
        if (query.isWater(mine.x, mine.z)) continue
        const tile = query.tileCentre(mine.x, mine.z)
        if (tile === null) continue
        const k = key(tile.col, tile.row)
        if (planted.has(k) || (query.hasMine(mine.x, mine.z) && !spent.has(k))) continue
        planted.set(k, { x: tile.x, y: query.height(tile.x, tile.z), z: tile.z, skill: mine.skill })
        laid.splice(i, 1)
      }
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
      // The exe's reveal is a 3×3 of TILES round the detector's own
      // (0x4767a0), so the eyes are tile places, not a radius.
      const eyes = seeing
        .map((pig) => query.tileCentre(pig.position.x, pig.position.z))
        .filter((tile): tile is NonNullable<typeof tile> => tile !== null)
      const nearTile = (col: number, row: number): boolean =>
        eyes.some(
          (eye) => Math.abs(eye.col - col) <= DETECT_TILES && Math.abs(eye.row - row) <= DETECT_TILES
        )
      const out: { x: number; y: number; z: number }[] = []
      for (const tile of query.mineTiles()) {
        if (spent.has(key(tile.col, tile.row))) continue
        if (nearTile(tile.col, tile.row)) {
          out.push({ x: tile.x, y: query.height(tile.x, tile.z), z: tile.z })
        }
      }
      // …and the ones the sapper bedded this battle, by the same eyes.
      for (const [k, mine] of planted) {
        if (nearTile(k % 64, Math.floor(k / 64))) out.push({ x: mine.x, y: mine.y, z: mine.z })
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
