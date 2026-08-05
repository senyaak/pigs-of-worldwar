// Terrain queries for the game: ground height at a world position and spawn
// picking. Pure — works on the parsed PMG blocks (lib/formats/pmg.ts).

import { BLOCKS_PER_SIDE, TILES_PER_SIDE, TILE_STEP, TILE_WALL, TILE_WATER, VERTS_PER_SIDE } from '../formats/pmg'
import type { TerrainBlock, TerrainTile } from '../formats/pmg'
import type { PigSpawn } from './game'

const BLOCK_SPAN = TILES_PER_SIDE * TILE_STEP

/**
 * How tall the world is, per unit of stored PMG height.
 *
 * The exe doubles: `Map::SampleHeight` ends in `shl eax,1`,
 * `afAdjustMapHeights` in `Data/_d3d.dll` doubles again when it builds the
 * visible mesh, the map's own bounds are stored doubled, and the PMG loader
 * (0x4a5250) copies the int16 across untouched — so nothing halves it first.
 * Three sites, all checked.
 *
 * And yet a doubled CAMP plays as a mountain range: median slope 26.6°
 * against 14° at 1x, and it reads as stretched next to the original. The
 * remaster's yardstick is the original's look, so 1x it is, and the exe
 * finding stays written down in `../pigs-disasm/movement/notes.md` with the
 * contradiction unresolved rather than quietly dropped.
 *
 * Everything horizontal — the 512 tile, the world limits — is unaffected.
 */
export const HEIGHT_SCALE = 1

/**
 * A vertical constant lifted from the exe, in OUR world. The exe's own
 * numbers are in its doubled space, so they follow HEIGHT_SCALE: change the
 * scale above and step-downs, standable relief and the rest keep meaning the
 * same thing about the same terrain.
 */
export const fromExeY = (units: number): number => (units * HEIGHT_SCALE) / 2

/** The world limit a pig's position is clamped to (exe 0x3000). */
export const WORLD_LIMIT = 12288

/** (x, z) brought inside the world limits — the edge of the map holds
 * whatever a pig is doing, walking or flying. */
export const clampToWorld = (x: number, z: number): { x: number; z: number } => ({
  x: Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, x)),
  z: Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, z))
})

const clampIndex = (value: number, last: number): number => Math.max(0, Math.min(value, last))

/**
 * Which part of a WALL tile is actually solid, by the tile's second byte.
 *
 * how-doc calls that byte `MapTileSlip` and reads it as a slide direction.
 * It is nothing of the kind: `Map::IsBlocked` (exe VA 0x4a7000) ignores it
 * unless `type & 0x80`, then switches on its low nibble 0..8 to test the
 * point against half a tile or a diagonal — the wall occupies a PART of the
 * tile, not all of it. 98% of the bytes in the shipped maps sit on wall
 * tiles, and the mirrored reading below puts the solid side on the raised
 * ground for 37% more tiles than the literal one
 * (`../pigs-disasm/movement/wall-shapes.js`); the exe measures its
 * fractional z along +z where a PMG row advances -z, which is exactly that
 * mirror.
 *
 * Coordinates are the tile's own, 0..1, tz running -z. 0 is the whole tile.
 */
const WALL_SHAPES: Record<number, (tx: number, tz: number) => boolean> = {
  0: () => true,
  1: (_tx, tz) => tz > 0.5,
  2: (tx) => tx < 0.5,
  3: (_tx, tz) => tz < 0.5,
  4: (tx) => tx > 0.5,
  5: (tx, tz) => tx + tz > 1,
  6: (tx, tz) => tx < tz,
  7: (tx, tz) => tx + tz < 1,
  8: (tx, tz) => tx > tz
}

/** One half of a tile as a plane, in the tile's own (tx, tz) coordinates. */
interface Half {
  origin: number
  alongX: number
  alongZ: number
}

/** A point inside a tile, with both halves of that tile. */
interface Patch {
  tx: number
  tz: number
  near: Half
  far: Half
}

export class TerrainQuery {
  private readonly minX: number
  private readonly maxZ: number
  /** Blocks indexed [row][col] on the world grid. */
  private readonly grid: TerrainBlock[][]

  constructor(private readonly blocks: TerrainBlock[]) {
    this.minX = Math.min(...blocks.map((b) => b.x))
    this.maxZ = Math.max(...blocks.map((b) => b.z))
    this.grid = []
    for (const block of blocks) {
      const col = Math.round((block.x - this.minX) / BLOCK_SPAN)
      const row = Math.round((this.maxZ - block.z) / BLOCK_SPAN)
      ;(this.grid[row] ??= [])[col] = block
    }
  }

  /**
   * Ground level at world (x, z) in GAME coordinates (Y down). PMG stores
   * elevation up-positive (verified: water sits at the small values), hence
   * the negation.
   */
  height(x: number, z: number): number {
    return -this.elevation(x, z)
  }

  /**
   * Where (x, z) falls inside its tile, with both halves of that tile as
   * planes. Slopes are per unit of `tx` (running +x) and `tz` (running -z);
   * `origin` is the elevation those slopes start from.
   *
   * The original's sampler (`Map::SampleHeight`, VA 0x4a5140) splits every
   * tile along (col+1,row)-(col,row+1) — the same diagonal the ground mesh
   * is built with, so the surface a pig walks on is exactly the one it is
   * standing on visually. A bilinear patch is NOT that shape and pops along
   * the edge.
   */
  private patch(x: number, z: number): Patch | null {
    const col = Math.floor((x - this.minX) / BLOCK_SPAN)
    const row = Math.floor((this.maxZ - z) / BLOCK_SPAN)
    const block = this.grid[row]?.[col]
    if (!block) return null
    // Fractional vertex coordinates inside the block (rows advance -z).
    const fx = (x - block.x) / TILE_STEP
    const fz = (block.z - z) / TILE_STEP
    // Clamped BOTH ways: a coordinate a hair the wrong side of a block
    // boundary rounds into the neighbouring block and leaves fx/fz just
    // outside [0, 4) — unclamped that indexes off the height grid and the
    // ground comes back NaN.
    const cx = clampIndex(Math.floor(fx), VERTS_PER_SIDE - 2)
    const cz = clampIndex(Math.floor(fz), VERTS_PER_SIDE - 2)
    const h = (r: number, c: number): number =>
      block.heights[r * VERTS_PER_SIDE + c] * HEIGHT_SCALE
    const half = (far: boolean): Half => {
      const corner = far ? h(cz + 1, cx + 1) : h(cz, cx)
      const alongX = far ? corner - h(cz + 1, cx) : h(cz, cx + 1) - corner
      const alongZ = far ? corner - h(cz, cx + 1) : h(cz + 1, cx) - corner
      return { origin: far ? corner - alongX - alongZ : corner, alongX, alongZ }
    }
    return { tx: fx - cx, tz: fz - cz, near: half(false), far: half(true) }
  }

  private elevation(x: number, z: number): number {
    const patch = this.patch(x, z)
    if (!patch) return 0
    const { tx, tz } = patch
    const half = tx + tz < 1 ? patch.near : patch.far
    return half.origin + half.alongX * tx + half.alongZ * tz
  }

  private tileAt(x: number, z: number): TerrainTile | null {
    const col = Math.floor((x - this.minX) / BLOCK_SPAN)
    const row = Math.floor((this.maxZ - z) / BLOCK_SPAN)
    const block = this.grid[row]?.[col]
    if (!block) return null
    const tx = clampIndex(Math.floor((x - block.x) / TILE_STEP), TILES_PER_SIDE - 1)
    const tz = clampIndex(Math.floor((block.z - z) / TILE_STEP), TILES_PER_SIDE - 1)
    return block.tiles[tz * TILES_PER_SIDE + tx] ?? null
  }

  /**
   * May a pig BE at (x, z)? The void says no, and a wall tile says no for
   * the PART of itself its shape byte marks solid — the original blocks
   * half-tiles and diagonals, not whole tiles. Water is fine: pigs swim
   * (the caller decides what that means for speed and depth).
   */
  walkable(x: number, z: number): boolean {
    const tile = this.tileAt(x, z)
    if (tile === null) return false
    if ((tile.type & TILE_WALL) === 0) return true
    const shape = WALL_SHAPES[tile.slip & 0x0f]
    if (!shape) return true
    const patch = this.patch(x, z)
    return patch === null ? false : !shape(patch.tx, patch.tz)
  }

  /** Is (x, z) water — swimming, not walking? */
  isWater(x: number, z: number): boolean {
    const tile = this.tileAt(x, z)
    return tile !== null && (tile.type & TILE_WATER) !== 0
  }

  /** A comfortable place to stand: this tile and its neighbors dry and
   * walkable, and the ground near-flat (no trench parapets). */
  standable(x: number, z: number): boolean {
    for (const [dx, dz] of [[0, 0], [-TILE_STEP, 0], [TILE_STEP, 0], [0, -TILE_STEP], [0, TILE_STEP]]) {
      if (!this.walkable(x + dx, z + dz) || this.isWater(x + dx, z + dz)) return false
    }
    const half = TILE_STEP / 2
    const corners = [
      this.height(x - half, z - half),
      this.height(x + half, z - half),
      this.height(x - half, z + half),
      this.height(x + half, z + half)
    ]
    // Flat enough that a pig will not immediately walk off it: two of
    // `movement.ts`'s STEP_DOWN, which is where a walk turns into a fall.
    return Math.max(...corners) - Math.min(...corners) < fromExeY(64)
  }

  /**
   * Deterministic spawn points: `count` standable tile centers, the first
   * half picked from the west side of the map, the second from the east, so
   * two squads start apart. Scans on a coarse lattice from each side inward.
   */
  pickSpawns(count: number): PigSpawn[] {
    const spawns: PigSpawn[] = []
    const span = BLOCKS_PER_SIDE * BLOCK_SPAN
    const step = TILE_STEP * 2
    // Stay away from the world border: the outer ring of most maps is flat
    // walkable filler at the edge of the void, and pigs spawned there stand
    // with their backs to the abyss.
    const margin = span / 8
    const half = Math.ceil(count / 2)
    const scan = (fromWest: boolean, wanted: number): void => {
      for (let ix = 0; ix * step < span / 2 - margin && wanted > 0; ix++) {
        const x = fromWest
          ? this.minX + margin + TILE_STEP / 2 + ix * step
          : this.minX + span - margin - TILE_STEP / 2 - ix * step
        for (let iz = 0; iz * step < span - margin * 2 && wanted > 0; iz++) {
          const z = this.maxZ - margin - TILE_STEP / 2 - iz * step
          // Keep squadmates apart too.
          const tooClose = spawns.some((s) => Math.hypot(s.x - x, s.z - z) < TILE_STEP * 3)
          if (this.standable(x, z) && !tooClose) {
            spawns.push({ x, z })
            wanted--
          }
        }
      }
    }
    scan(true, half)
    scan(false, count - spawns.length)
    if (spawns.length < count) throw new Error(`found only ${spawns.length} of ${count} spawns`)
    return spawns
  }
}
