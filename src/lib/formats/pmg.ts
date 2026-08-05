// PMG ground-mesh reader (docs/formats.md). Pure, like the others.
//
// A map is a 16×16 grid of blocks, 368 bytes each: a short header with the
// block's world offsets, a 5×5 grid of vertex heights, and 4×4 tiles that
// each reference a PTG texture with a rotate/flip byte. Block offsets step
// 2048 units (4 tiles × 512), verified on ARCHI.PMG.

export const BLOCK_SIZE = 368
export const BLOCKS_PER_SIDE = 16
export const TILES_PER_SIDE = 4
export const VERTS_PER_SIDE = 5
/** World units between adjacent vertices (one tile edge). */
export const TILE_STEP = 512

/** Tile.type masks (how-doc). */
export const TILE_WATER = 0x20
export const TILE_MINE = 0x40
export const TILE_WALL = 0x80

/**
 * Tile.rotateFlip: bit 0 mirrors the texture, bits 1-2 are a 0..3 quarter-turn
 * COUNT — how-doc's separate "Rotate90" and "Rotate180" are that number's two
 * bits, read straight out of `_d3d.dll!afAdjustMapTile`
 * (`../pigs-disasm/terrain/notes.md`).
 */
export const FLIP_X = 1
export const ROTATE = 6
export const ROTATE_SHIFT = 1

/**
 * The tile's corners as (a, b) — a along +x, b along the PMG row — walked
 * AROUND the quad. The original keeps a tile's four UVs in that ring order
 * and does exactly two things to it: FlipX swaps slots 0↔1 and 2↔3, then
 * each corner takes the UV of the slot `rot` places further round, flip
 * first. All of that is read from the library and is not in doubt.
 */
const RING = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1]
]

/**
 * What IS in doubt: which corner the ring starts at and which way it turns.
 * Eight possibilities, and the maps cannot choose between them — the ground
 * is mostly noise that tiles equally well any way round, and the two data
 * scores in `../pigs-disasm/terrain/` disagree with each other. So the
 * convention is a setting, `buildTerrain` reads `globalThis.powTileUv` for
 * it, and picking by eye against the original is a one-line experiment:
 *
 *     powTileUv = 5      // in the devtools console, then reopen the map
 */
const CONVENTIONS: [number, number][] = [
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [2, 1],
  [2, -1],
  [3, 1],
  [3, -1]
]

/** Current best guess. 0 is what the disassembly reads; 7 is the old fit. */
export const DEFAULT_TILE_UV = 3

/** Where each of `corners` samples the texture, under the tile's byte. */
export function tileUvs(
  rotateFlip: number,
  corners: number[][],
  convention: number = DEFAULT_TILE_UV
): number[][] {
  const [start, turn] = CONVENTIONS[convention] ?? CONVENTIONS[DEFAULT_TILE_UV]
  const order = [0, 1, 2, 3].map((i) => RING[(start + i * turn + 8) % 4])
  const slots = rotateFlip & FLIP_X ? [RING[1], RING[0], RING[3], RING[2]] : RING
  const rot = (rotateFlip & ROTATE) >> ROTATE_SHIFT
  const uvs = new Map(order.map((corner, i) => [String(corner), slots[(i + rot) % 4]]))
  return corners.map((corner) => uvs.get(String(corner)) as number[])
}

export interface TerrainTile {
  /** Index into the sibling PTG's textures. */
  texture: number
  rotateFlip: number
  type: number
  slip: number
}

export interface TerrainBlock {
  /**
   * World position of the block's first vertex — its minimum x and minimum
   * z corner. Derived from the block's PLACE in the file, not from the
   * fields it stores: `Map::Load` (exe 0x4a5635) overwrites both with
   * `(col - 8) * 2048` and `(row - 8) * 2048` before anything reads them.
   * The x it writes agrees with the stored field. The z does not — the file
   * counts z down where the game counts it up — so trusting the file's z
   * puts the whole map back to front, and every asymmetric texture with it.
   * Vertices run +x with the column AND +z with the row.
   */
  x: number
  z: number
  /** 5×5 vertex heights, row-major. */
  heights: Int16Array
  /**
   * 5×5 baked vertex brightness, row-major, 0..255 with 255 unshaded — the
   * ground's lighting, and the reason the original's hills read as round.
   *
   * how-doc calls this "unknown ≤255". Least squares over a whole map's
   * vertex normals says otherwise: brightness ≈ 249·n·(0,1,0) + 5 on ARCHI
   * (R² 0.81) — a light straight overhead with next to no ambient. CAMP fits
   * looser (R² 0.31) because there is baked shadowing on top of the slope
   * term. Neighbouring blocks store identical values on the vertices they
   * share (0 conflicts on every map checked), so the grid is continuous.
   */
  shades: Uint8Array
  /** 4×4 tiles, row-major. */
  tiles: TerrainTile[]
}

export function parsePmg(data: Uint8Array): TerrainBlock[] {
  const expected = BLOCKS_PER_SIDE * BLOCKS_PER_SIDE * BLOCK_SIZE
  if (data.byteLength !== expected) {
    throw new Error(`PMG length ${data.byteLength}, expected ${expected} (16×16 blocks × 368)`)
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const blocks: TerrainBlock[] = []

  for (let block = 0; block < BLOCKS_PER_SIDE * BLOCKS_PER_SIDE; block++) {
    const base = block * BLOCK_SIZE
    // The stored offsets at +0 and +4 are ignored, as the exe ignores them:
    // the block's place in the file IS its place in the world. (+2 is a base
    // height how-doc marks unreliable, +6 unknown; heights are absolute, so
    // neither is needed either.)
    const x = ((block % BLOCKS_PER_SIDE) - BLOCKS_PER_SIDE / 2) * (TILES_PER_SIDE * TILE_STEP)
    const z = (Math.floor(block / BLOCKS_PER_SIDE) - BLOCKS_PER_SIDE / 2) * (TILES_PER_SIDE * TILE_STEP)

    // Four bytes per vertex: s16 height, u8 shade, one always-zero byte.
    const heights = new Int16Array(VERTS_PER_SIDE * VERTS_PER_SIDE)
    const shades = new Uint8Array(heights.length)
    for (let vertex = 0; vertex < heights.length; vertex++) {
      heights[vertex] = view.getInt16(base + 8 + vertex * 4, true)
      shades[vertex] = view.getUint8(base + 8 + vertex * 4 + 2)
    }

    const tiles: TerrainTile[] = []
    const tilesBase = base + 8 + heights.length * 4 + 4
    for (let tile = 0; tile < TILES_PER_SIDE * TILES_PER_SIDE; tile++) {
      const o = tilesBase + tile * 16
      tiles.push({
        type: view.getUint8(o + 6),
        slip: view.getUint8(o + 7),
        rotateFlip: view.getUint8(o + 10),
        texture: view.getUint32(o + 11, true)
      })
    }
    blocks.push({ x, z, heights, shades, tiles })
  }
  return blocks
}
