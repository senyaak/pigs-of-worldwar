// Terrain queries for the game: ground height at a world position and spawn
// picking. Pure — works on the parsed PMG blocks (lib/formats/pmg.ts).

import { BLOCKS_PER_SIDE, TILES_PER_SIDE, TILE_MINE, TILE_STEP, TILE_WALL, TILE_WATER, VERTS_PER_SIDE } from '../formats/pmg'
import type { TerrainBlock, TerrainTile } from '../formats/pmg'
import type { PigSpawn } from './game'

const BLOCK_SPAN = TILES_PER_SIDE * TILE_STEP

/**
 * How tall the world is, per unit of stored PMG height.
 *
 * The exe doubles: `Map::SampleHeight` ends in `shl eax,1`,
 * `afAdjustMapHeights` in `Data/_d3d.dll` doubles again when it builds the
 * visible mesh, the map's own bounds are stored doubled, and the PMG loader
 * (0x4a5250) copies the int16 across untouched — so nothing halves it first.
 * Three sites, all checked.
 *
 * And yet a doubled CAMP plays as a mountain range: median slope 26.6°
 * against 14° at 1x, and it reads as stretched next to the original. The
 * remaster's yardstick is the original's look, so 1x it is, and the exe
 * finding stays written down in `movement/notes.md` with the
 * contradiction unresolved rather than quietly dropped.
 *
 * A candidate for what resolves it exists and has been CHECKED IN PLAY at
 * half model scale: it still breaks the map. Do not raise it again without
 * being asked to. The candidate is: the engine draws every body at half size
 * (`lib/game/scale.ts`), so the "reads as stretched" judgement was made
 * against models twice the size they should be. Halved models plus doubled
 * heights would stand a pig four times smaller against the relief. That
 * changes the TERRAIN, which is a separate decision from the models, and it
 * is deliberately not taken.
 *
 * Everything horizontal — the 512 tile, the world limits — is unaffected.
 */
export const HEIGHT_SCALE = 1

/**
 * A vertical constant lifted from the exe, in OUR world. The exe's own
 * numbers are in its doubled space, so they follow HEIGHT_SCALE: change the
 * scale above and step-downs, standable relief and the rest keep meaning the
 * same thing about the same terrain.
 */
export const fromExeY = (units: number): number => (units * HEIGHT_SCALE) / 2

/**
 * The terrain type a pig scrambles up. `UpdateGroundState` raises a flag
 * when the pig stands on it (`cmp ecx,0bh; or [esi+3a4h],8`, exe 0x4700d9)
 * and the animation picker (0x467ec0) then plays the Scramble clip instead
 * of the run cycle. It is also the grippiest entry in the material table —
 * friction 0.90 against 0.10 for the slipperiest.
 */
export const CLIMBING_TILE = 11

/** The world limit a pig's position is clamped to (exe 0x3000). */
export const WORLD_LIMIT = 12288

/** The per-texel water verdict — see lib/game/watermask. */
export interface WaterMask {
  wet(x: number, z: number): boolean
}

/** (x, z) brought inside the world limits — the edge of the map holds
 * whatever a pig is doing, walking or flying. */
export const clampToWorld = (x: number, z: number): { x: number; z: number } => ({
  x: Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, x)),
  z: Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, z))
})

const clampIndex = (value: number, last: number): number => Math.max(0, Math.min(value, last))

/**
 * The map's water level, in elevation units (up-positive, HEIGHT_SCALE
 * applied), or null on a dry map.
 *
 * The exe FITS it at load ("Setting Water Level.", 0x451c10): a binary
 * search over the vertex grid for the height that submerges about as many
 * tiles as carry the water flag, after which "Flattening water level: "
 * RAISES every vertex below it to exactly it (0x451d0c) — the water surface
 * the player sees IS the ground mesh, clamped. On every shipped map the
 * mapmakers already authored the water area flat at one height with only
 * scattered dips below (128 stored units on CAMP, ARCHI, BAY, ARTGUN…), so
 * the level that search finds is simply the height most of the water-tile
 * corners sit at — which is what is computed here, exactly and cheaply:
 * the MODE of the water-tile corner heights, ties to the lower.
 */
export function fitWaterElevation(blocks: TerrainBlock[]): number | null {
  const counts = new Map<number, number>()
  for (const block of blocks) {
    for (let tile = 0; tile < block.tiles.length; tile++) {
      if ((block.tiles[tile].type & TILE_WATER) === 0) continue
      const row = Math.floor(tile / TILES_PER_SIDE)
      const col = tile % TILES_PER_SIDE
      for (const [r, c] of [[row, col], [row, col + 1], [row + 1, col], [row + 1, col + 1]]) {
        const h = block.heights[r * VERTS_PER_SIDE + c]
        counts.set(h, (counts.get(h) ?? 0) + 1)
      }
    }
  }
  let level: number | null = null
  let best = 0
  for (const [h, n] of counts) {
    if (n > best || (n === best && level !== null && h < level)) {
      level = h
      best = n
    }
  }
  return level === null ? null : level * HEIGHT_SCALE
}

/**
 * Is this tile OPEN WATER — not drawn as ground at all, the translucent
 * water sheet showing in its place?
 *
 * The original decides by texture: the ground batcher skips every tile
 * whose texture the load-time analysis classed fully watery (kind 2 in the
 * table at dll 0x1004cfa0, tested at 0x10003892/0x10003b3d), and draws the
 * animated water grid where the ground now is not. The texel analysis is
 * not reproduced; the stand-in classes a tile open water when it CARRIES
 * the water flag and LIES at or under the water level — which is what a
 * fully-watery texture sits on — and never for the climbing type, whose
 * mud banks are land whatever the flag says.
 */
export function isOpenWaterTile(
  block: TerrainBlock,
  tileIndex: number,
  waterElevation: number | null
): boolean {
  if (waterElevation === null) return false
  const tile = block.tiles[tileIndex]
  if ((tile.type & TILE_WATER) === 0) return false
  if ((tile.type & 0x1f) === CLIMBING_TILE) return false
  const row = Math.floor(tileIndex / TILES_PER_SIDE)
  const col = tileIndex % TILES_PER_SIDE
  for (const [r, c] of [[row, col], [row, col + 1], [row + 1, col], [row + 1, col + 1]]) {
    if (block.heights[r * VERTS_PER_SIDE + c] * HEIGHT_SCALE > waterElevation) return false
  }
  return true
}

/**
 * The water level of each map cell's WATER REGION, `[row][col]` over the
 * 64×64 tiles, in elevation units — null where there is no water region.
 *
 * A map's water is not one pool: CAMP keeps a raised channel a full 544
 * units above its pond, and one global level either floods the channel's
 * banks or drops its surface underground. The exe knows this — its
 * "Fitting water." pass (0x451b20) flood-fills water regions and scans
 * their JOINS — so the levels here are fitted the same way, per connected
 * region of water-flagged tiles: each region's level is the mode of ITS
 * corner heights, ties to the lower.
 */
export function waterLevelGrid(blocks: TerrainBlock[]): (number | null)[][] {
  const side = BLOCKS_PER_SIDE * TILES_PER_SIDE
  const minX = Math.min(...blocks.map((b) => b.x))
  const minZ = Math.min(...blocks.map((b) => b.z))
  const wet: boolean[][] = Array.from({ length: side }, () => Array(side).fill(false))
  const corners: Int16Array[][] = Array.from({ length: side }, () => Array(side))
  for (const block of blocks) {
    const colBase = Math.round((block.x - minX) / TILE_STEP)
    const rowBase = Math.round((block.z - minZ) / TILE_STEP)
    for (let tile = 0; tile < block.tiles.length; tile++) {
      const type = block.tiles[tile].type
      if ((type & TILE_WATER) === 0 || (type & 0x1f) === CLIMBING_TILE) continue
      const row = rowBase + Math.floor(tile / TILES_PER_SIDE)
      const col = colBase + (tile % TILES_PER_SIDE)
      wet[row][col] = true
      const tr = Math.floor(tile / TILES_PER_SIDE)
      const tc = tile % TILES_PER_SIDE
      corners[row][col] = Int16Array.from(
        [[tr, tc], [tr, tc + 1], [tr + 1, tc], [tr + 1, tc + 1]],
        ([r, c]) => block.heights[r * VERTS_PER_SIDE + c]
      )
    }
  }
  const levels: (number | null)[][] = Array.from({ length: side }, () => Array(side).fill(null))
  const seen: boolean[][] = Array.from({ length: side }, () => Array(side).fill(false))
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      if (!wet[row][col] || seen[row][col]) continue
      // Flood one region (4-connected), collecting its corner histogram.
      const cells: [number, number][] = []
      const stack: [number, number][] = [[row, col]]
      seen[row][col] = true
      const counts = new Map<number, number>()
      while (stack.length > 0) {
        const [r, c] = stack.pop() as [number, number]
        cells.push([r, c])
        for (const h of corners[r][c]) counts.set(h, (counts.get(h) ?? 0) + 1)
        for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
          if (wet[nr]?.[nc] && !seen[nr]?.[nc]) {
            seen[nr][nc] = true
            stack.push([nr, nc])
          }
        }
      }
      let level = 0
      let best = 0
      for (const [h, n] of counts) {
        if (n > best || (n === best && h < level)) {
          level = h
          best = n
        }
      }
      for (const [r, c] of cells) levels[r][c] = level * HEIGHT_SCALE
    }
  }
  return levels
}

/**
 * Which tiles of the whole map are open water — where the animated water
 * surface lives — as a map-grid boolean mask, `[row][col]` over the 64×64
 * tiles, each cell judged against ITS OWN region's level. The shore is NOT
 * excluded: the original runs its water right up to the shoreline and lets
 * the shore tiles' art MASK it — their watery texels are see-through.
 */
export function openWaterMask(blocks: TerrainBlock[]): boolean[][] {
  const levels = waterLevelGrid(blocks)
  const side = BLOCKS_PER_SIDE * TILES_PER_SIDE
  const open: boolean[][] = Array.from({ length: side }, () => Array(side).fill(false))
  const minX = Math.min(...blocks.map((b) => b.x))
  const minZ = Math.min(...blocks.map((b) => b.z))
  for (const block of blocks) {
    const colBase = Math.round((block.x - minX) / TILE_STEP)
    const rowBase = Math.round((block.z - minZ) / TILE_STEP)
    for (let tile = 0; tile < block.tiles.length; tile++) {
      const row = rowBase + Math.floor(tile / TILES_PER_SIDE)
      const col = colBase + (tile % TILES_PER_SIDE)
      open[row][col] = isOpenWaterTile(block, tile, levels[row]?.[col] ?? null)
    }
  }
  return open
}

/**
 * Which part of a WALL tile is actually solid, by the tile's second byte.
 *
 * how-doc calls that byte `MapTileSlip` and reads it as a slide direction.
 * It is nothing of the kind: `Map::IsBlocked` (exe VA 0x4a7000) ignores it
 * unless `type & 0x80`, then switches on its low nibble 0..8 to test the
 * point against half a tile or a diagonal — the wall occupies a PART of the
 * tile, not all of it. 98% of the bytes in the shipped maps sit on wall
 * tiles.
 *
 * All nine are read straight off the exe's jump table (0x4a710c) now, with
 * no mirror on top: it takes `tx = x & 0x1ff` and `tz = z & 0x1ff`, both
 * fractions along the POSITIVE axis, and the branches come out
 * `tz<½`, `tx<½`, `tz>½`, `tx>½`, `tx>tz`, `tx+tz<1`, `tx<tz`, `tx+tz>1`
 * in that order — exactly the table below. The mirror this used to carry
 * (and the "37% more tiles" that argued for it) was the world being
 * mirrored: the tile picked for a given z was the wrong one, and mirroring
 * the shape inside it papered over that. With the map the right way round
 * (`formats/pmg.ts`, `TerrainBlock.z`) the literal reading is the correct
 * one.
 *
 * Coordinates are the tile's own, 0..1, both running with their axis.
 * 0 is the whole tile.
 */
const WALL_SHAPES: Record<number, (tx: number, tz: number) => boolean> = {
  0: () => true,
  1: (_tx, tz) => tz < 0.5,
  2: (tx) => tx < 0.5,
  3: (_tx, tz) => tz > 0.5,
  4: (tx) => tx > 0.5,
  5: (tx, tz) => tx > tz,
  6: (tx, tz) => tx + tz < 1,
  7: (tx, tz) => tx < tz,
  8: (tx, tz) => tx + tz > 1
}

/** One half of a tile as a plane, in the tile's own (tx, tz) coordinates. */
interface Half {
  origin: number
  alongX: number
  alongZ: number
}

/** A point inside a tile, with both halves of that tile. */
interface Patch {
  tx: number
  tz: number
  near: Half
  far: Half
}

export class TerrainQuery {
  private readonly minX: number
  private readonly minZ: number
  /** Blocks indexed [row][col] on the world grid. */
  private readonly grid: TerrainBlock[][]
  /** The fitted water level in elevation units, null on a dry map. */
  readonly waterElevation: number | null
  /** Per-cell region water levels (elevation units), null where dry. */
  private readonly waterLevels: (number | null)[][]

  constructor(
    private readonly blocks: TerrainBlock[],
    /** The per-texel water verdict (lib/game/watermask); without it the
     * tile's water flag alone decides, art unseen. */
    private readonly waterMask: WaterMask | null = null
  ) {
    this.minX = Math.min(...blocks.map((b) => b.x))
    this.minZ = Math.min(...blocks.map((b) => b.z))
    this.waterElevation = fitWaterElevation(blocks)
    this.waterLevels = waterLevelGrid(blocks)
    this.grid = []
    for (const block of blocks) {
      const col = Math.round((block.x - this.minX) / BLOCK_SPAN)
      const row = Math.round((block.z - this.minZ) / BLOCK_SPAN)
      ;(this.grid[row] ??= [])[col] = block
    }
  }

  /**
   * Ground level at world (x, z) in GAME coordinates (Y down). PMG stores
   * elevation up-positive (verified: water sits at the small values), hence
   * the negation.
   */
  height(x: number, z: number): number {
    return -this.elevation(x, z)
  }

  /**
   * The VISIBLE ground at (x, z), game Y-down: `height` with everything
   * below the LOCAL water region's level raised to it, exactly as the exe
   * flattens its render grid at load — each region (CAMP's raised channel
   * against its pond) carrying its own fitted level. Collision walks
   * `height`; what the eye and a floating pig meet is this.
   */
  surface(x: number, z: number): number {
    const ground = this.height(x, z)
    const row = Math.floor((z - this.minZ) / TILE_STEP)
    const col = Math.floor((x - this.minX) / TILE_STEP)
    const level = this.waterLevels[row]?.[col] ?? null
    return level === null ? ground : Math.min(ground, -level)
  }

  /**
   * Where (x, z) falls inside its tile, with both halves of that tile as
   * planes. Slopes are per unit of `tx` (running +x) and `tz` (running +z);
   * `origin` is the elevation those slopes start from.
   *
   * The original's sampler (`Map::SampleHeight`, VA 0x4a5140) splits every
   * tile along (col+1,row)-(col,row+1) — the same diagonal the ground mesh
   * is built with, so the surface a pig walks on is exactly the one it is
   * standing on visually. A bilinear patch is NOT that shape and pops along
   * the edge.
   */
  private patch(x: number, z: number): Patch | null {
    const col = Math.floor((x - this.minX) / BLOCK_SPAN)
    const row = Math.floor((z - this.minZ) / BLOCK_SPAN)
    const block = this.grid[row]?.[col]
    if (!block) return null
    // Fractional vertex coordinates inside the block (rows advance +z).
    const fx = (x - block.x) / TILE_STEP
    const fz = (z - block.z) / TILE_STEP
    // Clamped BOTH ways: a coordinate a hair the wrong side of a block
    // boundary rounds into the neighbouring block and leaves fx/fz just
    // outside [0, 4) — unclamped that indexes off the height grid and the
    // ground comes back NaN.
    const cx = clampIndex(Math.floor(fx), VERTS_PER_SIDE - 2)
    const cz = clampIndex(Math.floor(fz), VERTS_PER_SIDE - 2)
    const h = (r: number, c: number): number =>
      block.heights[r * VERTS_PER_SIDE + c] * HEIGHT_SCALE
    const half = (far: boolean): Half => {
      const corner = far ? h(cz + 1, cx + 1) : h(cz, cx)
      const alongX = far ? corner - h(cz + 1, cx) : h(cz, cx + 1) - corner
      const alongZ = far ? corner - h(cz, cx + 1) : h(cz + 1, cx) - corner
      return { origin: far ? corner - alongX - alongZ : corner, alongX, alongZ }
    }
    return { tx: fx - cx, tz: fz - cz, near: half(false), far: half(true) }
  }

  private elevation(x: number, z: number): number {
    const patch = this.patch(x, z)
    if (!patch) return 0
    const { tx, tz } = patch
    const half = tx + tz < 1 ? patch.near : patch.far
    return half.origin + half.alongX * tx + half.alongZ * tz
  }

  /**
   * The unit normal of the triangle under (x, z), in GAME space (Y down, so
   * an upward-facing surface has a NEGATIVE y). Flat ground gives
   * (0, -1, 0).
   *
   * The half a pig is standing on is a plane, so this is exact rather than a
   * sampled gradient — which matters, because the collision response
   * reflects velocity about it and a normal that jitters between samples
   * makes a pig jitter with it.
   */
  normal(x: number, z: number): { x: number; y: number; z: number } {
    const patch = this.patch(x, z)
    if (!patch) return { x: 0, y: -1, z: 0 }
    const half = patch.tx + patch.tz < 1 ? patch.near : patch.far
    // elevation = origin + alongX·tx + alongZ·tz, with tx running +x and tz
    // running +z — `patch` measures both fractions the way the vertex grid
    // grows. Game height is -elevation, so both derivatives flip sign, and
    // the normal is (dy/dx, -1, dy/dz) normalized: it is orthogonal to both
    // tangents and (0, -1, 0) on the flat.
    //
    // The z sign once trusted a comment that claimed tz ran -z; every
    // north-facing slope then bounced as if it faced south, and `downhill`
    // pointed UP the face — caught by the eject spec, which knows the exe
    // throws a wedged pig down the slope, not into it.
    const dydx = -half.alongX / TILE_STEP
    const dydz = -half.alongZ / TILE_STEP
    const length = Math.hypot(dydx, dydz, 1)
    return { x: dydx / length, y: -1 / length, z: dydz / length }
  }

  private tileAt(x: number, z: number): TerrainTile | null {
    const col = Math.floor((x - this.minX) / BLOCK_SPAN)
    const row = Math.floor((z - this.minZ) / BLOCK_SPAN)
    const block = this.grid[row]?.[col]
    if (!block) return null
    const tx = clampIndex(Math.floor((x - block.x) / TILE_STEP), TILES_PER_SIDE - 1)
    const tz = clampIndex(Math.floor((z - block.z) / TILE_STEP), TILES_PER_SIDE - 1)
    return block.tiles[tz * TILES_PER_SIDE + tx] ?? null
  }

  /**
   * May a pig BE at (x, z)? The void says no, and a wall tile says no for
   * the PART of itself its shape byte marks solid — the original blocks
   * half-tiles and diagonals, not whole tiles. Water is fine: pigs swim
   * (the caller decides what that means for speed and depth).
   */
  walkable(x: number, z: number): boolean {
    const tile = this.tileAt(x, z)
    if (tile === null) return false
    if ((tile.type & TILE_WALL) === 0) return true
    const shape = WALL_SHAPES[tile.slip & 0x0f]
    if (!shape) return true
    const patch = this.patch(x, z)
    return patch === null ? false : !shape(patch.tx, patch.tz)
  }

  /**
   * Which tile a point is on, in the map's own grid, with the two bytes that
   * decide how its texture is laid down. For reporting a tile that looks
   * wrong precisely enough to act on — "col 37 row 12, byte 2" says which
   * turn is at fault where "that one over there" does not.
   */
  tileAddress(
    x: number,
    z: number
  ): { col: number; row: number; texture: number; rotateFlip: number; type: number } | null {
    const tile = this.tileAt(x, z)
    if (!tile) return null
    return {
      col: Math.floor((x - this.minX) / TILE_STEP),
      row: Math.floor((z - this.minZ) / TILE_STEP),
      texture: tile.texture,
      rotateFlip: tile.rotateFlip,
      type: tile.type
    }
  }

  /**
   * The tile's terrain type — its LOW 5 BITS, as the exe reads it: the
   * scramble test masks with `and edx,1Fh` (0x46fde1) and the material
   * lookup with `and ecx,1fh` (0x4155dc) before comparing or indexing.
   * The bits above are flags (0x20 water, 0x40 mine, 0x80 wall), and
   * comparing the whole byte is exactly the bug that hid Scramble: nearly
   * every climbing tile on the shipped maps is 0x2b, not 0x0b.
   * -1 off the map.
   */
  tileType(x: number, z: number): number {
    const tile = this.tileAt(x, z)
    return tile === null ? -1 : tile.type & 0x1f
  }

  /** Does a pig standing here scramble? Terrain type 11 under the mask —
   * 0x0b and the far more common 0x2b alike. */
  isClimbing(x: number, z: number): boolean {
    return this.tileType(x, z) === CLIMBING_TILE
  }

  /**
   * Is a MINE buried here? Bit 6 of the type byte, and it is the whole of what
   * a minefield is — there is no object to see (lib/game/mines.ts).
   *
   * Whether one is still there is not this class's business: the exe CLEARS the
   * bit when the mine goes off (`Map::SetMine` 0x4a6f00) and the map data a
   * query reads is what the file said. `Mines` keeps the difference.
   */
  hasMine(x: number, z: number): boolean {
    const tile = this.tileAt(x, z)
    return tile !== null && (tile.type & TILE_MINE) !== 0
  }

  /**
   * The middle of the tile a point is on, and which tile that is.
   *
   * A mine goes off at the TILE's centre rather than under the foot that found
   * it: the exe builds the position out of the tile indices alone
   * (`col << 9 − 0x3f00`, 0x46c022), which is the centre of a 512 tile. Null off
   * the map.
   */
  tileCentre(x: number, z: number): { x: number; z: number; col: number; row: number } | null {
    if (this.tileAt(x, z) === null) return null
    const col = Math.floor((x - this.minX) / TILE_STEP)
    const row = Math.floor((z - this.minZ) / TILE_STEP)
    return {
      x: this.minX + col * TILE_STEP + TILE_STEP / 2,
      z: this.minZ + row * TILE_STEP + TILE_STEP / 2,
      col,
      row
    }
  }

  /**
   * Is (x, z) water — swimming, not walking?
   *
   * The bit is only a PREFILTER in the original: `IsInWater` (0x4a6fa0)
   * tests bit 5 and then asks `afIsPointWatery` (_d3d.dll 0x10010210),
   * which answers from the ART — the texel under the point must be a
   * water colour. That is how a pig stands on the painted dry half of a
   * shore tile and swims one step on. With a mask attached
   * (lib/game/watermask, learnt from the map's own pure-water art) this
   * does the same; without one the flag decides alone. The climbing type
   * stays out of the water wholesale either way — mud banks scramble.
   */
  isWater(x: number, z: number): boolean {
    const tile = this.tileAt(x, z)
    if (tile === null || (tile.type & TILE_WATER) === 0) return false
    if ((tile.type & 0x1f) === CLIMBING_TILE) return false
    return this.waterMask === null ? true : this.waterMask.wet(x, z)
  }

  /**
   * The heading of steepest descent at (x, z), or null on flat ground.
   *
   * This is what `EjectFromWall` (0x46fbd0) launches a wedged pig along:
   * 0x40c090 reads the tile's four corner heights (doubled, the collision
   * scale) and the eject heading is the atan2 of that gradient — the pig is
   * thrown off the wall DOWNHILL, not backwards. The surface normal's
   * horizontal part points the same way (it is the direction `slopePull`
   * pulls), so it is reused here.
   */
  downhill(x: number, z: number): number | null {
    const { x: nx, z: nz } = this.normal(x, z)
    if (Math.hypot(nx, nz) < 1e-6) return null
    return Math.atan2(nx, nz)
  }
}
