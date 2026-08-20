// PHASE 002 (domain) — one step of ground movement, against terrain built
// to order: no Electron, no renderer, so it costs nothing to keep separate
// from the turn rules next door.
//
// The rules come from the original (movement/notes.md). The one
// that matters most is negative: NOTHING about the ground refuses a step.
// Neither height nor a wall — the exe's collision dispatch pins the pig to the
// landscape however steep, and `TryMove` never asks whether a tile is a
// wall. Only the world edge refuses, and only empty air under the feet
// changes the outcome. Walking into a wall is allowed; being in one is what
// the scene acts on, a frame later.

import { test, expect } from '@playwright/test'

import { LOOK_AHEAD, STEP_DOWN, step } from '../src/lib/game/movement'
import { WORLD_LIMIT } from '../src/lib/game/terrain'
import type { TerrainQuery } from '../src/lib/game/terrain'
import { terrain } from './fixture'

const NORTH = 0 // heading 0 is +z; forward is (sin h, cos h)
const STRIDE = 200

/** Ground that climbs `perStride` world units for every STRIDE walked north. */
const slope = (perStride: number): TerrainQuery => terrain((_x, z) => (z * perStride) / STRIDE)

test('flat ground: the step just happens, the whole way', { tag: '@nodata' }, () => {
  const move = step(terrain(() => 0), 0, 0, NORTH, STRIDE)
  expect(move.outcome).toBe('moved')
  expect(move.z).toBeCloseTo(STRIDE)
  expect(move.x).toBeCloseTo(0)
})

test('a steep climb is still just a step — terrain height never refuses', { tag: '@nodata' }, () => {
  // Four times the exe's object step-up allowance, and it walks straight up.
  const move = step(slope(512), 0, 0, NORTH, STRIDE)
  expect(move.outcome).toBe('moved')
  expect(move.x).toBeCloseTo(0) // dead straight: no sidestep, ever
  expect(move.z).toBeCloseTo(STRIDE)
})

test('a hillside is walked DOWN — a grade is not a cliff', { tag: '@nodata' }, () => {
  // These exact numbers used to pin 'falling', and that WAS the stutter play
  // reported ("спускаюсь с горки — падаю - иду - падаю"): 34 over 200 is a
  // 9.7° hillside, not a drop-off. CAMP's median slope is 14°.
  expect(step(slope(-(STEP_DOWN + 18)), 0, 0, NORTH, STRIDE).outcome).toBe('moved')
  // CAMP's own median, and twice it: both are ground, walked pinned.
  expect(step(slope(-50), 0, 0, NORTH, STRIDE).outcome).toBe('moved')
  expect(step(slope(-100), 0, 0, NORTH, STRIDE).outcome).toBe('moved')
  // …and past 45° is STILL ground — play walks such faces both ways, and the
  // shipped maps run continuously up to ~88° (movement/slope-census.mjs).
  expect(step(slope(-(STRIDE * 1.2)), 0, 0, NORTH, STRIDE).outcome).toBe('moved')
})

test('a face steeper than the feet can follow is walked off', { tag: '@nodata' }, () => {
  // Past WALK_OFF_GRADE (60°) the ground stops reading as ground and the
  // step leaves it. 65.5° here.
  const move = step(slope(-(STRIDE * 2.2)), 0, 0, NORTH, STRIDE)
  expect(move.outcome).toBe('falling')
  expect(move.z).toBeCloseTo(STRIDE)
})

test('a drop within the step-down is just a step down', { tag: '@nodata' }, () => {
  const move = step(slope(-(STEP_DOWN - 7)), 0, 0, NORTH, STRIDE)
  expect(move.outcome).toBe('moved')
  expect(move.z).toBeCloseTo(STRIDE)
})

test('a wall does not refuse the step — nothing about the ground does', { tag: '@nodata' }, () => {
  // Shape 0: every tile north of z = 512 is solid all through. The step goes
  // in anyway. `0x415590` makes that ground friction 0.01 and restitution
  // 0.99 instead of stopping anyone, and the scene throws the pig back out.
  const walled = terrain(
    () => 0,
    (_x, z) => (z >= 512 ? { type: 0x80, slip: 0 } : {})
  )
  const move = step(walled, 0, 400, NORTH, STRIDE)
  expect(move.outcome).toBe('moved')
  expect(move.z).toBeCloseTo(600)
  // What the tile IS still matters — the scene reads it to pick the surface.
  expect(walled.walkable(move.x, move.z)).toBe(false)

  // And the lip of a cliff, which is a wall tile too, is walked off rather
  // than walled against: refusing here trapped pigs on top of cliffs. The
  // face is one tile wide in the fixture, so 80 step-downs make it 68°.
  const ledge = terrain(
    (_x, z) => (z >= 1024 ? -80 * STEP_DOWN : 0),
    (_x, z) => (z >= 512 ? { type: 0x80, slip: 0 } : {})
  )
  expect(step(ledge, 0, 400, NORTH, STRIDE).outcome).toBe('falling')
})

test('a shaped wall is that surface over only its own half of the tile', { tag: '@nodata' }, () => {
  // Shape 3 is solid where tz > 0.5, and tz runs +z: the half of the tile
  // furthest along +z. That tile spans z = 512..1024.
  const shaped = terrain(
    () => 0,
    (_x, z) => (z >= 512 ? { type: 0x80, slip: 3 } : {})
  )
  // z = 600 is tz = 0.17 — the open half. z = 900 is tz = 0.76 — the solid.
  expect(shaped.walkable(0, 600)).toBe(true)
  expect(shaped.walkable(0, 900)).toBe(false)
  // Neither refuses the walk; the difference is the ground underfoot.
  expect(step(shaped, 0, 400, NORTH, STRIDE).outcome).toBe('moved')
  expect(step(shaped, 0, 400, NORTH, 500).outcome).toBe('moved')
})

test('the world limit refuses the step rather than sliding along it', { tag: '@nodata' }, () => {
  const east = Math.PI / 2
  const move = step(terrain(() => 0), WORLD_LIMIT, 0, east, STRIDE)
  expect(move.outcome).toBe('limit')
  expect(move.x).toBe(WORLD_LIMIT)
})

test('an edge is seen a walking step ahead, not a frame ahead', { tag: '@nodata' }, () => {
  // The drop starts one LOOK_AHEAD north of the pig — a 68° face, since the
  // fixture's vertices are a tile apart — and a face that steep is a cliff
  // however short the step that approaches it.
  const cliff = terrain((_x, z) => (z > LOOK_AHEAD ? 0 : -80 * STEP_DOWN))

  // A tiny step — one frame of a fast machine — still sees the edge coming
  // and launches. Tie the look-ahead to the frame and this walks off the lip
  // instead, a hair at a time, with gravity doing what the leap should.
  expect(step(cliff, 0, LOOK_AHEAD * 1.5, NORTH, -LOOK_AHEAD / 10).outcome).toBe('falling')
  // And a whole step sees it too — the look-ahead is a floor, not a cap.
  expect(step(cliff, 0, LOOK_AHEAD * 1.5, NORTH, -LOOK_AHEAD).outcome).toBe('falling')
  // Level ground a step ahead is still just a walk.
  expect(step(terrain(() => 0), 0, 0, NORTH, LOOK_AHEAD / 10).outcome).toBe('moved')
})
