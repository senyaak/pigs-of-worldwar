// PHASE 002 (domain) — coming off a wall. Pure, no Electron.
//
// The numbers are the exe's own fixed-point pair (0x400/0xa66 free,
// 0x266/0xd99 wedged) and its 25-frame patience; what these pin is that a
// pig pressed into a wall becomes bouncier the longer it is stuck, and stays
// that way until it lands.

import { test, expect } from '@playwright/test'

import {
  EJECT_SECONDS,
  JUMP_COOLDOWN_SECONDS,
  FRAME_SECONDS,
  FREE,
  RESTITUTION_FREE,
  RESTITUTION_MIN,
  RESTITUTION_STUCK,
  FRICTION_FREE,
  FRICTION_STUCK,
  BOUNCE_CUTOFF,
  GROUND_FRICTION,
  GROUND_RESTITUTION,
  bounceOff,
  bounceSpeed,
  easeBounciness,
  slopePull
} from '../../src/lib/game/ballistics'

test('the wedged pig is the slippery one, and the free pig the grippy one', () => {
  expect(FRICTION_STUCK).toBeLessThan(FRICTION_FREE)
  expect(RESTITUTION_STUCK).toBeGreaterThan(RESTITUTION_FREE)
  expect(RESTITUTION_MIN).toBeLessThan(RESTITUTION_FREE)
})

test('pressed into a wall, a pig reaches full bounciness within a few frames', () => {
  let state = FREE
  for (let frame = 0; frame < 3; frame++) {
    state = easeBounciness(state, true, false, FRAME_SECONDS)
  }
  expect(state.restitution).toBeCloseTo(RESTITUTION_STUCK)
  expect(state.friction).toBeCloseTo(FRICTION_STUCK)
  // …and it took more than one frame to get there: the ramp is visible.
  expect(easeBounciness(FREE, true, false, FRAME_SECONDS).restitution).toBeLessThan(RESTITUTION_STUCK)
})

test('the bounciness survives the flight and only resets on landing', () => {
  const wedged = easeBounciness(easeBounciness(FREE, true, false, FRAME_SECONDS * 3), true, false, FRAME_SECONDS)
  // Thrown clear: in the air, nothing is reset.
  const flying = easeBounciness(wedged, false, false, FRAME_SECONDS)
  expect(flying.restitution).toBeCloseTo(RESTITUTION_STUCK)
  // Back on its feet: the ordinary values return.
  expect(easeBounciness(flying, false, true, FRAME_SECONDS)).toEqual(FREE)
})

test('a landing bounces in proportion to how bouncy the pig is, or not at all', () => {
  expect(bounceSpeed(1000, RESTITUTION_STUCK)).toBeGreaterThan(bounceSpeed(1000, RESTITUTION_FREE))
  expect(bounceSpeed(1000, RESTITUTION_MIN)).toBe(0)
  expect(bounceSpeed(1000, 0)).toBe(0)
})

test('a bounce is a hop, not a relaunch: it never returns most of the impact', () => {
  // The exe's `>> 3` is damping, not a unit conversion. Without it a pig
  // wedged at 0.85 keeps enough speed to sail off the map.
  expect(bounceSpeed(1000, RESTITUTION_STUCK)).toBeLessThan(1000 / 4)
  // And bounces die out instead of compounding.
  let speed = 1000
  for (let hop = 0; hop < 4; hop++) speed = bounceSpeed(speed, RESTITUTION_STUCK)
  expect(speed).toBeLessThan(1)
})

test('the eject waits under a second — the original waits 25 frames', () => {
  expect(EJECT_SECONDS).toBeCloseTo(25 * FRAME_SECONDS)
  expect(EJECT_SECONDS).toBeLessThan(1)
})

test('a jump costs a cooldown, and it is shorter than being wedged', () => {
  // 15 frames of recharge against the 25 a wall takes to give up on you.
  expect(JUMP_COOLDOWN_SECONDS).toBeCloseTo(15 * FRAME_SECONDS)
  expect(JUMP_COOLDOWN_SECONDS).toBeLessThan(EJECT_SECONDS)
  expect(JUMP_COOLDOWN_SECONDS).toBeGreaterThan(0)
})

test('a hit reflects across the normal and keeps what runs along the surface', () => {
  const FLAT = { x: 0, y: -1, z: 0 } // game space: up is -y
  const down = { x: 300, y: 900, z: 0 } // moving forward AND falling

  const hit = bounceOff(down, RESTITUTION_STUCK, 0, FLAT)
  // The normal part came back up — that is the bounce.
  expect(hit.y).toBeLessThan(0)
  // …and damped: a bounce is a hop, never a relaunch.
  expect(Math.abs(hit.y)).toBeLessThan(down.y)
  // The part along the surface is untouched by the impulse. This is the
  // whole answer to "does it add up": along the ground it carries, across
  // the ground it reflects.
  expect(hit.x).toBeCloseTo(down.x)
  expect(hit.z).toBeCloseTo(0)

  // Friction is what eats the tangential part, nothing else.
  expect(bounceOff(down, RESTITUTION_STUCK, 0.25 / GROUND_FRICTION, FLAT).x).toBeCloseTo(down.x * 0.75)

  // Already leaving the surface: no response at all.
  const up = { x: 300, y: -900, z: 0 }
  expect(bounceOff(up, RESTITUTION_STUCK, 0.25, FLAT)).toEqual(up)
})

test('gravity along a slope is what keeps a landed pig moving', () => {
  const FLAT = { x: 0, y: -1, z: 0 }
  // On the level there is nothing left over sideways: a pig stops.
  const level = slopePull(FLAT, 0, 5000, 0.1)
  expect(level.x).toBeCloseTo(0)
  expect(level.z).toBeCloseTo(0)

  // On a slope there is, and it points DOWN the slope — the +x side is the
  // low side of this normal, so the pull is +x.
  const tilt = Math.hypot(0.5, 1)
  const slope = { x: 0.5 / tilt, y: -1 / tilt, z: 0 }
  const pull = slopePull(slope, 0, 5000, 0.1)
  expect(pull.x).toBeGreaterThan(0)
  expect(pull.y).toBeGreaterThan(0)

  // And a steeper slope pulls harder, which is the acceleration you feel.
  const steeper = { x: 0.9 / Math.hypot(0.9, 1), y: -1 / Math.hypot(0.9, 1), z: 0 }
  expect(slopePull(steeper, 0, 5000, 0.1).x).toBeGreaterThan(pull.x)
})

test('friction holds a pig on gentle ground and lets go on steep', () => {
  const gentle = { x: 0.05 / Math.hypot(0.05, 1), y: -1 / Math.hypot(0.05, 1), z: 0 }
  // Shallower than the coefficient: nothing to slide down.
  expect(slopePull(gentle, FRICTION_FREE, 5000, 0.1)).toEqual({ x: 0, y: 0, z: 0 })
  // Steeper than it: away it goes — and the slippery, just-off-a-wall pig
  // lets go of ground the grippy one still holds.
  const middling = { x: 0.2 / Math.hypot(0.2, 1), y: -1 / Math.hypot(0.2, 1), z: 0 }
  expect(slopePull(middling, FRICTION_FREE, 5000, 0.1).x).toBe(0)
  expect(slopePull(middling, FRICTION_STUCK, 5000, 0.1).x).toBeGreaterThan(0)
})

test('the landing threshold is the exe own 25 a frame, not a number we liked', () => {
  // 0x4711d8: under 25 the impact handler gets the pig up, at or over it the
  // bounce runs. The exe counts per logic frame; we count per second.
  expect(BOUNCE_CUTOFF).toBeCloseTo(0x19 / FRAME_SECONDS)

  const FLAT = { x: 0, y: -1, z: 0 }
  const soft = { x: 0, y: BOUNCE_CUTOFF * 0.9, z: 0 }
  const hard = { x: 0, y: BOUNCE_CUTOFF * 1.1, z: 0 }
  expect(bounceOff(soft, RESTITUTION_STUCK, 0, FLAT).y, 'a soft landing lands').toBe(0)
  expect(bounceOff(hard, RESTITUTION_STUCK, 0, FLAT).y, 'a hard one comes back up').toBeLessThan(0)
})

test('the ground has a material too, and the solver multiplies by it', () => {
  // 0x414f50 builds the landscape body and gives it 0.2 / 0.7 through the
  // same setter the pig uses; 0x40f690 multiplies the pair.
  expect(GROUND_FRICTION).toBeCloseTo(0.2)
  expect(GROUND_RESTITUTION).toBeCloseTo(0.7)

  const FLAT = { x: 0, y: -1, z: 0 }
  const down = { x: 0, y: BOUNCE_CUTOFF * 4, z: 0 }
  const back = -bounceOff(down, RESTITUTION_FREE, 0, FLAT).y
  // The rebound is the pig's restitution AND the ground's, over the exe's 8.
  expect(back).toBeCloseTo((down.y / 8) * RESTITUTION_FREE * GROUND_RESTITUTION)
  // So ignoring the ground would have over-bounced by a third.
  expect(back).toBeLessThan((down.y / 8) * RESTITUTION_FREE)
})
