// PHASE 002 (domain) — one step of ground movement, against terrain built
// to order: no Electron, no renderer, so it costs nothing to keep separate
// from the turn rules next door.
//
// The rules come from the original (pigs-disasm/movement/notes.md). The one
// that matters most is negative: NOTHING about the ground refuses a step.
// Neither height nor a wall — the exe's collision dispatch pins the pig to the
// landscape however steep, and `TryMove` never asks whether a tile is a
// wall. Only the world edge refuses, and only empty air under the feet
// changes the outcome. Walking into a wall is allowed; being in one is what
// the scene acts on, a frame later.

import { test, expect } from '@playwright/test'

import { LOOK_AHEAD, STEP_DOWN, step } from '../../src/lib/game/movement'
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
      // Movement never reads the shade; unshaded keeps the fixture honest.
      const shades = new Uint8Array(VERTS_PER_SIDE * VERTS_PER_SIDE).fill(255)
      blocks.push({ x, z, heights, shades, tiles })
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

test('a wall does not refuse the step — nothing about the ground does', () => {
  // Shape 0: every tile north of z = 512 is solid all through. The step goes
  // in anyway. `0x415590` makes that ground friction 0.01 and restitution
  // 0.99 instead of stopping anyone, and the scene throws the pig back out.
  const walled = terrain(
    () => 0,
    (_x, z) => (z >= 1024 ? { type: 0x80, slip: 0 } : {})
  )
  const move = step(walled, 0, 400, NORTH, STRIDE)
  expect(move.outcome).toBe('moved')
  expect(move.z).toBeCloseTo(600)
  // What the tile IS still matters — the scene reads it to pick the surface.
  expect(walled.walkable(move.x, move.z)).toBe(false)

  // And the lip of a cliff, which is a wall tile too, is walked off rather
  // than walled against: refusing here trapped pigs on top of cliffs.
  const ledge = terrain(
    (_x, z) => (z >= 1024 ? -40 * STEP_DOWN : 0),
    (_x, z) => (z >= 1024 ? { type: 0x80, slip: 0 } : {})
  )
  expect(step(ledge, 0, 400, NORTH, STRIDE).outcome).toBe('falling')
})

test('a shaped wall is that surface over only its own half of the tile', () => {
  // Shape 3 is solid where tz < 0.5, and tz runs -z: the half of the tile
  // furthest along +z. That tile spans z = 512..1024.
  const shaped = terrain(
    () => 0,
    (_x, z) => (z >= 1024 ? { type: 0x80, slip: 3 } : {})
  )
  // z = 600 is tz = 0.83 — the open half. z = 900 is tz = 0.24 — the solid.
  expect(shaped.walkable(0, 600)).toBe(true)
  expect(shaped.walkable(0, 900)).toBe(false)
  // Neither refuses the walk; the difference is the ground underfoot.
  expect(step(shaped, 0, 400, NORTH, STRIDE).outcome).toBe('moved')
  expect(step(shaped, 0, 400, NORTH, 500).outcome).toBe('moved')
})

test('the world limit refuses the step rather than sliding along it', () => {
  const east = Math.PI / 2
  const move = step(terrain(() => 0), WORLD_LIMIT, 0, east, STRIDE)
  expect(move.outcome).toBe('limit')
  expect(move.x).toBe(WORLD_LIMIT)
})

test('an edge is seen a walking step ahead, not a frame ahead', () => {
  // The drop starts one LOOK_AHEAD north of the pig, and is deep enough to
  // clear STEP_DOWN over that distance but not over a tenth of it.
  const cliff = terrain((_x, z) => (z > LOOK_AHEAD ? 0 : -20 * STEP_DOWN))

  // A tiny step — one frame of a fast machine — still sees the edge coming
  // and launches. Tie the look-ahead to the frame and this walks off the lip
  // instead, a hair at a time, with gravity doing what the leap should.
  expect(step(cliff, 0, LOOK_AHEAD * 1.5, NORTH, -LOOK_AHEAD / 10).outcome).toBe('falling')
  // And a whole step sees it too — the look-ahead is a floor, not a cap.
  expect(step(cliff, 0, LOOK_AHEAD * 1.5, NORTH, -LOOK_AHEAD).outcome).toBe('falling')
  // Level ground a step ahead is still just a walk.
  expect(step(terrain(() => 0), 0, 0, NORTH, LOOK_AHEAD / 10).outcome).toBe('moved')
})
