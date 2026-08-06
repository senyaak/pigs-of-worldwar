// PHASE 002 (domain) — the acting pig's frame-by-frame state machine,
// driven at the original's own 30 Hz against terrain built to order.
//
// The rules under test are the exe's, each with its address:
//
//   walking is KINEMATIC — `TryMove` (0x478ca0) pins the pig to the ground
//     however steep, wall tile or no wall tile; nothing about the ground
//     refuses a step
//   the wedge counter — `UpdateGroundState` (0x46fd50) counts frames the
//     pig stands in blocked ground; the pig update throws it out past 25
//     (`cmp eax,19h` at 0x46d79e) and `EjectFromWall` (0x46fbd0) launches
//     at speed 0x20, pitch 0x3b6, FACING DOWNHILL — 0x40c090 reads the four
//     corner heights and the atan2 of that gradient is the eject heading
//   scramble is ground, not a state — type 11 under the LOW-5-BIT mask
//     (`and edx,1Fh` at 0x46fde1) raises the flag the animation picker
//     (0x467ec0) answers with clip 11 in EVERY band, moving or not
//   a landing inside a wall never rests — the impact handler's stand-up is
//     gated on `IsBlocked` saying no; wall ground is friction 0.01,
//     restitution 0.99 (0x41564c), so the pig keeps bouncing until it is out
//   a jump is committed and refused in a wall (`TryJump` 0x46afc0)

import { test, expect } from '@playwright/test'

import {
  ANIM,
  EJECT_SPEED,
  JUMP_VELOCITY,
  SWIM_SINK,
  SWIM_SPEED,
  WALL_CLIMB,
  createLocomotion,
  updateLocomotion
} from '../../src/lib/game/locomotion'
import type { Intent, LocomotionState } from '../../src/lib/game/locomotion'
import { WALK_BACK_SPEED, WALK_SPEED } from '../../src/lib/game/movement'
import { EJECT_SECONDS, FRAME_SECONDS, RESTITUTION_FREE } from '../../src/lib/game/ballistics'
import type { TerrainQuery } from '../../src/lib/game/terrain'
import { terrain } from './fixture'

const NORTH = 0 // heading 0 is +z; forward is (sin h, cos h)

/** Drive the state at the original's frame rate; returns frames run. */
function run(
  state: LocomotionState,
  query: TerrainQuery,
  intent: Partial<Intent>,
  seconds: number,
  until?: (s: LocomotionState) => boolean
): number {
  const frames = Math.round(seconds / FRAME_SECONDS)
  for (let i = 0; i < frames; i++) {
    updateLocomotion(state, query, { walk: 0, turn: 0, jump: false, ...intent }, FRAME_SECONDS)
    if (until?.(state)) return i + 1
  }
  return frames
}

/** Ground rising 2 world units per unit walked north of z = 1024 — a steep
 * face — with every tile on the face a whole-tile wall. */
const wallFace = (): TerrainQuery =>
  terrain(
    (_x, z) => Math.max(0, z - 1024) * 2,
    (_x, z) => (z >= 1024 ? { type: 0x80, slip: 0 } : {})
  )

test('walking is kinematic: pinned to the ground, straight, at walking speed', () => {
  const hill = terrain((_x, z) => Math.max(0, z) * 0.5)
  const s = createLocomotion(hill, 0, -400, NORTH)
  run(s, hill, { walk: 1 }, 1)
  expect(s.z).toBeCloseTo(-400 + WALK_SPEED, 0)
  expect(s.x).toBeCloseTo(0)
  // Uphill or not, the feet are ON the ground — game space is Y-down.
  expect(s.y).toBeCloseTo(hill.height(s.x, s.z))
  expect(s.airborne).toBeNull()
  expect(s.clip).toBe(ANIM.RUN)
})

// The exe's own numbers, spelled out rather than recomputed from the
// constants they came from: 64 units a frame asked for, 13/16 of it granted
// to a grunt, and the backward request clamped to -32 before that scale.
test('the walking speeds are the exe’s: 52 units a frame, half that back', () => {
  const flat = terrain(() => 0)
  expect(WALK_SPEED * FRAME_SECONDS).toBeCloseTo(52, 6)
  expect(WALK_BACK_SPEED * FRAME_SECONDS).toBeCloseTo(26, 6)

  const s = createLocomotion(flat, 0, 0, NORTH)
  updateLocomotion(s, flat, { walk: 1, turn: 0, jump: false }, FRAME_SECONDS)
  expect(s.z).toBeCloseTo(52, 6)
  expect(s.clip).toBe(ANIM.RUN)

  updateLocomotion(s, flat, { walk: -1, turn: 0, jump: false }, FRAME_SECONDS)
  expect(s.z).toBeCloseTo(52 - 26, 6)
  expect(s.clip).toBe(ANIM.WALK_BACK)
})

test('scramble is the ground underfoot, in every band', () => {
  const mud = terrain(() => 0, () => ({ type: 0x2b }))
  const s = createLocomotion(mud, 0, 0, NORTH)
  run(s, mud, {}, 0.2)
  expect(s.clip, 'standing still on mud scrambles').toBe(ANIM.SCRAMBLE)
  run(s, mud, { walk: 1 }, 0.2)
  expect(s.clip, 'walking on mud scrambles').toBe(ANIM.SCRAMBLE)
  run(s, mud, { turn: 1 }, 0.2)
  expect(s.clip, 'turning on mud scrambles').toBe(ANIM.SCRAMBLE)
})

test('real water swims: capped at 16 a frame, sunk below the surface', () => {
  const sea = terrain(() => 0, () => ({ type: 0x24 }))
  const s = createLocomotion(sea, 0, 0, NORTH)
  run(s, sea, { walk: 1 }, 1)
  expect(s.clip).toBe(ANIM.SWIM)
  expect(SWIM_SPEED * FRAME_SECONDS).toBeCloseTo(16, 6)
  expect(s.z).toBeCloseTo(SWIM_SPEED, 0)
  expect(s.y).toBeCloseTo(sea.height(s.x, s.z) + SWIM_SINK)
})

test('a wall is not a ladder: the step-up envelope is all a pig ever gets', () => {
  const face = wallFace()
  const s = createLocomotion(face, 0, 1024 - 256, NORTH)
  // Walk in: the step is allowed INTO the face as far as the original's
  // step-up reaches — 128 exe units above the last free footing (0x4bd33c),
  // probed down in 32s — and refused beyond it. However long the key is
  // held, the pig scrabbles at the base and gains no more height.
  let highest = 0
  run(s, face, { walk: 1 }, EJECT_SECONDS * 0.9, (t) => {
    if (t.airborne === null) highest = Math.min(highest, t.y)
    return false
  })
  expect(s.z, 'pressed into the face, not through it').toBeGreaterThan(1024)
  expect(s.z, 'no further than the envelope').toBeLessThan(1024 + WALL_CLIMB / 2 + 40)
  expect(-highest, 'climbed no higher than the step-up allowance').toBeLessThanOrEqual(WALL_CLIMB + 1)
  // Pushing at the wall LOOKS like climbing: the pig wears the Scramble —
  // a remake choice, the exe having no clip of its own for the scrabble.
  expect(s.clip, 'scrabbles while pressing').toBe(ANIM.SCRAMBLE)

  // …until the wedge counter runs out and the eject fires.
  run(s, face, { walk: 1 }, 2, (t) => t.airborne !== null)
  expect(s.airborne?.ejected, 'thrown out, not just falling').toBe(true)
  expect(s.clip).toBe(ANIM.EJECTED)
  // Downhill is south here, and the launch is the exe's: mostly up, a push
  // of EJECT_SPEED out along the slope's descent.
  expect(s.airborne!.vy, 'launched upward').toBeLessThan(-EJECT_SPEED * 0.9)
  expect(s.airborne!.vz, 'pushed downhill (south)').toBeLessThan(0)
  // And the pig now FACES downhill — EjectFromWall turns it.
  expect(Math.cos(s.heading)).toBeLessThan(0)
})

test('a wall is scraped along, not oscillated at: the sidestep remembers its side', () => {
  // The face again, but the pig walks at it OBLIQUELY: forward is refused,
  // and the original's answer (0x4790d9) is to probe both right angles and
  // scrape 8 units a frame along whichever is clear — remembering the side,
  // so the pig does not dither. Here the clear side is the one the heading
  // already leans to.
  const face = wallFace()
  const lean = 0.3 // radians east of north
  const s = createLocomotion(face, 0, 1024 - 60, lean)
  run(s, face, { walk: 1 }, EJECT_SECONDS * 0.8)
  expect(s.x, 'scraped along the wall to the east').toBeGreaterThan(40)
})

test('out of the wall, the counter forgets', () => {
  const face = wallFace()
  const s = createLocomotion(face, 0, 1024 - 30, NORTH)
  run(s, face, { walk: 1 }, 4 * FRAME_SECONDS)
  expect(s.wedgedSeconds).toBeGreaterThan(0)
  run(s, face, { walk: -1 }, 8 * FRAME_SECONDS)
  expect(face.walkable(s.x, s.z)).toBe(true)
  expect(s.wedgedSeconds).toBe(0)
})

test('a landing inside a wall never rests — the pig stays a body until it is out', () => {
  // A flat world that is ALL wall: nowhere to stand up. The exe's impact
  // handler skips the stand-up wherever IsBlocked says yes, and the wedge
  // counter eventually throws the pig — a pig left in a wall is unplayable.
  const allWall = terrain(() => 0, () => ({ type: 0x80, slip: 0 }))
  const s = createLocomotion(allWall, 0, 0, NORTH)
  s.airborne = { vx: 0, vy: 2000, vz: 0, bouncing: false }
  s.y = allWall.height(0, 0) - 800
  let ejected = false
  const frames = Math.round(3 / FRAME_SECONDS)
  for (let i = 0; i < frames; i++) {
    updateLocomotion(s, allWall, { walk: 0, turn: 0, jump: false }, FRAME_SECONDS)
    expect(s.airborne, 'never came to rest inside the wall').not.toBeNull()
    if (s.airborne?.ejected) ejected = true
  }
  expect(ejected, 'the wedge counter fired at least once').toBe(true)
})

test('wedged, the pig grows bouncier; free, it recovers only on landing', () => {
  const face = wallFace()
  const s = createLocomotion(face, 0, 1024 - 30, NORTH)
  run(s, face, { walk: 1 }, 6 * FRAME_SECONDS)
  expect(s.bounciness.restitution).toBeGreaterThan(RESTITUTION_FREE)
})

test('a jump is committed, forward, and cooled down', () => {
  const flat = terrain(() => 0)
  const s = createLocomotion(flat, 0, 0, NORTH)
  updateLocomotion(s, flat, { walk: 0, turn: 0, jump: true }, FRAME_SECONDS)
  expect(s.airborne).not.toBeNull()
  expect(s.airborne!.vy).toBe(JUMP_VELOCITY)
  expect(s.airborne!.vz).toBeCloseTo(WALK_SPEED)
  expect(s.clip).toBe(ANIM.JUMP_MIDDLE)
  expect(s.jumpReadyIn).toBeGreaterThan(0)

  // Landing comes back to rest on open ground, and the cooldown gates the
  // next hop: not before it has run out, then freely.
  run(s, flat, {}, 3, (t) => t.airborne === null)
  expect(s.airborne).toBeNull()
  if (s.jumpReadyIn > 0) {
    updateLocomotion(s, flat, { walk: 0, turn: 0, jump: true }, FRAME_SECONDS)
    expect(s.airborne, 'refused while recharging').toBeNull()
  }
  run(s, flat, {}, 1)
  updateLocomotion(s, flat, { walk: 0, turn: 0, jump: true }, FRAME_SECONDS)
  expect(s.airborne, 'recharged').not.toBeNull()
})

test('no jump out of a wall — the ladder is closed', () => {
  const face = wallFace()
  const s = createLocomotion(face, 0, 1024 + 100, NORTH)
  expect(face.walkable(s.x, s.z)).toBe(false)
  updateLocomotion(s, face, { walk: 0, turn: 0, jump: true }, FRAME_SECONDS)
  // One frame in: far too soon for the wedge counter, so any launch here
  // could only have been the refused jump.
  expect(s.airborne).toBeNull()
})

test('walking off a drop keeps 1.5x the walking speed and hands over to ballistics', () => {
  const cliff = terrain((_x, z) => (z > 512 ? -4000 : 0))
  const s = createLocomotion(cliff, 0, 400, NORTH)
  run(s, cliff, { walk: 1 }, 2, (t) => t.airborne !== null)
  expect(s.airborne).not.toBeNull()
  expect(s.airborne!.ejected ?? false).toBe(false)
  expect(s.airborne!.vz).toBeCloseTo(WALK_SPEED * 1.5)
  expect(s.clip).toBe(ANIM.JUMP_MIDDLE)
})
