// PHASE 002 (domain) — one step of ground movement, against terrain built
// to order: no Electron, no renderer, so it costs nothing to keep separate
// from the turn rules next door.
//
// The rules come from the original (pigs-disasm/movement/notes.md). The one
// that matters most is negative: terrain height NEVER refuses a step. The
// exe's collision dispatch treats hitting the landscape as a success and
// pins the pig to the ground however steep it is; only walls, the world
// edge, and nothing-under-the-feet change the outcome.

import { test, expect } from '@playwright/test'

import { STEP_DOWN, step } from '../../src/lib/game/movement'
import { HEIGHT_SCALE, TerrainQuery, WORLD_LIMIT } from '../../src/lib/game/terrain'
import { BLOCKS_PER_SIDE, TILES_PER_SIDE, TILE_STEP, VERTS_PER_SIDE } from '../../src/lib/formats/pmg'
import type { TerrainBlock, TerrainTile } from '../../src/lib/formats/pmg'

const BLOCK_SPAN = TILES_PER_SIDE * TILE_STEP
const MAP_ORIGIN = (BLOCKS_PER_SIDE * BLOCK_SPAN) / 2
const NORTH = 0 // heading 0 is +z; forward is (sin h, cos h)
const STRIDE = 200

/**
 * A whole map whose elevation (world units, up-positive) is `shape` and
 * whose tiles are `tile` — by default plain open ground.
 */
function terrain(
  shape: (x: number, z: number) => number,
  tile: (x: number, z: number) => Partial<TerrainTile> = () => ({})
): TerrainQuery {
  const blocks: TerrainBlock[] = []
  for (let row = 0; row < BLOCKS_PER_SIDE; row++) {
    for (let col = 0; col < BLOCKS_PER_SIDE; col++) {
      const x = -MAP_ORIGIN + col * BLOCK_SPAN
      const z = MAP_ORIGIN - row * BLOCK_SPAN
      const heights = new Int16Array(VERTS_PER_SIDE * VERTS_PER_SIDE)
      for (let r = 0; r < VERTS_PER_SIDE; r++) {
        for (let c = 0; c < VERTS_PER_SIDE; c++) {
          heights[r * VERTS_PER_SIDE + c] = shape(x + c * TILE_STEP, z - r * TILE_STEP) / HEIGHT_SCALE
        }
      }
      const tiles = Array.from({ length: TILES_PER_SIDE * TILES_PER_SIDE }, (_, i) => ({
        texture: 0,
        rotateFlip: 0,
        type: 0,
        slip: 0,
        ...tile(x + (i % TILES_PER_SIDE) * TILE_STEP, z - Math.floor(i / TILES_PER_SIDE) * TILE_STEP)
      }))
      blocks.push({ x, z, heights, tiles })
    }
  }
  return new TerrainQuery(blocks)
}

/** Ground that climbs `perStride` world units for every STRIDE walked north. */
const slope = (perStride: number): TerrainQuery => terrain((_x, z) => (z * perStride) / STRIDE)

test('flat ground: the step just happens, the whole way', () => {
  const move = step(terrain(() => 0), 0, 0, NORTH, STRIDE)
  expect(move.outcome).toBe('moved')
  expect(move.z).toBeCloseTo(STRIDE)
  expect(move.x).toBeCloseTo(0)
})

test('a steep climb is still just a step — terrain height never refuses', () => {
  // Four times the exe's object step-up allowance, and it walks straight up.
  const move = step(slope(512), 0, 0, NORTH, STRIDE)
  expect(move.outcome).toBe('moved')
  expect(move.x).toBeCloseTo(0) // dead straight: no sidestep, ever
  expect(move.z).toBeCloseTo(STRIDE)
})

test('a drop deeper than the step-down is walked off, not stopped at', () => {
  const move = step(slope(-(STEP_DOWN + 18)), 0, 0, NORTH, STRIDE)
  expect(move.outcome).toBe('falling')
  expect(move.z).toBeCloseTo(STRIDE)
})

test('a drop within the step-down is just a step down', () => {
  const move = step(slope(-(STEP_DOWN - 7)), 0, 0, NORTH, STRIDE)
  expect(move.outcome).toBe('moved')
  expect(move.z).toBeCloseTo(STRIDE)
})

test('a wall stops the pig dead — it does not slide along it', () => {
  // Shape 0: the whole tile is solid, everywhere north of z = 512.
  const walled = terrain(
    () => 0,
    (_x, z) => (z >= 512 ? { type: 0x80, slip: 0 } : {})
  )
  const move = step(walled, 0, 400, NORTH, STRIDE)
  expect(move.outcome).toBe('blocked')
  expect(move).toMatchObject({ x: 0, z: 400 })
})

test('a shaped wall blocks only its own half of the tile', () => {
  // Shape 3 is solid where tz < 0.5, and tz runs -z: the half of the tile
  // furthest along +z. The tile spans z = 512..1024.
  const shaped = terrain(
    () => 0,
    (_x, z) => (z >= 512 ? { type: 0x80, slip: 3 } : {})
  )
  // Landing at z = 600 is tz = 0.83 — the open half.
  expect(step(shaped, 0, 400, NORTH, STRIDE).outcome).toBe('moved')
  // Landing at z = 900 is tz = 0.24 — inside the solid half.
  expect(step(shaped, 0, 400, NORTH, 500).outcome).toBe('blocked')
})

test('the world limit refuses the step rather than sliding along it', () => {
  const east = Math.PI / 2
  const move = step(terrain(() => 0), WORLD_LIMIT, 0, east, STRIDE)
  expect(move.outcome).toBe('limit')
  expect(move.x).toBe(WORLD_LIMIT)
})
