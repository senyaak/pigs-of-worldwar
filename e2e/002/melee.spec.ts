// PHASE 002 (domain) — the bayonet swing. Pure, no Electron.
//
// What these pin is the shape the exe gave it: a ten-frame wind-up before the
// clip, four strikes over four consecutive frames of it, one hit per body per
// swing, and a box that only catches what is in front.
// `weapons/melee.md` is the read.

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
  struck
} from '../../src/lib/game/melee'

const BAYONET = 3
/** Clip 22 is 36 frames; at the flat 25 the renderer plays everything at. */
const SWING_SECONDS = 36 / 25

test('only the five hand-to-hand skills swing', { tag: '@nodata' }, () => {
  for (const skill of [1, 2, 3, 4, 5]) expect(meleeOf(skill)).not.toBeNull()
  // A rifle, a grenade, empty hands: nothing to swing.
  for (const skill of [0, 6, 7, 19, 29, 65]) expect(meleeOf(skill)).toBeNull()
  expect(meleeOf(null)).toBeNull()
})

test('the bayonet reaches furthest and hits softest', { tag: '@nodata' }, () => {
  const bayonet = meleeOf(BAYONET)!
  const sword = meleeOf(4)!
  expect(bayonet.clip).toBe(22)
  expect(bayonet.damage).toBe(10)
  expect(bayonet.reach.z).toBeGreaterThan(sword.reach.z)
  expect(bayonet.damage).toBeLessThan(sword.damage)
})

test('the blade is sampled along its length, halved toward zero', { tag: '@nodata' }, () => {
  const points = strikeOffsets(meleeOf(BAYONET)!)
  expect(points).toEqual([
    { x: 32, y: 40, z: 460 },
    { x: 16, y: 20, z: 230 },
    { x: 0, y: 0, z: 0 }
  ])
})

test('nothing happens for ten frames, and then the clip goes on', { tag: '@nodata' }, () => {
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

test('four strikes, the first with a whoosh and the last a release', { tag: '@nodata' }, () => {
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

test('the strikes fall in the first half of the clip, four frames apart', { tag: '@nodata' }, () => {
  const phases = STRIKE_PHASES[22]
  const frames = phases.map((phase) => Math.round((phase / PHASE_UNITS) * 36))
  expect(frames).toEqual([11, 12, 13, 14])
})

test('a body in front, within the box, is struck', { tag: '@nodata' }, () => {
  const points = [{ x: 0, y: 0, z: 400 }]
  const attacker = { x: 0, z: 0, heading: 0 }
  expect(struck(points, attacker, { x: 0, y: 0, z: 400 })).toBe(true)
  // Just inside each face of the box, and just outside it.
  expect(struck(points, attacker, { x: STRIKE_SPREAD - 1, y: 0, z: 400 })).toBe(true)
  expect(struck(points, attacker, { x: STRIKE_SPREAD, y: 0, z: 400 })).toBe(false)
  expect(struck(points, attacker, { x: 0, y: STRIKE_RISE - 1, z: 400 })).toBe(true)
  expect(struck(points, attacker, { x: 0, y: STRIKE_RISE, z: 400 })).toBe(false)
})

test('the vertical hardly refuses at all, and that is the exe', { tag: '@nodata' }, () => {
  // 360 against a pig 320 tall: anything within a body height of the blade is
  // caught. It is why the aim angle would decide almost nothing even if the
  // strike read it — and it does not read it (lib/game/melee.ts).
  expect(STRIKE_RISE).toBeGreaterThan(320)
  const blade = [{ x: 0, y: 0, z: 460 }]
  const attacker = { x: 0, z: 0, heading: 0 }
  expect(struck(blade, attacker, { x: 0, y: -300, z: 460 })).toBe(true)
  expect(struck(blade, attacker, { x: 0, y: -500, z: 460 })).toBe(false)
})

test('and a body behind the pig is not, however close the blade', { tag: '@nodata' }, () => {
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
