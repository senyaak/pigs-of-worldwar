// Terrain built to order for the phase-002 domain specs: a whole map whose
// elevation is a function and whose tiles are another. Shared by the
// movement, tile-query and locomotion specs — the fixture IS the contract
// those specs talk to the engine through, so it lives once.
//
// The builder itself is the engine's (lib/game/terrainBlocks.ts), because the
// proving ground builds its ground the same way; the fixture only says what a
// spec's map looks like. The domain never reads the shade, and unshaded keeps
// the fixture honest.

import type { TerrainBlock, TerrainTile } from '../src/lib/formats/pmg'
import { TerrainQuery } from '../src/lib/game/terrain'
import { terrainBlocks as buildBlocks } from '../src/lib/game/terrainBlocks'

export { BLOCK_SPAN, MAP_ORIGIN } from '../src/lib/game/terrainBlocks'

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
  return buildBlocks(shape, tile)
}
