// The picture on the map — and it is READ, not invented.
//
// `map1.tim`, MAPICONS' first entry, is a 64×64 scratch surface that
// `afInitScanner` FILLS once per battle (dll 0x1000A35D..0x1000A46C: it locks
// a 64×64 texture surface, writes every texel, and hands it over with
// `afOverwriteTexture`). Per texel, from the library's own 65×65 terrain grid:
//
//     lo    = height - lowestHeight
//     shade = lo * 130 / (highest - lowest) + 64            // 64..194
//     rgb   = PALETTE[flags & 0x1F] * shade >> 9            // 5 bits a channel
//     if (flags & 0x40) rgb = (31, 0, 0)                    // a MINE, solid red
//
// Three things follow that are worth stating plainly.
//
// **The white on it is the ORIGINAL's**, and it was checked when play reported
// it. The clamp is the library's own — `cmp ecx,1Fh / jle / mov ecx,1Fh` on
// each channel in turn (dll 0x1000A3F4..0x1000A40D) — and the channel really
// is five bits: the mine writes 31, not 255. So any palette row over 82 blows
// out at high ground, and row 9 is `100,100,100`: on CAMP, whose boundary
// plateau averages 3087 against 1489 in the middle, the whole rim clamps to
// pure white and the board wears a white frame. Play saw exactly that — "на
// карте мира 4 белые полоски" — and it is what the exe draws.
//
// The SIGN behind that was read rather than assumed (`scanner/notes.md`, four
// independent proofs): `height` is an elevation, positive UP, so shade 64 is
// the map's lowest vertex and 194 its highest — the picture lights the PEAKS.
// Turning it the other way up puts 941 white texels on CAMP instead of 208.
//
// **Mines DO show on the map, as red tiles** — but only the ones already on
// the map when the battle opens, because the texture is written once and never
// rebuilt. A mine a pig lays during play never appears. That is the whole of
// the mine's presence on the map: there is no icon, no class gate and no
// range, and `scanner.ts`'s note about the `bomb` art stands — it is the BOARD
// that carries them, not a marker.
//
// **The texture is laid out transposed** to the way this engine counts: the
// library indexes its grid `i*65 + j` with `i` along world x and `j` along
// world z, and fills texel (column, row) from record `column + 65*row` — so
// the picture's COLUMN runs along world z and its ROW along world x. Kept that
// way here so the drawer can hand the board its corners without a flip.
//
// One thing the library does that this does not: its column 0 is a COPY of
// column 1 (`cmp edi,1 / jne` at 0x1000A431, which writes the texel twice).
// `[gap]`, and a one-texel one.
//
// Pure: blocks in, pixels out.

import { BLOCKS_PER_SIDE, TILES_PER_SIDE, TILE_STEP } from '../formats/pmg'
import type { TerrainBlock } from '../formats/pmg'

/** Tiles across the world, and so pixels across the map. */
export const RASTER_SIZE = BLOCKS_PER_SIDE * TILES_PER_SIDE
/** World units the whole picture spans. */
export const RASTER_WORLD = RASTER_SIZE * TILE_STEP

/**
 * The library's own ground palette, `[0x1002BEB8]`, twelve entries of three
 * dwords. The type is `flags & 0x1F`, which can reach 31; the table has only
 * twelve sane rows and the library clamps nothing, so anything past the end
 * reads adjacent memory there. Here it falls back to the first entry rather
 * than to whatever happens to be next in the array.
 */
export const GROUND_PALETTE: readonly [number, number, number][] = [
  [60, 50, 40],
  [40, 70, 40],
  [128, 128, 128],
  [153, 94, 34],
  [90, 90, 150],
  [50, 50, 50],
  [50, 50, 50],
  [100, 80, 30],
  [180, 240, 240],
  [100, 100, 100],
  [60, 50, 40],
  [240, 100, 53]
]

/** What a mine's tile becomes, in the library's own 5-bit channels. */
export const MINE_TEXEL: [number, number, number] = [31, 0, 0]

/** Shade at the lowest ground, and how much is added by the highest. */
export const SHADE_FLOOR = 64
export const SHADE_RANGE = 130

export interface MapRaster {
  /** Always `RASTER_SIZE`; carried so a drawer never has to import it. */
  size: number
  /** RGBA. COLUMN runs along world z, ROW along world x — see the header. */
  rgba: Uint8Array
}

/** The library works in 5-bit channels; a canvas wants eight. */
const FROM_FIVE = 255 / 31

/**
 * Draw the whole world onto a `RASTER_SIZE` square.
 *
 * The height a texel is shaded by is the tile's own first CORNER, not an
 * average: the library reads record `column + 65*row` for both the height and
 * the flags, and that record is the vertex at the tile's origin.
 */
export function mapRaster(blocks: readonly TerrainBlock[]): MapRaster {
  const rgba = new Uint8Array(RASTER_SIZE * RASTER_SIZE * 4)
  const half = RASTER_WORLD / 2
  const verts = TILES_PER_SIDE + 1

  // The shade needs the whole map's range before any texel can be written,
  // and the library keeps exactly that pair as it loads the ground.
  let lowest = Infinity
  let highest = -Infinity
  for (const block of blocks) {
    for (const height of block.heights) {
      if (height < lowest) lowest = height
      if (height > highest) highest = height
    }
  }
  const span = highest - lowest || 1

  for (const block of blocks) {
    // A block knows where it is in the world, so the raster is filled from
    // that rather than from its place in the array — the parse has already
    // mirrored the file's rows and nothing here should do it twice.
    const blockX = Math.round((block.x + half) / TILE_STEP)
    const blockZ = Math.round((block.z + half) / TILE_STEP)
    for (let r = 0; r < TILES_PER_SIDE; r++) {
      for (let c = 0; c < TILES_PER_SIDE; c++) {
        const tile = block.tiles[r * TILES_PER_SIDE + c]
        const height = block.heights[r * verts + c]
        const shade = Math.floor(((height - lowest) * SHADE_RANGE) / span) + SHADE_FLOOR
        const mined = (tile.type & 0x40) !== 0
        const ground = GROUND_PALETTE[tile.type & 0x1f] ?? GROUND_PALETTE[0]
        // Column runs along world z, row along world x.
        const at = ((blockX + c) * RASTER_SIZE + (blockZ + r)) * 4
        for (let channel = 0; channel < 3; channel++) {
          const five = mined ? MINE_TEXEL[channel] : Math.min(31, (ground[channel] * shade) >> 9)
          rgba[at + channel] = Math.round(five * FROM_FIVE)
        }
        rgba[at + 3] = 255
      }
    }
  }
  return { size: RASTER_SIZE, rgba }
}
