// PHASE 002 (domain) — running into things: the map's objects, and the
// other pigs.
//
// The behaviour is the other half of the dispatch the wall handling already
// rests on (`TryMove` 0x478e78): hitting only the landscape is the
// successful walk, so terrain never refuses a step and an OBJECT does. An
// object therefore gets exactly the wall's envelope — a top within the
// step-up is a step ONTO, anything higher is a wall to scrape along, and a
// box over the pig's head is walked under.
//
// The shapes are the .POG's own collision boxes, including the pig's: all
// 772 spawn markers carry 5×5×5, so a pig is 640 units on a side and
// nothing here is a guess about its size.

import { test, expect } from '@playwright/test'

import { FRAME_SECONDS } from '../../src/lib/game/ballistics'
import { WALK_SPEED } from '../../src/lib/game/movement'
import { WALL_CLIMB, createLocomotion, updateLocomotion } from '../../src/lib/game/locomotion'
import type { Intent, LocomotionState } from '../../src/lib/game/locomotion'
import {
  MIN_SOLID,
  ObstacleField,
  PIG_HEIGHT,
  PIG_RADIUS,
  isSolid,
  withPigs
} from '../../src/lib/game/obstacles'
import type { MapObject } from '../../src/lib/formats/pog'
import type { TerrainQuery } from '../../src/lib/game/terrain'
import type { Obstruction } from '../../src/lib/game/obstacles'
import { terrain } from './fixture'

const NORTH = 0 // heading 0 is +z; forward is (sin h, cos h)

/** A .POG record, with only the fields collision reads spelled out. */
function record(over: Partial<MapObject>): MapObject {
  return {
    name: 'CRATE1',
    id: 1,
    type: 0,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    box: { x: 512, y: 512, z: 512 },
    flags: 0x13f,
    fields: new Int16Array(31),
    ...over
  }
}

function run(
  state: LocomotionState,
  query: TerrainQuery,
  obstruction: Obstruction,
  intent: Partial<Intent>,
  seconds: number
): void {
  const frames = Math.round(seconds / FRAME_SECONDS)
  for (let i = 0; i < frames; i++) {
    updateLocomotion(
      state,
      query,
      { walk: 0, turn: 0, jump: false, ...intent },
      FRAME_SECONDS,
      obstruction
    )
  }
}

/** Flat ground at elevation zero — game space Y-down, so y = 0 is the floor. */
const flat = (): TerrainQuery => terrain(() => 0)

test('what counts as solid at all', () => {
  // A structure does.
  expect(isSolid(record({ box: { x: 384, y: 1024, z: 384 } }))).toBe(true)
  // Grass, flowers and the swimming fish carry a box one unit across —
  // an eighth of the pig's own width, and scenery to walk through.
  expect(isSolid(record({ box: { x: 128, y: 256, z: 128 } }))).toBe(false)
  expect(MIN_SOLID).toBe(256)
  // A crate is collected by walking into it, so it cannot be a blocker.
  expect(isSolid(record({ type: 67, box: { x: 384, y: 384, z: 512 } }))).toBe(false)
  // A spawn marker is a pig, not scenery.
  expect(isSolid(record({ name: 'GR_ME', box: { x: 640, y: 640, z: 640 } }))).toBe(false)
})

test('a tall object refuses the step, and the pig scrapes along it', () => {
  const query = flat()
  // A wall of a box across the pig's path, far taller than the envelope.
  const field = new ObstacleField([
    record({ name: 'PILLBOX', x: 0, y: 1024, z: 1024, box: { x: 4096, y: 2048, z: 512 } })
  ])
  const state = createLocomotion(query, 0, 0, NORTH)
  run(state, query, field, { walk: 1 }, 3)

  // Stopped short of the box's own face, by the pig's own radius.
  expect(state.z).toBeLessThan(1024 - 512 / 2)
  expect(state.z).toBeGreaterThan(0)
  // And it went round rather than standing still — the sidestep.
  expect(Math.abs(state.x)).toBeGreaterThan(0)
})

test('a low object is a step onto, not a wall', () => {
  const query = flat()
  // A slab starting at z 1024, its top exactly at the step-up envelope.
  // The stored y is the box's CENTRE, so half the height sits under it.
  const field = new ObstacleField([
    record({
      name: 'M1S_SU03',
      x: 0,
      y: WALL_CLIMB / 2,
      z: 2048,
      box: { x: 4096, y: WALL_CLIMB, z: 2048 }
    })
  ])
  const state = createLocomotion(query, 0, 0, NORTH)
  // Long enough to be well onto the slab, short enough to be still on it.
  run(state, query, field, { walk: 1 }, 1.5)

  // Walked on over it, and is standing on its top — game space is Y-down,
  // so the feet are at MINUS the elevation.
  expect(state.z).toBeGreaterThan(1024)
  expect(state.z).toBeLessThan(3072)
  expect(state.y).toBeCloseTo(-WALL_CLIMB, 3)
})

test('an object over the pig’s head is walked under', () => {
  const query = flat()
  // A deck whose underside clears a pig standing on the floor.
  const clearance = PIG_HEIGHT + 64
  const field = new ObstacleField([
    record({
      name: 'BRIDGE_C',
      x: 0,
      y: clearance + 64,
      z: 1024,
      box: { x: 4096, y: 128, z: 2048 }
    })
  ])
  const state = createLocomotion(query, 0, 0, NORTH)
  run(state, query, field, { walk: 1 }, 3)
  expect(state.z).toBeGreaterThan(1024)
  expect(state.y).toBeCloseTo(0, 3)
})

test('a box is oriented, so its long side stops a pig its short side lets by', () => {
  // A hedge 2048 long and 256 thick, standing 2048 up the pig's path.
  const hedge = record({ name: 'BARBWIRE', x: 0, y: 1024, z: 2048, box: { x: 2048, y: 2048, z: 256 } })
  const walk = (yaw: number, seconds: number): LocomotionState => {
    const query = flat()
    const state = createLocomotion(query, 0, 0, NORTH)
    run(state, query, new ObstacleField([{ ...hedge, yaw }]), { walk: 1 }, seconds)
    return state
  }
  // Broadside, the pig meets the near face 128 out from the centre. Turned
  // a quarter, the same box points AT the pig and it meets its END, 1024
  // out — the far side of 900 units of difference. A stop lands within one
  // walking step of the face and never past it.
  const stride = WALK_SPEED * FRAME_SECONDS
  const stopsAt = (yaw: number, face: number): void => {
    const state = walk(yaw, 1.5)
    expect(state.z).toBeLessThanOrEqual(face)
    expect(state.z).toBeGreaterThan(face - stride)
  }
  stopsAt(0, 2048 - 128 - PIG_RADIUS)
  stopsAt(Math.PI / 2, 2048 - 1024 - PIG_RADIUS)

  // And a stop is not the end of it: the sidestep scrapes along until the
  // box runs out, and the turned one is only 256 thick — so given long
  // enough the pig walks round its end and carries on north.
  expect(walk(Math.PI / 2, 4).z).toBeGreaterThan(2048)
})

test('a pig is in the way of another pig', () => {
  const query = flat()
  const standing = [{ x: 0, z: 1024, y: 0 }]
  const field = withPigs(new ObstacleField([]), standing)
  const state = createLocomotion(query, 0, 0, NORTH)
  run(state, query, field, { walk: 1 }, 3)

  // Never nearer than the two bodies' own width.
  expect(Math.hypot(state.x - 0, state.z - 1024)).toBeGreaterThanOrEqual(PIG_RADIUS * 2 - 1)
  // And with nobody there it walks straight past the same spot.
  const clear = createLocomotion(query, 0, 0, NORTH)
  run(clear, query, new ObstacleField([]), { walk: 1 }, 3)
  expect(clear.z).toBeGreaterThan(1024 + PIG_RADIUS)
})
