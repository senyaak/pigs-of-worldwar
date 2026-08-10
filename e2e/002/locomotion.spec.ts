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
  GRAVITY,
  JUMP_PUSH,
  JUMP_PUSH_DELAY,
  JUMP_RISE,
  JUMP_SPEED,
  JUMP_WINDUP,
  GET_UP,
  SWIM_SINK,
  SWIM_SPEED,
  WALL_CLIMB,
  createLocomotion,
  updateLocomotion
} from '../../src/lib/game/locomotion'
import type { Intent, LocomotionState } from '../../src/lib/game/locomotion'
import { WALK_BACK_SPEED, WALK_SCALE, WALK_SPEED } from '../../src/lib/game/movement'
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

/**
 * Where to stand so that ONE step ends INSIDE the face, and inside the part of
 * it the step-up envelope allows.
 *
 * The face rises 2 units per unit of z, so the reachable band is `WALL_CLIMB`
 * over 2 — 32 units deep — and a pig that steps clean over it is refused and
 * never wedges at all. That is not a rate to hard-code a start position
 * against: `WALK_SCALE` and `FRAME_SECONDS` both move the stride, and the tell
 * was two wedge specs going quiet the moment the walk sped up.
 */
const lipOf = (): number => 1024 - WALK_SPEED * FRAME_SECONDS + WALL_CLIMB / 4

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
  // The exe's own two numbers are still exactly there — under one declared
  // factor that is play's and says so (`WALK_SCALE` in game/movement.ts). Take
  // it back out and the frame's step is 52 forward and 26 back.
  expect((WALK_SPEED * FRAME_SECONDS) / WALK_SCALE).toBeCloseTo(52, 6)
  expect((WALK_BACK_SPEED * FRAME_SECONDS) / WALK_SCALE).toBeCloseTo(26, 6)
  // …and back is exactly half of forward however the factor moves.
  expect(WALK_BACK_SPEED * 2).toBeCloseTo(WALK_SPEED, 6)

  const s = createLocomotion(flat, 0, 0, NORTH)
  updateLocomotion(s, flat, { walk: 1, turn: 0, jump: false }, FRAME_SECONDS)
  expect(s.z).toBeCloseTo(52 * WALK_SCALE, 6)
  expect(s.clip).toBe(ANIM.RUN)

  updateLocomotion(s, flat, { walk: -1, turn: 0, jump: false }, FRAME_SECONDS)
  expect(s.z).toBeCloseTo((52 - 26) * WALK_SCALE, 6)
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
  const s = createLocomotion(face, 0, lipOf(), NORTH)
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
  s.airborne = { vx: 0, vy: 2000, vz: 0, bouncing: false, pushIn: null }
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
  const s = createLocomotion(face, 0, lipOf(), NORTH)
  run(s, face, { walk: 1 }, 6 * FRAME_SECONDS)
  expect(s.bounciness.restitution).toBeGreaterThan(RESTITUTION_FREE)
})

test('a jump crouches first, then leaves straight UP and pushes forward', () => {
  // The exe's launch (0x46c199) is pitch 0x400 — vertical, at |nDist|/2 +
  // 0x30 — and the forward half is a separate impulse the pig update adds on
  // the third frame of the fall (0x46e943). Standing still, that is 48 up
  // and then 48 out; running, 74 up and the same 48 out.
  //
  // But NOT on the frame the key is pressed. `TryJump` only starts the
  // wind-up clip, and the launch happens when its one pass runs out
  // (0x46e8e2 calls StartFalling) — so the crouch comes first and the pig
  // goes nowhere during it.
  const flat = terrain(() => 0)
  const s = createLocomotion(flat, 0, 0, NORTH)
  updateLocomotion(s, flat, { walk: 0, turn: 0, jump: true }, FRAME_SECONDS)
  expect(s.airborne, 'the crouch comes first').toBeNull()
  expect(s.clip).toBe(ANIM.JUMP_START)
  expect(s.windUp).toBeGreaterThan(0)
  // Committed: driving through the wind-up moves and turns nothing.
  run(s, flat, { walk: 1, turn: 1 }, JUMP_WINDUP - 3 * FRAME_SECONDS)
  expect(s.airborne, 'still crouched').toBeNull()
  expect(s.z, 'the crouch goes nowhere').toBe(0)
  expect(s.heading, 'and turns nowhere').toBe(NORTH)

  run(s, flat, {}, JUMP_WINDUP, (t) => t.airborne !== null)
  expect(s.airborne).not.toBeNull()
  expect(s.airborne!.vy).toBeCloseTo(-JUMP_SPEED)
  expect(s.airborne!.vz, 'no forward speed out of the ground').toBe(0)
  expect(s.clip).toBe(ANIM.JUMP_MIDDLE)
  expect(s.jumpReadyIn).toBeGreaterThan(0)

  // Two more frames and it is still going straight up; the third pushes.
  run(s, flat, {}, JUMP_PUSH_DELAY - FRAME_SECONDS)
  expect(s.airborne!.vz).toBe(0)
  run(s, flat, {}, FRAME_SECONDS)
  expect(s.airborne!.vz, 'the delayed push, less one frame of bleed').toBeGreaterThan(JUMP_PUSH * 0.9)
  expect(s.airborne!.vz).toBeLessThanOrEqual(JUMP_PUSH)

  // Landing comes back to rest on open ground, and the cooldown gates the
  // next hop: not before it has run out, then freely.
  run(s, flat, {}, 3, (t) => t.airborne === null)
  expect(s.airborne).toBeNull()
  // And it gets UP: the landing hands over the clip the exe asks for there,
  // once (0x470944).
  expect(s.clip).toBe(ANIM.LAND)

  // The cooldown gates the next hop. With the wind-up in the way a refused
  // jump and an accepted one both leave `airborne` null on the frame the key
  // is pressed, so what separates them is whether the crouch STARTED.
  if (s.jumpReadyIn > 0) {
    updateLocomotion(s, flat, { walk: 0, turn: 0, jump: true }, FRAME_SECONDS)
    expect(s.windUp, 'refused while recharging').toBe(0)
  }
  run(s, flat, {}, 1)
  updateLocomotion(s, flat, { walk: 0, turn: 0, jump: true }, FRAME_SECONDS)
  expect(s.windUp, 'recharged').toBeGreaterThan(0)
  run(s, flat, {}, JUMP_WINDUP + FRAME_SECONDS, (t) => t.airborne !== null)
  expect(s.airborne, 'and left the ground').not.toBeNull()
})

test('a RUN-UP does not crouch — it leaves on the frame it is asked', () => {
  // The dispatcher branches on the step it was handed (0x46c220): forward
  // motion goes straight to StartFalling, everything else crouches. So the
  // crouch is the standing hop's, and a run-up has none.
  const flat = terrain(() => 0)
  const s = createLocomotion(flat, 0, 0, NORTH)
  updateLocomotion(s, flat, { walk: 1, turn: 0, jump: true }, FRAME_SECONDS)
  expect(s.airborne, 'in the air at once').not.toBeNull()
  expect(s.windUp).toBe(0)
  expect(s.clip).toBe(ANIM.JUMP_MIDDLE)

  // Backing away is `nDist <= 0` like standing, so it crouches.
  const back = createLocomotion(flat, 0, 0, NORTH)
  updateLocomotion(back, flat, { walk: -1, turn: 0, jump: true }, FRAME_SECONDS)
  expect(back.airborne).toBeNull()
  expect(back.windUp).toBeGreaterThan(0)
})

test('a running jump leaves faster, by half its walking step', () => {
  // The stride is taken when the key is pressed. It only MATTERS for the
  // crouching kinds, where by launch time the pig has been standing still
  // for the whole wind-up — a launch read off the speed at that moment would
  // always be the standing one.
  const leap = (walk: number): LocomotionState => {
    const flat = terrain(() => 0)
    const s = createLocomotion(flat, 0, 0, NORTH)
    updateLocomotion(s, flat, { walk, turn: 0, jump: true }, FRAME_SECONDS)
    // A run-up is already off the ground; only the crouching kinds need the
    // wind-up riding out, and a frame of flight would bend the launch speed.
    if (!s.airborne) run(s, flat, {}, JUMP_WINDUP + FRAME_SECONDS, (t) => t.airborne !== null)
    return s
  }
  expect(leap(1).airborne!.vy).toBeCloseTo(-(JUMP_SPEED + (WALK_SPEED / 2) * JUMP_RISE))
  expect(leap(-1).airborne!.vy).toBeCloseTo(-(JUMP_SPEED + (WALK_BACK_SPEED / 2) * JUMP_RISE))
  expect(leap(0).airborne!.vy).toBeCloseTo(-JUMP_SPEED)
})

test('the get-up plays out when a pig is left alone, and not when it is driven', () => {
  const flat = terrain(() => 0)
  const land = (): LocomotionState => {
    const s = createLocomotion(flat, 0, 0, NORTH)
    updateLocomotion(s, flat, { walk: 0, turn: 0, jump: true }, FRAME_SECONDS)
    run(s, flat, {}, 3, (t) => t.airborne === null && t.getUp > 0)
    expect(s.airborne, 'down').toBeNull()
    return s
  }

  // Left alone it holds for one pass of the clip, and it is a COMMITTED one:
  // the renderer plays it through rather than looping it.
  const still = land()
  expect(still.clip).toBe(ANIM.LAND)
  expect(still.commit).toBe(true)
  run(still, flat, {}, GET_UP - 2 * FRAME_SECONDS)
  expect(still.clip, 'still getting up').toBe(ANIM.LAND)
  run(still, flat, {}, 2 * FRAME_SECONDS + FRAME_SECONDS)
  expect(still.getUp).toBe(0)
  expect(still.clip, 'and then it is just standing').toBe(ANIM.IDLE)
  expect(still.commit).toBe(false)

  // Driven, it is gone on the very next frame — the picker's clip request
  // overwrites the landing's outright (0x472320).
  const driven = land()
  updateLocomotion(driven, flat, { walk: 1, turn: 0, jump: false }, FRAME_SECONDS)
  expect(driven.getUp).toBe(0)
  expect(driven.clip).toBe(ANIM.RUN)
  expect(driven.commit).toBe(false)
})

test('falling pulls at GRAVITY from rest and stops accelerating at the cap', () => {
  // The pig's force generator is `(320 - v)/32` a frame, not a constant: at
  // rest that is exactly the flat gravity every other body gets, and far
  // enough down it is nothing at all.
  // Game space is Y-down, so a long fall means starting far ABOVE flat
  // ground: a smaller y.
  const flat = terrain(() => 0)
  const s = createLocomotion(flat, 0, 0, NORTH)
  s.y = -400_000
  s.airborne = { vx: 0, vy: 0, vz: 0, bouncing: false, pushIn: null }
  updateLocomotion(s, flat, { walk: 0, turn: 0, jump: false }, FRAME_SECONDS)
  expect(s.airborne!.vy, 'the first frame is plain gravity').toBeCloseTo(GRAVITY * FRAME_SECONDS)
  run(s, flat, {}, 10)
  const terminal = s.airborne!.vy
  expect(terminal, 'well short of a constant pull for ten seconds').toBeLessThan(GRAVITY * 2)
  run(s, flat, {}, 5)
  // A coarser logic frame integrates the cap slightly differently: 3839
  // against 3831, a fifth of a percent.
  expect(s.airborne!.vy, 'settled').toBeCloseTo(terminal, -2)
  expect(s.airborne, 'still falling').not.toBeNull()
})

test('the horizontal bleeds while the fall does not', () => {
  // The force's target has no sideways part, so the same 32 frames that cap
  // the fall drag the travel to nothing — a pig thrown off a cliff stops
  // going anywhere long before it lands.
  const flat = terrain(() => 0)
  const s = createLocomotion(flat, 0, 0, NORTH)
  s.y = -400_000
  s.airborne = { vx: 0, vy: 0, vz: 3000, bouncing: false, pushIn: null }
  // Two seconds, not one: the bleed is 32 FRAMES, and a frame is twice as
  // long as it was (ballistics.ts, FRAME_SECONDS).
  run(s, flat, {}, 2)
  expect(s.airborne!.vz).toBeLessThan(3000 * 0.5)
  expect(s.airborne!.vz).toBeGreaterThan(0)
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
