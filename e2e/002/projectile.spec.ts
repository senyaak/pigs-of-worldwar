// PHASE 002 (domain) — what a gun throws. Pure, no Electron.
//
// A projectile is a speed and a lifetime in frames, out of the 40-byte row per
// kind at 0x4c2030 and the switch at 0x4320d5. Nothing stores a RANGE — it is
// those two multiplied. `weapons/fire.md`.

import { test, expect } from '@playwright/test'

import { FRAME_SECONDS } from '../../src/lib/game/ballistics'
import { AIM_UNITS } from '../../src/lib/game/aim'
import {
  advanceShot,
  fireShot,
  isGun,
  projectileOf,
  rangeOf,
  spentShot
} from '../../src/lib/game/projectile'

test('a gun is a gun and a grenade is not', { tag: '@nodata' }, () => {
  expect(isGun(7)).toBe(true)
  expect(isGun(11)).toBe(true)
  // 3 BAYONET swings, 19 GRENADE has a power gauge — neither belongs here.
  expect(isGun(3)).toBe(false)
  expect(isGun(19)).toBe(false)
  expect(isGun(null)).toBe(false)
})

test('the sniper rifle reaches three times as far, on the same speed', { tag: '@nodata' }, () => {
  const rifle = projectileOf(7)!
  const sniper = projectileOf(11)!
  expect(rifle.speed).toBe(sniper.speed)
  expect(sniper.life).toBe(rifle.life * 3)
  expect(rangeOf(sniper)).toBeCloseTo(rangeOf(rifle) * 3)
  // 300 a frame for thirty frames is 9000 units, some seventeen tiles.
  expect(rangeOf(rifle)).toBeCloseTo(9000)
})

test('a level shot goes straight out along the pig facing', { tag: '@nodata' }, () => {
  // Heading 0 is +z, the same forward every step a pig takes uses.
  const shot = fireShot(7, { x: 100, y: -50, z: 200 }, 0, 0)!
  expect(shot.vx).toBeCloseTo(0)
  expect(shot.vy).toBeCloseTo(0)
  expect(shot.vz).toBeGreaterThan(0)
  advanceShot(shot, FRAME_SECONDS)
  expect(shot.z).toBeCloseTo(500) // 300 exe units in one frame
  expect(shot.y).toBeCloseTo(-50)
})

test('aiming UP sends it up — y counts DOWN in this space', { tag: '@nodata' }, () => {
  const up = fireShot(7, { x: 0, y: 0, z: 0 }, 0, AIM_UNITS / 8)! // 45 degrees
  expect(up.vy).toBeLessThan(0)
  expect(Math.abs(up.vy)).toBeCloseTo(up.vz)
  const down = fireShot(7, { x: 0, y: 0, z: 0 }, 0, -AIM_UNITS / 8)!
  expect(down.vy).toBeGreaterThan(0)
})

test('it expires by FRAMES, which is the only range there is', { tag: '@nodata' }, () => {
  const shot = fireShot(7, { x: 0, y: 0, z: 0 }, 0, 0)!
  for (let frame = 0; frame < 29; frame++) advanceShot(shot, FRAME_SECONDS)
  expect(spentShot(shot)).toBe(false)
  advanceShot(shot, FRAME_SECONDS)
  expect(spentShot(shot)).toBe(true)
  expect(shot.z).toBeCloseTo(rangeOf(projectileOf(7)!))
})

test('a long frame does not let a bullet outlive its range', { tag: '@nodata' }, () => {
  const shot = fireShot(12, { x: 0, y: 0, z: 0 }, 0, 0)! // fifteen frames
  advanceShot(shot, FRAME_SECONDS * 20)
  expect(spentShot(shot)).toBe(true)
})

test('nothing that is not a gun fires', { tag: '@nodata' }, () => {
  expect(fireShot(3, { x: 0, y: 0, z: 0 }, 0, 0)).toBeNull()
})
