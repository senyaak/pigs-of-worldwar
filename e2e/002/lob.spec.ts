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
  SKIPS_ON_WATER,
  advanceLob,
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
  sunk: false
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

test('it keeps almost all of its ROLL — friction is 0.12, not 0.9998', () => {
  // Play: "в игре граната всё время хоть чуть-чуть да катится."
  const shot = dropped(1000, 4000)
  bounceLob(shot, 0, UP, 0, false, lobBounce(ROW))
  const bite = ROW.friction * TILE_MATERIALS[0].friction
  expect(shot.vx).toBeCloseTo(4000 * (1 - bite), 3)
  expect(bite).toBeCloseTo(0.12, 2)
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

test('the water gate is the DROP, not the speed — which is why it sank', () => {
  // A grenade sliding across a pond keeps a big total speed for ever, so a
  // total-speed gate never let it go in and play saw it stuck on the surface.
  const sliding = dropped(0, 5000)
  expect(SKIPS_ON_WATER(sliding)).toBe(false)
  const arriving = dropped(BOUNCE_CUTOFF * 2, 5000)
  expect(SKIPS_ON_WATER(arriving)).toBe(true)
})

test('a flat throw at water SKIPS and then goes under', () => {
  // The frog, and the numbers bound it: a grenade arriving off hand height has
  // about 1900 a second of drop, each hop keeps 0.32 of that, and the engine's
  // own "too slow to bounce" bar is 750. So it is a hop or two — long ones,
  // several tiles apiece at throwing speed — and then it is under. Not a dozen.
  const shot = dropped(0, 4000)
  shot.y = -200
  let skips = 0
  for (let frame = 0; frame < 200 && skips < 20; frame++) {
    advanceLob(shot, 1 / 30)
    if (shot.y < 0) continue
    if (SKIPS_ON_WATER(shot)) {
      bounceLob(shot, 0, UP, 0, false, lobBounce(ROW))
      skips++
      continue
    }
    sinkLob(shot, 1 / 30)
    break
  }
  expect(skips).toBeGreaterThan(0)
  expect(skips).toBeLessThan(5)
  expect(shot.sunk).toBe(true)
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
