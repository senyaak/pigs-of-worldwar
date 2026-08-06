// The per-texel water mask — the domain side of `afIsPointWatery`
// (_d3d.dll 0x10010210): the water flag on a tile is only a PREFILTER, the
// verdict comes from the ART — a point is in the water where the texel
// under it is a water colour, so a pig stands on the painted dry half of a
// shore tile and swims one step further on. Pure: blocks and decoded
// texture pixels in, a lookup out.
//
// What counts as a water colour is learnt from the map itself, the same
// way the renderer cuts its shore masks: the textures the deep interior
// wears (every one of the eight neighbours water too) are pure water, and
// their texel colours are the set. One shared palette family per map
// (CAMP: fourteen colours across the whole pond) is why membership works
// and thresholds do not — see ../../../pigs-disasm/movement/notes.md.

import {
  BLOCKS_PER_SIDE,
  TILES_PER_SIDE,
  TILE_STEP,
  TILE_WATER,
  tileUvs
} from '../formats/pmg'
import type { TerrainBlock } from '../formats/pmg'
import { CLIMBING_TILE } from './terrain'
import type { WaterMask } from './terrain'

/** The slice of a decoded texture the mask needs. */
export interface TerrainArt {
  width: number
  height: number
  rgba: Uint8Array
}

const SIDE = BLOCKS_PER_SIDE * TILES_PER_SIDE
/** The tile's corners in (a, b) ring order, as the renderer builds them. */
const TILE_CORNERS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1]
]

const packColour = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b

interface Cell {
  texture: number
  rotateFlip: number
  water: boolean
}

function cellGrid(blocks: TerrainBlock[]): { cells: Cell[][]; minX: number; minZ: number } {
  const minX = Math.min(...blocks.map((b) => b.x))
  const minZ = Math.min(...blocks.map((b) => b.z))
  const cells: Cell[][] = Array.from({ length: SIDE }, () =>
    Array.from({ length: SIDE }, () => ({ texture: -1, rotateFlip: 0, water: false }))
  )
  for (const block of blocks) {
    const colBase = Math.round((block.x - minX) / TILE_STEP)
    const rowBase = Math.round((block.z - minZ) / TILE_STEP)
    for (let tile = 0; tile < block.tiles.length; tile++) {
      const t = block.tiles[tile]
      cells[rowBase + Math.floor(tile / TILES_PER_SIDE)][colBase + (tile % TILES_PER_SIDE)] = {
        texture: t.texture,
        rotateFlip: t.rotateFlip,
        water: (t.type & TILE_WATER) !== 0 && (t.type & 0x1f) !== CLIMBING_TILE
      }
    }
  }
  return { cells, minX, minZ }
}

/**
 * Every distinct texel colour of the map's PURE water art — the textures
 * worn where all eight neighbours are water too. Falls back to every
 * water tile's texture on maps whose ponds are too small for an interior.
 * Empty when the map is dry or the textures are missing.
 */
export function waterColourSet(blocks: TerrainBlock[], textures: TerrainArt[]): Set<number> {
  const { cells } = cellGrid(blocks)
  const pure = new Set<number>()
  const any = new Set<number>()
  for (let row = 0; row < SIDE; row++) {
    for (let col = 0; col < SIDE; col++) {
      if (!cells[row][col].water) continue
      any.add(cells[row][col].texture)
      let interior = true
      for (let dr = -1; dr <= 1 && interior; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!(cells[row + dr]?.[col + dc]?.water ?? false)) {
            interior = false
            break
          }
        }
      }
      if (interior) pure.add(cells[row][col].texture)
    }
  }
  const source = pure.size > 0 ? pure : any
  const colours = new Set<number>()
  for (const id of source) {
    const art = textures[id]
    if (!art) continue
    for (let i = 0; i < art.rgba.length; i += 4) {
      if (art.rgba[i + 3] === 0) continue
      colours.add(packColour(art.rgba[i], art.rgba[i + 1], art.rgba[i + 2]))
    }
  }
  return colours
}

/**
 * The pig's FOOTPRINT, not a point: the original's `afIsPointWatery`
 * probes NINE spots — the centre and a ring — from its offset table at
 * dll 0x1002c6a0, in mask pixels of 512/32 = 16 world units, and only if
 * every one is water does the point count as wet. That is what keeps a
 * pig from plunging into a single watery texel crack.
 */
const PROBES = [
  [0, 0],
  [0, -4],
  [3, -3],
  [4, 0],
  [3, 3],
  [0, 4],
  [-3, 3],
  [-4, 0],
  [-3, -3]
].map(([dx, dz]) => [dx * (TILE_STEP / 32), dz * (TILE_STEP / 32)])

/**
 * Build the mask, or null when the map has no water art to learn from.
 * `wet(x, z)` answers for a world point; callers gate it behind the tile's
 * own water flag (TerrainQuery.isWater does).
 */
export function buildWaterMask(blocks: TerrainBlock[], textures: TerrainArt[]): WaterMask | null {
  const colours = waterColourSet(blocks, textures)
  if (colours.size === 0) return null
  const { cells, minX, minZ } = cellGrid(blocks)
  // One texel, through the tile's rotate/flip the same way the renderer
  // lays the texture down: the corner ring's UVs are an affine map, so
  // interpolating them lands the world point on the very texel drawn there.
  const texelWet = (cell: Cell, art: TerrainArt, tx: number, tz: number): boolean => {
    const [uv00, uv10, uv01] = tileUvs(cell.rotateFlip, TILE_CORNERS)
    const u = uv00[0] + (uv10[0] - uv00[0]) * tx + (uv01[0] - uv00[0]) * tz
    const v = uv00[1] + (uv10[1] - uv00[1]) * tx + (uv01[1] - uv00[1]) * tz
    const texX = Math.max(0, Math.min(art.width - 1, Math.floor(u * art.width)))
    const texY = Math.max(0, Math.min(art.height - 1, Math.floor(v * art.height)))
    const i = (texY * art.width + texX) * 4
    if (art.rgba[i + 3] === 0) return true
    return colours.has(packColour(art.rgba[i], art.rgba[i + 1], art.rgba[i + 2]))
  }
  return {
    wet(x: number, z: number): boolean {
      const row = Math.floor((z - minZ) / TILE_STEP)
      const col = Math.floor((x - minX) / TILE_STEP)
      const cell = cells[row]?.[col]
      if (!cell) return false
      if (!cell.water) return false
      const art = textures[cell.texture]
      if (!art) return true
      // All nine probes, clamped to the tile's own box as the original
      // clamps to its mask cell.
      for (const [dx, dz] of PROBES) {
        const tx = Math.max(0, Math.min(0.999, (x + dx - minX) / TILE_STEP - col))
        const tz = Math.max(0, Math.min(0.999, (z + dz - minZ) / TILE_STEP - row))
        if (!texelWet(cell, art, tx, tz)) return false
      }
      return true
    }
  }
}
