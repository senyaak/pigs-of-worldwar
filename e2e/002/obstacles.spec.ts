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
import {
  SIDESTEP_SPEED,
  WALL_CLIMB,
  createLocomotion,
  updateLocomotion
} from '../../src/lib/game/locomotion'
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
import { WOOD } from '../../src/lib/game/underfoot'
import type { Obstruction } from '../../src/lib/game/obstacles'
import { terrain } from './fixture'

const NORTH = 0 // heading 0 is +z; forward is (sin h, cos h)

/**
 * A stored yaw that leaves a box lying along the world's own axes — the one
 * `modelRotationY` turns to zero. Stored angles are not world angles: the
 * art and the collider are both turned by `−yaw − π/2` (lib/formats/pog.ts),
 * so a record at yaw 0 is already a quarter turn round.
 */
const UNTURNED = -Math.PI / 2
/** A quarter turn on from `UNTURNED`, as the drawn object sees it. */
const QUARTER = UNTURNED - Math.PI / 2

/** A .POG record, with only the fields collision reads spelled out. */
function record(over: Partial<MapObject>): MapObject {
  return {
    name: 'CRATE1',
    id: 1,
    type: 0,
    x: 0,
    y: 0,
    z: 0,
    yaw: UNTURNED,
    pitch: 0,
    roll: 0,
    shape: 0,
    box: { x: 512, y: 512, z: 512 },
    flags: 0x13f,
    contents: null,
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

test('what counts as solid at all', { tag: '@nodata' }, () => {
  // A structure does.
  expect(isSolid(record({ box: { x: 384, y: 1024, z: 384 } }))).toBe(true)
  // Grass, flowers and the swimming fish carry a box one unit SQUARE — that is
  // the whole of what walks through, and the test is on the FOOTPRINT rather than
  // on the thinnest side. Play found what the old line cost: "дом бестелесен",
  // because every wall piece in the game is one unit thick and the line asked for
  // two on both axes.
  expect(isSolid(record({ box: { x: 64, y: 128, z: 64 } })), 'a tuft of grass').toBe(false)
  expect(isSolid(record({ box: { x: 64, y: 64, z: 64 } })), 'a fish').toBe(false)
  expect(isSolid(record({ box: { x: 64, y: 320, z: 64 } })), 'a lamp post').toBe(false)
  expect(MIN_SOLID).toBe(64)
  // …and a WALL is thin. STW04PPP is 64×512×512 and STW07PWW 64×512×2048: one
  // unit through, and eight or thirty-two long.
  expect(isSolid(record({ box: { x: 64, y: 512, z: 512 } })), 'a house wall').toBe(true)
  expect(isSolid(record({ box: { x: 64, y: 512, z: 2048 } })), 'a long wall').toBe(true)
  expect(isSolid(record({ box: { x: 1024, y: 64, z: 1024 } })), 'a floor').toBe(true)
  // A SIGN is 64×512×256 and stops a pig; nothing with a real footprint does not.
  expect(isSolid(record({ box: { x: 64, y: 512, z: 256 } })), 'a sign').toBe(true)
  // A crate with something in it is collected by walking into it, so it
  // cannot be a blocker — and an EMPTY one is scenery, which is the whole
  // difference between the crates that are picked up and the ones that are
  // not. All 11 CRATE4s carry nothing.
  const crate = { type: 67, box: { x: 384, y: 384, z: 512 } }
  expect(isSolid(record({ ...crate, contents: { weapon: 51, amount: 1 } }))).toBe(false)
  expect(isSolid(record({ ...crate, contents: { weapon: null, amount: 50 } }))).toBe(false)
  expect(isSolid(record({ ...crate, contents: null }))).toBe(true)
  // A spawn marker is a pig, not scenery.
  expect(isSolid(record({ name: 'GR_ME', box: { x: 640, y: 640, z: 640 } }))).toBe(false)
  // The exe's own first word on shape kind 1 is that it builds no collider at
  // all, and that is what every bridge and step piece carries — so a piece of
  // one is solid here only because the REMAKE walks bridges, and only for the
  // six models whose box is the surface their art draws (lib/game/ramps.ts).
  const bodiless = { shape: 1, box: { x: 1024, y: 1024, z: 1024 } }
  expect(isSolid(record({ ...bodiless, name: 'BRIDGE_S' })), 'an abutment').toBe(true)
  expect(isSolid(record({ ...bodiless, name: 'BRID2_S' })), 'a ramp').toBe(true)
  // …and the three ARCH bridges are not among them: their deck is 198.5 units
  // below the box, so nothing here can carry them.
  expect(isSolid(record({ ...bodiless, name: 'STR06PPP' })), 'an arch').toBe(false)
  // Anything else bodiless stays out on the exe's word alone.
  expect(isSolid(record({ ...bodiless, name: 'TREEP' })), 'not a walkway at all').toBe(false)
})

test('a tall object refuses the step, and the pig scrapes along it', { tag: '@nodata' }, () => {
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

test('a low object is a step onto, not a wall', { tag: '@nodata' }, () => {
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

test('a bridge deck is what a hoof lands on, and it is not the tile under it', { tag: '@nodata' }, () => {
  // The FOOTSTEP's question (lib/game/underfoot.ts): the exe asks the tile and
  // nothing else, and no shipped map carries a wooden tile at all, so a bridge
  // sounding like a bridge is the remake's own line and this is where it is
  // pinned.
  const query = flat()
  const deck = record({
    name: 'BRIDGE_C',
    x: 0,
    y: WALL_CLIMB / 2,
    z: 2048,
    box: { x: 4096, y: WALL_CLIMB, z: 2048 }
  })
  const field = new ObstacleField([deck])
  const state = createLocomotion(query, 0, 0, NORTH)
  run(state, query, field, { walk: 1 }, 1.5)

  // Standing ON it — the same test `standing` makes — and it sounds like wood.
  expect(state.y).toBeCloseTo(-WALL_CLIMB, 3)
  expect(field.underfoot(state.x, state.z, state.y)).toBe(WOOD)

  // Off the deck, on the ground beside it, the deck has nothing to say: the
  // tile answers, which is every other step in the game.
  expect(field.underfoot(0, 0, 0)).toBeNull()
  // …and neither has the deck a pig is standing UNDER, or walking past on the
  // ground: `underfoot` is what holds the feet up, not what is nearby.
  expect(field.underfoot(state.x, state.z, 0)).toBeNull()

  // Nothing else on a map carries a material of its own. A crate is wooden and
  // sounds like the ground it sits on, because nobody has ruled otherwise.
  const crate = new ObstacleField([
    record({ name: 'CRATE1', x: 0, y: WALL_CLIMB / 2, z: 2048, box: { x: 4096, y: WALL_CLIMB, z: 2048 } })
  ])
  expect(crate.underfoot(state.x, state.z, state.y)).toBeNull()
})

test('an object over the pig’s head is walked under', { tag: '@nodata' }, () => {
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

test('a box is oriented, so its long side stops a pig its short side lets by', { tag: '@nodata' }, () => {
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
  /**
   * How long the approach takes, in DISTANCE rather than in seconds.
   *
   * `FRAME_SECONDS` is the one free number in the speed chain and play moves
   * it: every wall-clock figure written here went stale the first time it did,
   * and the tell was this spec passing a pig that had already scraped round the
   * corner it was supposed to be stopped at.
   */
  const APPROACH = 2048 / WALK_SPEED
  /** …and the scrape it takes to round the turned box: 128 of box plus a pig. */
  const AROUND = (128 + PIG_RADIUS) / SIDESTEP_SPEED
  const stopsAt = (yaw: number, face: number): void => {
    // Long enough to arrive and be refused, and nowhere near long enough to
    // scrape round the end.
    const state = walk(yaw, APPROACH + AROUND / 4)
    // The refusal lands on a FRAME boundary, and a frame now carries the pig
    // twice as far (ballistics.ts, FRAME_SECONDS), so the last step before
    // the stop can leave it a shade inside its own radius.
    expect(state.z).toBeLessThanOrEqual(face + stride / 2)
    expect(state.z).toBeGreaterThan(face - stride)
  }
  stopsAt(UNTURNED, 2048 - 128 - PIG_RADIUS)
  stopsAt(QUARTER, 2048 - 1024 - PIG_RADIUS)

  // And a stop is not the end of it: the sidestep scrapes along until the
  // box runs out, and the turned one is only 256 thick — so given the approach,
  // the scrape and a walk on top, the pig rounds its end and carries on north.
  expect(walk(QUARTER, APPROACH * 2 + AROUND * 2).z).toBeGreaterThan(2048)
})

test('a pig is in the way of another pig', { tag: '@nodata' }, () => {
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
