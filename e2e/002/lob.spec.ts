// PHASE 002 (domain) — how a thrown thing MEETS a surface. Pure, no Electron.
//
// This exists because the numbers behind it were wrong for four passes and play
// caught it every time: "граната не должна прыгать как на батуте", "о сушу
// прыгает как от воды". The old pair came from three consecutive words on a
// segment-test record and read as restitution 0.9998; the real one is the
// projectile row's own +0x20/+0x22, multiplied by the tile's.
//
// `../../../pigs-disasm/weapons/fire.md`.

import { test, expect } from '@playwright/test'

import { BOUNCE_CUTOFF, TILE_MATERIALS } from '../../src/lib/game/ballistics'
import {
  WATER_DOUSE_SPEED,
  advanceLob,
  dousedByWater,
  bounceLob,
  lobBounce,
  lobOf,
  lobSurface,
  sinkLob
} from '../../src/lib/game/grenade'
import type { Lobbed } from '../../src/lib/game/grenade'

const GRENADE = 19
const ROW = lobOf(GRENADE)!
/** Straight up out of the ground, in game space where +y is down. */
const UP = { x: 0, y: -1, z: 0 }

const dropped = (vy: number, vx = 0): Lobbed => ({
  skill: GRENADE,
  x: 0,
  y: 0,
  z: 0,
  vx,
  vy,
  vz: 0,
  fuse: 5,
  resting: false,
  sunk: false,
  doused: false
})

test('a grenade brings its own material, and it is not near-elastic', () => {
  // Row +0x20 and +0x22 of the projectile table: 0.30 and 0.80.
  expect(ROW.friction).toBeCloseTo(0.3, 3)
  expect(ROW.restitution).toBeCloseTo(0.8, 3)
  // Skill 26's kind is the odd one — it does not bounce at all, it sticks.
  expect(lobOf(26)!.restitution).toBeCloseTo(0.001, 3)
})

test('the surface multiplies its half in, so grass is not stone', () => {
  // The solver's combine is a plain product of the two bodies' pairs
  // (0x40f690), which is why the tile matters at all.
  const grass = lobSurface(0)
  expect(grass).toEqual(TILE_MATERIALS[0])
  const shot = dropped(1000)
  bounceLob(shot, 0, UP, 0, false, lobBounce(ROW))
  // 0.80 * 0.40 = 0.32 — a third of the drop comes back, and NOT the whole of
  // it, which is the trampoline play kept seeing.
  expect(-shot.vy).toBeCloseTo(1000 * ROW.restitution * grass.restitution, 3)
  expect(-shot.vy / 1000).toBeCloseTo(0.32, 2)
})

test('the same throw on a different tile bounces differently', () => {
  // Tile 4 is the dead one: restitution 0.10 against grass's 0.40.
  const soft = dropped(1000)
  bounceLob(soft, 0, UP, 4, false, lobBounce(ROW))
  const grass = dropped(1000)
  bounceLob(grass, 0, UP, 0, false, lobBounce(ROW))
  expect(-soft.vy).toBeLessThan(-grass.vy / 3)
})

test('friction is a Coulomb IMPULSE, capped by the normal one', () => {
  // The solver normalises the tangential and takes the friction product in as a
  // scalar (0x4110c1, 0x40f980), with restitution entering as (1 + e). So what
  // comes off the slide is mu * (1 + e) * |vn| — bounded by the contact, not a
  // fraction of how fast it is sliding.
  const shot = dropped(1000, 4000)
  bounceLob(shot, 0, UP, 0, false, lobBounce(ROW))
  const mu = ROW.friction * TILE_MATERIALS[0].friction
  const e = ROW.restitution * TILE_MATERIALS[0].restitution
  expect(mu).toBeCloseTo(0.12, 2)
  expect(shot.vx).toBeCloseTo(4000 - mu * (1 + e) * 1000, 3)
})

test('...which is why it ROLLS — play: "гранаты не катаются совсем"', () => {
  // At rest on flat ground the contact carries only gravity's own increment, so
  // the friction impulse available each frame is tiny. A flat fraction of the
  // slide took an eighth off every frame regardless and stopped it dead.
  const shot = dropped(0, 4000)
  for (let frame = 0; frame < 30; frame++) {
    advanceLob(shot, 1 / 30)
    if (shot.y >= 0) bounceLob(shot, 0, UP, 0, false, lobBounce(ROW))
  }
  // A whole second later it is still going, and going most of its old speed.
  expect(shot.vx).toBeGreaterThan(4000 * 0.6)
  // …and the old law would have left it under a tenth of that.
  expect(4000 * Math.pow(1 - 0.12, 30)) .toBeLessThan(4000 * 0.05)
})

test('a contact already leaving is not resolved twice', () => {
  // The scene sub-steps by the grenade's own size, so the same contact comes
  // back several frames running; taking friction off each time is what used to
  // eat the roll.
  const shot = dropped(-500, 4000)
  bounceLob(shot, 0, UP, 0, false, lobBounce(ROW))
  expect(shot.vx).toBe(4000)
  expect(shot.vy).toBe(-500)
})

test('water is a PASS-THROUGH: it splashes and keeps going down', () => {
  // The engine's surface handler drops a splash at the water line and touches
  // the thrown thing's velocity nowhere (0x437a57). So there is no gate to pass
  // and nothing to bounce off — play was blunt about it: "граната НЕ ТОНЕТ В
  // ВОДЕ, должна прям тонуть и идти вниз."
  const shot = dropped(0, 4000)
  for (let frame = 0; frame < 30; frame++) {
    advanceLob(shot, 1 / 30)
    if (shot.y >= 0) sinkLob(shot, 1 / 30)
  }
  expect(shot.sunk).toBe(true)
  // Still going DOWN, and further every frame.
  expect(shot.vy).toBeGreaterThan(0)
  expect(shot.y).toBeGreaterThan(0)
  // …and its sideways travel has been damped away, so it does not slide off.
  expect(shot.vx).toBeLessThan(4000 / 10)
})

test('and once it is in and slow, water DOUSES it — no blast', () => {
  // Play half-remembered this and was right. The arm at 0x437bfb sets the
  // projectile's quiet flag, and the destructor's first test then spawns nothing
  // and plays nothing (0x4328c9). The bar is 150 a frame (0x437c8c).
  const slow = dropped(0, 0)
  expect(dousedByWater(slow)).toBe(true)
  const fast = dropped(WATER_DOUSE_SPEED * 2, 0)
  expect(dousedByWater(fast)).toBe(false)
  // A grenade sinking under its own weight is slow long before it reaches a bed.
  const sinking = dropped(0, 4000)
  for (let frame = 0; frame < 10; frame++) {
    advanceLob(sinking, 1 / 30)
    sinkLob(sinking, 1 / 30)
  }
  expect(dousedByWater(sinking)).toBe(true)
})

test('a sunk grenade keeps FALLING — the vertical is left to gravity', () => {
  // Damping the vertical too is what left one standing on the water.
  const shot = dropped(200, 3000)
  sinkLob(shot, 1 / 30)
  expect(shot.vy).toBe(200)
  expect(shot.vx).toBeLessThan(3000)
  advanceLob(shot, 1 / 30)
  expect(shot.y).toBeGreaterThan(0)
})
