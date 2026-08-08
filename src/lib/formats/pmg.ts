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
 * (`terrain/notes.md`).
 */
export const FLIP_X = 1
export const ROTATE = 6
export const ROTATE_SHIFT = 1

/**
 * The tile's corners as (a, b) — a along +x with the column, b along +z with
 * the row — walked AROUND the quad. That ring is how the original keeps a
 * tile's four UVs (`_d3d.dll` stores them u0..u3 then v0..v3 with
 * u = min,max,max,min against v = min,min,max,max), and it is also the
 * texture's own corner ring, because an unturned tile pairs the two off one
 * to one: `afSetMap` puts record +65 at x+512 and record +1 at z-512, and
 * the ground's draw loop hands UV slots 1,2,3,0 to records i+66, i+65, i,
 * i+1 — which lands slot 0, the texture's top-left, on the tile's (0, 0).
 */
const RING = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1]
]

/**
 * Where each of `corners` samples the tile's texture, under its byte.
 *
 * The original does exactly two things to the ring and nothing else
 * (`_d3d.dll` 0x10001000): FlipX swaps ring slots 0↔1 and 2↔3, then the turn
 * shifts which slot each corner takes. The flip runs FIRST — its block sits
 * above the rotation's jump table and both work in place. V is the texture
 * ROW, top-down; the page blit (0x10007210) copies the TIM straight.
 *
 * The shift runs BACKWARD round the ring, and that sign is the one thing
 * here measured rather than read. 0x100010f2 reads as `slot i takes slot
 * i+1`, and composing it forward through afSetMap and the draw loop gives
 * the opposite of what the shipped maps show: over 883 steep tiles on eight
 * maps, a one-sided wall texture agrees with the slope under it at -0.18 for
 * the half-turn — which is its own opposite and so cannot be got wrong — and
 * the quarter-turns only match that sign with the shift reversed
 * (`terrain/turn.js`). A reversal enters somewhere between
 * that instruction and this function and has not been found; until it is,
 * the maps win over my reading of them.
 *
 * Derivation, address by address: `terrain/notes.md`.
 */
export function tileUvs(rotateFlip: number, corners: number[][]): number[][] {
  const slots = rotateFlip & FLIP_X ? [RING[1], RING[0], RING[3], RING[2]] : RING
  const rot = (rotateFlip & ROTATE) >> ROTATE_SHIFT
  const uvs = new Map(RING.map((corner, i) => [String(corner), slots[((i - rot) % 4 + 4) % 4]]))
  // `turn.js` scored the table above in the FILE's index space, where b runs
  // with the file's row. The parse now reverses that row (a file row runs
  // −z, see TerrainBlock.z), so `corners` arrive in the mirrored space and
  // the lookup mirrors b to meet them. Same table, same pinned bytes — the
  // measurement is a claim about texture-against-slope and both mirror
  // together, so it is untouched by the world flipping.
  //
  // Worth recording where that leaves the flip nobody has found: composed
  // this way the result is the DLL's own FORWARD shift with the texture's v
  // complemented — so the odd flip now sits on v, the ordinary top-down /
  // bottom-up texture convention, rather than on the direction of a turn.
  // That is a likelier place for a real bug in the TIM → page path, and it
  // is where to look next.
  return corners.map((corner) => uvs.get(String([corner[0], 1 - corner[1]])) as number[])
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
   * fields it stores: `Map::Load` (exe 0x4a5635) overwrites both before
   * anything reads them. The x is `(col - 8) * 2048` and agrees with the
   * stored field.
   *
   * **A FILE ROW RUNS −z, and the row order is reversed here so that it
   * does.** Two sites in the original say so and neither reads the field
   * `Map::Load` writes:
   *
   * - `Map::SampleHeight` (exe 0x4a5140) takes `row = (−z + 0x4000) >> 9` —
   *   row 0 is at z = +16384 and the LAST row at −16384;
   * - `afSetMap` (dll 0x100024c0) fills the render grid with its source
   *   pointer starting one row PAST the end of the cell array and stepping
   *   −0x500 (one row) per iteration, while the z it writes into the vertex
   *   climbs from −16384 in +512 steps. Same answer, in the renderer.
   *
   * Counting z up with the row instead builds the whole world mirrored —
   * which hides completely, because mesh, collision, props and spawns all
   * mirror together and nothing internal can tell. It is visible only
   * against the original, and play says plainly that our maps came out the
   * wrong way round.
   *
   * So the parse emits block row `15 − R` with its vertex rows reversed
   * (`4 − r`) and its tile rows with them (`3 − r`), which puts every vertex
   * at the z `SampleHeight` would give it and leaves EVERY consumer with the
   * simple rule it already had: vertices run +x with the column and +z with
   * the row.
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
    // A file row runs −z (see TerrainBlock.z): mirror the row here, once, and
    // every consumer downstream keeps counting z up with the row.
    const fileRow = Math.floor(block / BLOCKS_PER_SIDE)
    const z = (BLOCKS_PER_SIDE - 1 - fileRow - BLOCKS_PER_SIDE / 2) * (TILES_PER_SIDE * TILE_STEP)

    // Four bytes per vertex: s16 height, u8 shade, one always-zero byte.
    // Vertex rows come out reversed with the block: row 4 − r of the file is
    // row r here, which is what keeps a block's shared edge on the edge its
    // neighbour now shares.
    const heights = new Int16Array(VERTS_PER_SIDE * VERTS_PER_SIDE)
    const shades = new Uint8Array(heights.length)
    for (let r = 0; r < VERTS_PER_SIDE; r++) {
      for (let c = 0; c < VERTS_PER_SIDE; c++) {
        const from = base + 8 + ((VERTS_PER_SIDE - 1 - r) * VERTS_PER_SIDE + c) * 4
        heights[r * VERTS_PER_SIDE + c] = view.getInt16(from, true)
        shades[r * VERTS_PER_SIDE + c] = view.getUint8(from + 2)
      }
    }

    const tiles: TerrainTile[] = []
    const tilesBase = base + 8 + heights.length * 4 + 4
    for (let r = 0; r < TILES_PER_SIDE; r++) {
      for (let c = 0; c < TILES_PER_SIDE; c++) {
        const o = tilesBase + ((TILES_PER_SIDE - 1 - r) * TILES_PER_SIDE + c) * 16
        tiles.push({
          type: view.getUint8(o + 6),
          slip: view.getUint8(o + 7),
          rotateFlip: view.getUint8(o + 10),
          texture: view.getUint32(o + 11, true)
        })
      }
    }
    blocks.push({ x, z, heights, shades, tiles })
  }
  return blocks
}
