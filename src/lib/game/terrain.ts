// Terrain queries for the game: ground height at a world position and spawn
// picking. Pure — works on the parsed PMG blocks (lib/formats/pmg.ts).

import { BLOCKS_PER_SIDE, TILES_PER_SIDE, TILE_STEP, TILE_WALL, TILE_WATER, VERTS_PER_SIDE } from '../formats/pmg'
import type { TerrainBlock } from '../formats/pmg'
import type { PigSpawn } from './game'

const BLOCK_SPAN = TILES_PER_SIDE * TILE_STEP

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

  /** Ground height at world (x, z), bilinear over the vertex grid. */
  height(x: number, z: number): number {
    const col = Math.floor((x - this.minX) / BLOCK_SPAN)
    const row = Math.floor((this.maxZ - z) / BLOCK_SPAN)
    const block = this.grid[row]?.[col]
    if (!block) return 0
    // Fractional vertex coordinates inside the block (rows advance -z).
    const fx = (x - block.x) / TILE_STEP
    const fz = (block.z - z) / TILE_STEP
    const cx = Math.min(Math.floor(fx), VERTS_PER_SIDE - 2)
    const cz = Math.min(Math.floor(fz), VERTS_PER_SIDE - 2)
    const tx = fx - cx
    const tz = fz - cz
    const h = (r: number, c: number): number => block.heights[r * VERTS_PER_SIDE + c]
    const top = h(cz, cx) * (1 - tx) + h(cz, cx + 1) * tx
    const bottom = h(cz + 1, cx) * (1 - tx) + h(cz + 1, cx + 1) * tx
    return top * (1 - tz) + bottom * tz
  }

  /** Is the tile under world (x, z) ordinary ground (no water/wall)? */
  walkable(x: number, z: number): boolean {
    const col = Math.floor((x - this.minX) / BLOCK_SPAN)
    const row = Math.floor((this.maxZ - z) / BLOCK_SPAN)
    const block = this.grid[row]?.[col]
    if (!block) return false
    const tx = Math.min(Math.floor((x - block.x) / TILE_STEP), TILES_PER_SIDE - 1)
    const tz = Math.min(Math.floor((block.z - z) / TILE_STEP), TILES_PER_SIDE - 1)
    const tile = block.tiles[tz * TILES_PER_SIDE + tx]
    return (tile.type & (TILE_WATER | TILE_WALL)) === 0
  }

  /** A comfortable place to stand: this tile and its neighbors walkable,
   * and the ground near-flat (no trench parapets, no wall tops). */
  standable(x: number, z: number): boolean {
    for (const [dx, dz] of [[0, 0], [-TILE_STEP, 0], [TILE_STEP, 0], [0, -TILE_STEP], [0, TILE_STEP]]) {
      if (!this.walkable(x + dx, z + dz)) return false
    }
    const half = TILE_STEP / 2
    const corners = [
      this.height(x - half, z - half),
      this.height(x + half, z - half),
      this.height(x - half, z + half),
      this.height(x + half, z + half)
    ]
    return Math.max(...corners) - Math.min(...corners) < 150
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
