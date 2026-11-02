// A whole map's ground built to order rather than read from a .PMG: the
// elevation is one function, the tiles another, the baked light a third.
//
// Two callers, one builder: the unit fixture that hands the movement and tile
// specs a map shaped for them (`unit/fixture.ts`), and the proving ground, the
// remake's own map (lib/game/provingTerrain.ts). The blocks come out exactly
// as `parsePmg` hands them over — the same 16×16 grid, block rows running +z,
// vertices +x with the column and +z with the row — so nothing downstream can
// tell a built map from a shipped one.
//
// Pure: numbers in, blocks out.

import { BLOCKS_PER_SIDE, TILES_PER_SIDE, TILE_STEP, VERTS_PER_SIDE } from '../formats/pmg'
import type { TerrainBlock, TerrainTile } from '../formats/pmg'
import { HEIGHT_SCALE } from './terrain'

/** One block's width, world units: four tiles of 512. */
export const BLOCK_SPAN = TILES_PER_SIDE * TILE_STEP
/** Half the map: blocks run from −MAP_ORIGIN to +MAP_ORIGIN on both axes. */
export const MAP_ORIGIN = (BLOCKS_PER_SIDE * BLOCK_SPAN) / 2

/** A vertex's baked brightness with nothing shading it (lib/formats/pmg.ts). */
export const UNSHADED = 255

/**
 * The map's blocks: the elevation at every vertex is `shape(x, z)` (world
 * units, up-positive, the PMG's own height space), the tile whose low corner
 * is at (x, z) is `tile(x, z)` over plain open ground, and every vertex's
 * brightness is `shade(x, z)` — unshaded unless asked.
 */
export function terrainBlocks(
  shape: (x: number, z: number) => number,
  tile: (x: number, z: number) => Partial<TerrainTile> = () => ({}),
  shade: (x: number, z: number) => number = () => UNSHADED
): TerrainBlock[] {
  const blocks: TerrainBlock[] = []
  for (let row = 0; row < BLOCKS_PER_SIDE; row++) {
    for (let col = 0; col < BLOCKS_PER_SIDE; col++) {
      const x = -MAP_ORIGIN + col * BLOCK_SPAN
      const z = -MAP_ORIGIN + row * BLOCK_SPAN
      const heights = new Int16Array(VERTS_PER_SIDE * VERTS_PER_SIDE)
      const shades = new Uint8Array(VERTS_PER_SIDE * VERTS_PER_SIDE)
      for (let r = 0; r < VERTS_PER_SIDE; r++) {
        for (let c = 0; c < VERTS_PER_SIDE; c++) {
          const vx = x + c * TILE_STEP
          const vz = z + r * TILE_STEP
          heights[r * VERTS_PER_SIDE + c] = shape(vx, vz) / HEIGHT_SCALE
          shades[r * VERTS_PER_SIDE + c] = shade(vx, vz)
        }
      }
      const tiles = Array.from({ length: TILES_PER_SIDE * TILES_PER_SIDE }, (_, i) => ({
        texture: 0,
        rotateFlip: 0,
        type: 0,
        slip: 0,
        ...tile(x + (i % TILES_PER_SIDE) * TILE_STEP, z + Math.floor(i / TILES_PER_SIDE) * TILE_STEP)
      }))
      blocks.push({ x, z, heights, shades, tiles })
    }
  }
  return blocks
}
