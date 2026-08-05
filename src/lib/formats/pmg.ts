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

/** Tile.rotateFlip flags (how-doc). */
export const FLIP_X = 1
export const ROTATE_90 = 2
export const ROTATE_180 = 4

export interface TerrainTile {
  /** Index into the sibling PTG's textures. */
  texture: number
  rotateFlip: number
  type: number
  slip: number
}

export interface TerrainBlock {
  /** World offset of the block's first vertex. */
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
    const x = view.getInt16(base, true)
    // +2 is a base height how-doc marks unreliable; +6 unknown. Heights are
    // absolute, so neither is needed.
    const z = view.getInt16(base + 4, true)

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
