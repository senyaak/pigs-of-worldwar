// The picture on the map: one pixel per tile, 64×64 for the whole world.
//
// **The size is not a choice.** The plate the original hangs the map on
// (`chars\top.mad`) puts ONE 64×64 texture on its top face — `map1.tim`,
// MAPICONS' first entry — against a world that is 64×64 tiles, and the whole
// of it comes to about 126 screen pixels at the scanner's resting scale
// (lib/game/scanner.ts). So a tile is a texel and a texel is two pixels.
//
// **What goes IN each texel is ours.** `map1.tim` as it ships is not a
// picture of any level: its sixteen indices were matched against the tile
// types of all fifty-nine shipped maps and the best a type-to-index reading
// does is 0.41 of the grid, i.e. nothing. It is a scratch surface the
// library fills, and `DrawScanner`'s own fill loop (dll 0x10009B40..0x10009E7F)
// was not decoded — it reads the terrain out of `[0x11AFAA38]` and builds a
// turned grid, and that is as far as the read got. So the colours here are
// the remake's own: the tile's own ground texture averaged down to one pixel,
// dimmed by the light the map already bakes into its corners.
//
// `[CHECK — remake]` — the LOOK, not the size or the placement.
//
// Pure: blocks and textures in, pixels out.

import { BLOCKS_PER_SIDE, TILES_PER_SIDE, TILE_STEP } from '../formats/pmg'
import type { TerrainBlock } from '../formats/pmg'
import type { Tim } from '../formats/tim'

/** Tiles across the world, and so pixels across the map. */
export const RASTER_SIZE = BLOCKS_PER_SIDE * TILES_PER_SIDE
/** World units the whole picture spans. */
export const RASTER_WORLD = RASTER_SIZE * TILE_STEP

export interface MapRaster {
  /** Always `RASTER_SIZE`; carried so a drawer never has to import it. */
  size: number
  /** RGBA, row 0 at the world's most NEGATIVE z, column 0 at its most negative x. */
  rgba: Uint8Array
}

/**
 * One texture boiled down to one colour: the mean of every pixel that is not
 * the transparent index. `parseTim` has already put colour 0 at alpha 0, so
 * the alpha byte is the whole test.
 */
function meanColour(tim: Tim): [number, number, number] {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let at = 0; at < tim.rgba.length; at += 4) {
    if (tim.rgba[at + 3] === 0) continue
    r += tim.rgba[at]
    g += tim.rgba[at + 1]
    b += tim.rgba[at + 2]
    n++
  }
  if (n === 0) return [0, 0, 0]
  return [r / n, g / n, b / n]
}

/**
 * Draw the whole world onto a `RASTER_SIZE` square.
 *
 * The shade is the mean of the tile's four corner brightnesses — the same
 * baked vertex light the ground mesh uses, which is what makes the hills read
 * on a picture with no relief of its own (lib/formats/pmg.ts).
 */
export function mapRaster(blocks: readonly TerrainBlock[], textures: readonly Tim[]): MapRaster {
  const rgba = new Uint8Array(RASTER_SIZE * RASTER_SIZE * 4)
  // One average per texture rather than per tile: a map has some four
  // thousand tiles and a couple of hundred textures.
  const means = new Map<number, [number, number, number]>()
  const half = (BLOCKS_PER_SIDE * TILES_PER_SIDE * TILE_STEP) / 2
  const verts = TILES_PER_SIDE + 1

  for (const block of blocks) {
    // A block knows where it is in the world, so the raster is filled from
    // that rather than from its place in the array — the parse has already
    // mirrored the file's rows and nothing here should do it twice.
    const blockX = Math.round((block.x + half) / TILE_STEP)
    const blockZ = Math.round((block.z + half) / TILE_STEP)
    for (let r = 0; r < TILES_PER_SIDE; r++) {
      for (let c = 0; c < TILES_PER_SIDE; c++) {
        const tile = block.tiles[r * TILES_PER_SIDE + c]
        let mean = means.get(tile.texture)
        if (!mean) {
          const tim = textures[tile.texture]
          mean = tim ? meanColour(tim) : [0, 0, 0]
          means.set(tile.texture, mean)
        }
        const shade =
          (block.shades[r * verts + c] +
            block.shades[r * verts + c + 1] +
            block.shades[(r + 1) * verts + c] +
            block.shades[(r + 1) * verts + c + 1]) /
          (4 * 255)
        const at = ((blockZ + r) * RASTER_SIZE + (blockX + c)) * 4
        rgba[at] = Math.min(255, Math.round(mean[0] * shade))
        rgba[at + 1] = Math.min(255, Math.round(mean[1] * shade))
        rgba[at + 2] = Math.min(255, Math.round(mean[2] * shade))
        rgba[at + 3] = 255
      }
    }
  }
  return { size: RASTER_SIZE, rgba }
}
