// Terrain built to order for the phase-002 domain specs: a whole map whose
// elevation is a function and whose tiles are another. Shared by the
// movement, tile-query and locomotion specs — the fixture IS the contract
// those specs talk to the engine through, so it lives once.

import { BLOCKS_PER_SIDE, TILES_PER_SIDE, TILE_STEP, VERTS_PER_SIDE } from '../src/lib/formats/pmg'
import type { TerrainBlock, TerrainTile } from '../src/lib/formats/pmg'
import { HEIGHT_SCALE, TerrainQuery } from '../src/lib/game/terrain'

export const BLOCK_SPAN = TILES_PER_SIDE * TILE_STEP
export const MAP_ORIGIN = (BLOCKS_PER_SIDE * BLOCK_SPAN) / 2

/**
 * A whole map whose elevation (world units, up-positive) is `shape` and
 * whose tiles are `tile` — by default plain open ground.
 */
export function terrain(
  shape: (x: number, z: number) => number,
  tile: (x: number, z: number) => Partial<TerrainTile> = () => ({})
): TerrainQuery {
  return new TerrainQuery(terrainBlocks(shape, tile))
}

/** The same map as raw blocks, for specs that drive block-level helpers. */
export function terrainBlocks(
  shape: (x: number, z: number) => number,
  tile: (x: number, z: number) => Partial<TerrainTile> = () => ({})
): TerrainBlock[] {
  const blocks: TerrainBlock[] = []
  for (let row = 0; row < BLOCKS_PER_SIDE; row++) {
    for (let col = 0; col < BLOCKS_PER_SIDE; col++) {
      const x = -MAP_ORIGIN + col * BLOCK_SPAN
      const z = -MAP_ORIGIN + row * BLOCK_SPAN
      const heights = new Int16Array(VERTS_PER_SIDE * VERTS_PER_SIDE)
      for (let r = 0; r < VERTS_PER_SIDE; r++) {
        for (let c = 0; c < VERTS_PER_SIDE; c++) {
          heights[r * VERTS_PER_SIDE + c] = shape(x + c * TILE_STEP, z + r * TILE_STEP) / HEIGHT_SCALE
        }
      }
      const tiles = Array.from({ length: TILES_PER_SIDE * TILES_PER_SIDE }, (_, i) => ({
        texture: 0,
        rotateFlip: 0,
        type: 0,
        slip: 0,
        ...tile(x + (i % TILES_PER_SIDE) * TILE_STEP, z + Math.floor(i / TILES_PER_SIDE) * TILE_STEP)
      }))
      // The domain never reads the shade; unshaded keeps the fixture honest.
      const shades = new Uint8Array(VERTS_PER_SIDE * VERTS_PER_SIDE).fill(255)
      blocks.push({ x, z, heights, shades, tiles })
    }
  }
  return blocks
}
