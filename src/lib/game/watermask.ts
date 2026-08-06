// The water mask — the domain side of `afIsPointWatery` (_d3d.dll
// 0x10010210), which the exe reaches through `Map::IsInWater` (0x4a6fa0)
// once the tile's water flag has passed. The flag is only a PREFILTER; the
// verdict comes from the ART. Pure: blocks and decoded textures in, a
// lookup out.
//
// **Water is art the artist made SEE-THROUGH.** Before uploading a ground
// texture the library walks its CLUT once (0x10007b6c) and classifies the
// whole palette by the PSX semi-transparency bit, 0x8000, ignoring the
// transparent 0x0000 entry:
//
//   every colour translucent -> kind 2  water, and no texel is ever read
//   no colour translucent    -> kind 0  solid
//   a mix                    -> kind 1  read the texels
//
// and `afIsPointWatery` answers off that kind, reaching for the art only in
// the mixed case. So the shape of the answer is:
//
//   kind 2 -> water, the whole tile, no texel read
//   kind 0 -> solid, the whole tile
//   kind 1 -> ask the texels, one point at a time
//
// which is what separates ICE from water AND still puts a shoreline inside
// its tile. A frozen channel and the pond beside it are both water-flagged;
// the pond's middle is kind 2 and swims outright, while the rim and the ice
// are kind 1 and answer per texel. On CAMP that is 80 tiles of 44/45/46
// against 30 of 50 and 52-57.
//
// And the texel test is the SAME bit, one pixel down. The shipped shore art
// says so plainly: an open-water texture carries sixteen translucent
// colours, while a shore texture splits its palette — six to ten
// translucent, six to ten opaque — and paints the water half of the tile in
// the first and the bank in the second (31-80% of its texels translucent).
// So a texel is water exactly when ITS colour carries 0x8000, and the three
// kinds are only the fast path for "all", "none" and "some" of them.
//
// The library's own probe compares the uploaded texel against ZERO, which
// on this art can only be the transparent entry — so the conversion that
// writes its surface must put translucent colours there as zero, and that
// step (past 0x10007f0a) is the one thing here still unread. The rule
// below is the same test taken from the TIM instead, which needs no
// guessing: no learnt colours, no thresholds.
//
// Derivation and per-map counts: ../../../pigs-disasm/movement/notes.md,
// ../../../pigs-disasm/terrain/watery.js.

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

/** The slice of a decoded texture the mask needs: which colour every texel
 * wears, and whether that colour is translucent. */
export interface TerrainArt {
  width: number
  height: number
  rgba: Uint8Array
  palette: Uint16Array
  indices: Uint8Array
}

/** The PSX semi-transparency bit — water is painted in colours that carry
 * it, land in colours that do not. */
export const TRANSLUCENT = 0x8000

/** Is the texel at `i` painted in a water colour? */
export const texelIsWater = (art: TerrainArt, i: number): boolean =>
  ((art.palette[art.indices[i]] ?? 0) & TRANSLUCENT) !== 0

/** Water, solid, or "read the texels" — the library's own classification of
 * a palette (dll 0x10007b6c). The transparent entry votes for nothing. */
export function textureKind(palette: Uint16Array): 0 | 1 | 2 {
  let translucent = false
  let solid = false
  for (const colour of palette) {
    if (colour === 0) continue
    if ((colour & 0x8000) !== 0) translucent = true
    else solid = true
  }
  return solid ? (translucent ? 1 : 0) : 2
}

/** The kind that swims outright, and the one that stands outright; the
 * third (1) is the mixed art a shoreline is painted on. */
export const WATER_KIND = 2
export const SOLID_KIND = 0

const SIDE = BLOCKS_PER_SIDE * TILES_PER_SIDE
/** The tile's corners in (a, b) ring order, as the renderer builds them. */
const TILE_CORNERS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1]
]

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
 * Build the mask, or null when the map has nothing to answer with.
 * `wet(x, z)` answers for a world point; callers gate it behind the tile's
 * own water flag too (TerrainQuery.isWater does).
 */
export function buildWaterMask(blocks: TerrainBlock[], textures: TerrainArt[]): WaterMask | null {
  const kinds = textures.map((art) => textureKind(art.palette))
  if (kinds.every((kind) => kind === SOLID_KIND)) return null
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
    return texelIsWater(art, texY * art.width + texX)
  }
  return {
    wet(x: number, z: number): boolean {
      const row = Math.floor((z - minZ) / TILE_STEP)
      const col = Math.floor((x - minX) / TILE_STEP)
      const cell = cells[row]?.[col]
      if (!cell || !cell.water) return false
      const art = textures[cell.texture]
      // An unknown texture is water: the flag already said so, and a map
      // whose art failed to load should not turn its lake into a floor.
      if (!art) return true
      const kind = kinds[cell.texture]
      if (kind === WATER_KIND) return true
      if (kind === SOLID_KIND) return false
      // Mixed: all nine probes, clamped to the tile's own box as the
      // original clamps to its mask cell.
      for (const [dx, dz] of PROBES) {
        const tx = Math.max(0, Math.min(0.999, (x + dx - minX) / TILE_STEP - col))
        const tz = Math.max(0, Math.min(0.999, (z + dz - minZ) / TILE_STEP - row))
        if (!texelWet(cell, art, tx, tz)) return false
      }
      return true
    }
  }
}
