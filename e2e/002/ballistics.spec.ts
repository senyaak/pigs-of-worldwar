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
  SLIDE_STOP,
  bounceSpeed,
  easeBounciness,
  slide
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

test('a landed pig slides on, and a pig off a wall slides furthest', () => {
  // Friction is the fraction a frame takes off, so the wedged pig — the
  // slippery one — keeps more of its speed at every step.
  const free = slide(1000, FRICTION_FREE, FRAME_SECONDS)
  const wedged = slide(1000, FRICTION_STUCK, FRAME_SECONDS)
  expect(wedged).toBeGreaterThan(free)
  expect(free).toBeLessThan(1000)

  // Both stop: a slide is a slide, not perpetual motion.
  expect(slide(1000, FRICTION_STUCK, 1)).toBeLessThan(SLIDE_STOP)
})

test('a jump costs a cooldown, and it is shorter than being wedged', () => {
  // 15 frames of recharge against the 25 a wall takes to give up on you.
  expect(JUMP_COOLDOWN_SECONDS).toBeCloseTo(15 * FRAME_SECONDS)
  expect(JUMP_COOLDOWN_SECONDS).toBeLessThan(EJECT_SECONDS)
  expect(JUMP_COOLDOWN_SECONDS).toBeGreaterThan(0)
})
