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
// and `afIsPointWatery` answers straight off that kind. Its texel path —
// nine probes, each a raw 16-bit sample, watery only where ALL NINE ARE
// ZERO — survives for kind 1, but zero can only come from a 0x0000 palette
// entry (the upload lifts non-transparent black off zero on purpose,
// 0x100078a5) and no shipped ground texture has one. So kind 1 is solid in
// practice, and the whole rule is:
//
//   swim  <=>  water flag  AND  the tile's texture is kind 2
//
// per tile. THAT is what separates ICE from water: a frozen channel and the
// pond beside it are both water-flagged, and the ice is opaque art you walk
// on while the pond is translucent art you swim in. On CAMP the pond wears
// textures 44/45/46 (kind 2, 80 tiles) and the channel 50/52-57 (kind 1, 30
// tiles); every shipped map rings a handful of translucent water textures
// with opaque ones, which is also why no island is smaller than a tile.
//
// The colour set below no longer decides anything — the renderer still cuts
// its shore masks with it. Derivation and per-map counts:
// ../../../pigs-disasm/movement/notes.md, ../../../pigs-disasm/terrain/watery.js.

import { BLOCKS_PER_SIDE, TILES_PER_SIDE, TILE_STEP, TILE_WATER } from '../formats/pmg'
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

/** The kind that swims. */
export const WATER_KIND = 2

const SIDE = BLOCKS_PER_SIDE * TILES_PER_SIDE

const packColour = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b

interface Cell {
  texture: number
  water: boolean
}

function cellGrid(blocks: TerrainBlock[]): { cells: Cell[][]; minX: number; minZ: number } {
  const minX = Math.min(...blocks.map((b) => b.x))
  const minZ = Math.min(...blocks.map((b) => b.z))
  const cells: Cell[][] = Array.from({ length: SIDE }, () =>
    Array.from({ length: SIDE }, () => ({ texture: -1, water: false }))
  )
  for (const block of blocks) {
    const colBase = Math.round((block.x - minX) / TILE_STEP)
    const rowBase = Math.round((block.z - minZ) / TILE_STEP)
    for (let tile = 0; tile < block.tiles.length; tile++) {
      const t = block.tiles[tile]
      cells[rowBase + Math.floor(tile / TILES_PER_SIDE)][colBase + (tile % TILES_PER_SIDE)] = {
        texture: t.texture,
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
 * Build the mask, or null when the map has no water art at all. `wet(x, z)`
 * answers for a world point; callers gate it behind the tile's own water
 * flag too (TerrainQuery.isWater does).
 *
 * There is no probing here, and the original's nine offsets are not missing
 * so much as unreachable: they are all clamped inside the tile's OWN cell
 * (dll 0x100103aa), so against a verdict that cannot vary within a tile
 * every one of them lands on the same answer.
 */
export function buildWaterMask(blocks: TerrainBlock[], textures: TerrainArt[]): WaterMask | null {
  const kinds = textures.map((art) => textureKind(art.palette))
  if (!kinds.includes(WATER_KIND)) return null
  const { cells, minX, minZ } = cellGrid(blocks)
  return {
    wet(x: number, z: number): boolean {
      const row = Math.floor((z - minZ) / TILE_STEP)
      const col = Math.floor((x - minX) / TILE_STEP)
      const cell = cells[row]?.[col]
      if (!cell || !cell.water) return false
      // An unknown texture is water: the flag already said so, and a map
      // whose art failed to load should not turn its lake into a floor.
      return (kinds[cell.texture] ?? WATER_KIND) === WATER_KIND
    }
  }
}
