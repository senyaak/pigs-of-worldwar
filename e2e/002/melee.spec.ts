// PHASE 002 (domain) — the bayonet swing. Pure, no Electron.
//
// What these pin is the shape the exe gave it: a ten-frame wind-up before the
// clip, four strikes over four consecutive frames of it, one hit per body per
// swing, and a box that only catches what is in front.
// `../../../pigs-disasm/weapons/melee.md` is the read.

import { test, expect } from '@playwright/test'

import { FRAME_SECONDS } from '../../src/lib/game/ballistics'
import {
  PHASE_UNITS,
  STRIKE_ARC,
  STRIKE_PHASES,
  STRIKE_RISE,
  STRIKE_SPREAD,
  SWING_DELAY,
  SWING_DELAY_FRAMES,
  advanceSwing,
  beginSwing,
  meleeOf,
  strikeOffsets,
  struck,
  tiltStrike
} from '../../src/lib/game/melee'

const BAYONET = 3
/** Clip 22 is 36 frames; at the flat 25 the renderer plays everything at. */
const SWING_SECONDS = 36 / 25

test('only the five hand-to-hand skills swing', () => {
  for (const skill of [1, 2, 3, 4, 5]) expect(meleeOf(skill)).not.toBeNull()
  // A rifle, a grenade, empty hands: nothing to swing.
  for (const skill of [0, 6, 7, 19, 29, 65]) expect(meleeOf(skill)).toBeNull()
  expect(meleeOf(null)).toBeNull()
})

test('the bayonet reaches furthest and hits softest', () => {
  const bayonet = meleeOf(BAYONET)!
  const sword = meleeOf(4)!
  expect(bayonet.clip).toBe(22)
  expect(bayonet.damage).toBe(10)
  expect(bayonet.reach.z).toBeGreaterThan(sword.reach.z)
  expect(bayonet.damage).toBeLessThan(sword.damage)
})

test('the blade is sampled along its length, halved toward zero', () => {
  const points = strikeOffsets(meleeOf(BAYONET)!)
  expect(points).toEqual([
    { x: 32, y: 40, z: 460 },
    { x: 16, y: 20, z: 230 },
    { x: 0, y: 0, z: 0 }
  ])
})

test('nothing happens for ten frames, and then the clip goes on', () => {
  const swing = beginSwing(BAYONET, SWING_SECONDS)!
  expect(SWING_DELAY).toBeCloseTo(SWING_DELAY_FRAMES * FRAME_SECONDS)
  let frames = 0
  let events = advanceSwing(swing, FRAME_SECONDS)
  while (!events.includes('start')) {
    expect(events).toEqual([])
    frames++
    expect(frames).toBeLessThan(20)
    events = advanceSwing(swing, FRAME_SECONDS)
  }
  expect(frames + 1).toBe(SWING_DELAY_FRAMES)
})

test('four strikes, the first with a whoosh and the last a release', () => {
  const swing = beginSwing(BAYONET, SWING_SECONDS)!
  const seen: string[] = []
  // Two seconds is well past the wind-up plus the clip.
  for (let frame = 0; frame < 40; frame++) seen.push(...advanceSwing(swing, FRAME_SECONDS))
  expect(seen.filter((e) => e === 'strike')).toHaveLength(STRIKE_PHASES[22].length)
  expect(seen.filter((e) => e === 'strike')).toHaveLength(4)
  expect(seen.filter((e) => e === 'whoosh')).toHaveLength(1)
  expect(seen.filter((e) => e === 'release')).toHaveLength(1)
  expect(seen.indexOf('whoosh')).toBeLessThan(seen.indexOf('strike'))
  expect(seen.lastIndexOf('release')).toBeLessThan(seen.indexOf('done'))
  expect(seen.filter((e) => e === 'done')).toHaveLength(1)
})

test('the strikes fall in the first half of the clip, four frames apart', () => {
  const phases = STRIKE_PHASES[22]
  const frames = phases.map((phase) => Math.round((phase / PHASE_UNITS) * 36))
  expect(frames).toEqual([11, 12, 13, 14])
})

test('a body in front, within the box, is struck', () => {
  const points = [{ x: 0, y: 0, z: 400 }]
  const attacker = { x: 0, z: 0, heading: 0 }
  expect(struck(points, attacker, { x: 0, y: 0, z: 400 })).toBe(true)
  // Just inside each face of the box, and just outside it.
  expect(struck(points, attacker, { x: STRIKE_SPREAD - 1, y: 0, z: 400 })).toBe(true)
  expect(struck(points, attacker, { x: STRIKE_SPREAD, y: 0, z: 400 })).toBe(false)
  expect(struck(points, attacker, { x: 0, y: STRIKE_RISE - 1, z: 400 })).toBe(true)
  expect(struck(points, attacker, { x: 0, y: STRIKE_RISE, z: 400 })).toBe(false)
})

// The tilt is the remake's own — the exe pins the bayonet's angle to zero and
// its strike never reads it — so these pin the geometry rather than the exe.
test('aiming up lifts the blade and aiming down drops it', () => {
  const hand = { x: 0, y: 0, z: 0 }
  const tip = [{ x: 0, y: 0, z: 460 }]
  // Game space is Y-DOWN, so up is a smaller y.
  const up = tiltStrike(tip, hand, 0, Math.PI / 4)[0]
  const down = tiltStrike(tip, hand, 0, -Math.PI / 4)[0]
  expect(up.y).toBeCloseTo(-325, 0)
  expect(down.y).toBeCloseTo(325, 0)
  // …and it swings about the hand, so the blade keeps its length.
  expect(Math.hypot(up.y, up.z)).toBeCloseTo(460)
  expect(up.z).toBeCloseTo(325, 0)
})

test('the tilt follows the pig round, and level changes nothing', () => {
  const hand = { x: 0, y: 0, z: 0 }
  // Facing +x: the blade is out along +x and should still rise, not slew.
  const tip = [{ x: 460, y: 0, z: 0 }]
  const up = tiltStrike(tip, hand, Math.PI / 2, Math.PI / 4)[0]
  expect(up.y).toBeCloseTo(-325, 0)
  expect(up.x).toBeCloseTo(325, 0)
  expect(up.z).toBeCloseTo(0, 6)
  // A level weapon is left exactly alone.
  expect(tiltStrike(tip, hand, 1.234, 0)[0]).toEqual(tip[0])
})

test('a tilted bayonet reaches a body the level one misses', () => {
  const hand = { x: 0, y: 0, z: 0 }
  const blade = [{ x: 0, y: 0, z: 460 }, { x: 0, y: 0, z: 230 }, hand]
  const attacker = { x: 0, z: 0, heading: 0 }
  // A body 500 above the hand — game space is Y-down. It has to be that far
  // up for the tilt to decide anything, and that is the exe's doing: its
  // vertical tolerance is STRIKE_RISE, 360, against a pig only 320 tall, so
  // anything within a body height of the blade is caught level or not.
  expect(STRIKE_RISE).toBeGreaterThan(320)
  const above = { x: 0, y: -500, z: 325 }
  expect(struck(blade, attacker, above)).toBe(false)
  expect(struck(tiltStrike(blade, hand, 0, Math.PI / 4), attacker, above)).toBe(true)
})

test('and a body behind the pig is not, however close the blade', () => {
  // Same point, but the attacker is looking the other way: the bearing test
  // is what refuses it (0x475ff9).
  const points = [{ x: 0, y: 0, z: 400 }]
  expect(struck(points, { x: 0, z: 0, heading: Math.PI }, { x: 0, y: 0, z: 400 })).toBe(false)
  // Just inside the 67.5° cone and just outside it, at the same distance.
  const on = STRIKE_ARC - 0.01
  const off = STRIKE_ARC + 0.01
  const at = (angle: number): { x: number; y: number; z: number } => ({
    x: Math.sin(angle) * 400,
    y: 0,
    z: Math.cos(angle) * 400
  })
  const spread = [{ x: 0, y: 0, z: 0 }, ...[on, off].map(at)]
  expect(struck(spread, { x: 0, z: 0, heading: 0 }, at(on))).toBe(true)
  expect(struck(spread, { x: 0, z: 0, heading: 0 }, at(off))).toBe(false)
})
