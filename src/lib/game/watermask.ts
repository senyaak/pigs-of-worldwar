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
// Kind 1 is where the reproduction stops being exact. The library samples
// nine texels of the uploaded surface and calls the point watery only where
// ALL NINE ARE ZERO, and zero should mean the transparent palette entry —
// which no shipped ground texture has, so taken literally the whole mixed
// case would be solid. It plainly is not: making it so let a pig walk out
// over the pond's rim, one tile of water carrying him like a floor. Some
// second conversion path (0x10007f0a, unread) must be putting zeroes in
// that surface. Until it is read, kind 1 falls back to the colour test
// below — learnt from the map's own pure-water art, and the behaviour the
// remake has always had.
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

/** The slice of a decoded texture the mask needs. */
export interface TerrainArt {
  width: number
  height: number
  rgba: Uint8Array
  /** The raw CLUT: the top bit of each word is the verdict. */
  palette: Uint16Array
}

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
 * Build the mask, or null when the map has nothing to answer with.
 * `wet(x, z)` answers for a world point; callers gate it behind the tile's
 * own water flag too (TerrainQuery.isWater does).
 */
export function buildWaterMask(blocks: TerrainBlock[], textures: TerrainArt[]): WaterMask | null {
  const kinds = textures.map((art) => textureKind(art.palette))
  const colours = waterColourSet(blocks, textures)
  if (!kinds.includes(WATER_KIND) && colours.size === 0) return null
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
