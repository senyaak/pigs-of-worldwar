// PHASE 002 (domain) — how a thrown thing MEETS a surface. Pure, no Electron.
//
// This exists because the numbers behind it were wrong for four passes and play
// caught it every time: "граната не должна прыгать как на батуте", "о сушу
// прыгает как от воды". The old pair came from three consecutive words on a
// segment-test record and read as restitution 0.9998; the real one is the
// projectile row's own +0x20/+0x22, multiplied by the tile's.
//
// `weapons/fire.md`.

import { test, expect } from '@playwright/test'

import { BOUNCE_CUTOFF, TILE_MATERIALS } from '../src/lib/game/ballistics'
import { STEP_SECONDS } from '../src/lib/game/engine'
import {
  WATER_DOUSE_SPEED,
  WATER_SINK_SECONDS,
  WATER_SINK_SPEED,
  advanceLob,
  douseInWater,
  dousedByWater,
  skipOffWater,
  skipsOnWater,
  bounceLob,
  lobBounce,
  lobOf,
  lobSurface,
  sinkLob,
  sunkAway
} from '../src/lib/game/grenade'
import type { Lobbed } from '../src/lib/game/grenade'

const GRENADE = 19
const ROW = lobOf(GRENADE)!
/** Straight up out of the ground, in game space where +y is down. */
const UP = { x: 0, y: -1, z: 0 }

const dropped = (vy: number, vx = 0): Lobbed => ({
  id: 0,
  skill: GRENADE,
  x: 0,
  y: 0,
  z: 0,
  vx,
  vy,
  vz: 0,
  fuse: 5,
  age: 0,
  resting: false,
  doused: false,
  sinking: 0
})

test('a grenade brings its own material, and it is not near-elastic', { tag: '@nodata' }, () => {
  // Row +0x20 and +0x22 of the projectile table: 0.30 and 0.80.
  expect(ROW.friction).toBeCloseTo(0.3, 3)
  expect(ROW.restitution).toBeCloseTo(0.8, 3)
  // The ROLLER's kind is the odd one — nothing bounces and nothing slows,
  // which is why it rolls (the skill→kind map is pinned in grenade.ts).
  expect(lobOf(22)!.restitution).toBeCloseTo(0.001, 3)
  expect(lobOf(22)!.friction).toBeCloseTo(0.001, 3)
})

test('the surface multiplies its half in, so grass is not stone', { tag: '@nodata' }, () => {
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

test('the same throw on a different tile bounces differently', { tag: '@nodata' }, () => {
  // Tile 4 is the dead one: restitution 0.10 against grass's 0.40.
  const soft = dropped(1000)
  bounceLob(soft, 0, UP, 4, false, lobBounce(ROW))
  const grass = dropped(1000)
  bounceLob(grass, 0, UP, 0, false, lobBounce(ROW))
  expect(-soft.vy).toBeLessThan(-grass.vy / 3)
})

test('friction is a Coulomb IMPULSE, capped by the normal one', { tag: '@nodata' }, () => {
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

test('...which is why it ROLLS — play: "гранаты не катаются совсем"', { tag: '@nodata' }, () => {
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

test('a contact already leaving is not resolved twice', { tag: '@nodata' }, () => {
  // The scene sub-steps by the grenade's own size, so the same contact comes
  // back several frames running; taking friction off each time is what used to
  // eat the roll.
  const shot = dropped(-500, 4000)
  bounceLob(shot, 0, UP, 0, false, lobBounce(ROW))
  expect(shot.vx).toBe(4000)
  expect(shot.vy).toBe(-500)
})

test('thrown FLAT it skips off water — the frog, and it is the engine own', { tag: '@nodata' }, () => {
  // 0x437e5d's last act is 0x4A9260(scalar/5, 0x400, 0, 0), and 0x400 of 4096 is
  // a quarter turn: a kick straight UP of a fifth of the speed along the surface.
  // Play insisted this existed and was right; the arm had been skimmed.
  const shot = dropped(0, 4000)
  expect(skipsOnWater(shot)).toBe(true)
  skipOffWater(shot)
  // Up (negative here), a fifth of the travel…
  expect(shot.vy).toBeCloseTo(-4000 / 5, 3)
  // …and PAID FOR out of it. Leaving the travel alone is what play saw as a free
  // ride: "прыжки дают будто буст", and "медленная граната на исходах сил
  // пролетает весь водоём". The tile's own friction does not begin to cover it —
  // water is terrain type 4 everywhere and Coulomb friction goes with the NORMAL
  // approach, which on a flat skim is a fraction of the travel.
  expect(shot.vx).toBeCloseTo(4000 * 0.8, 3)
})

test('and dropped straight DOWN it does not — nothing is in the plane', { tag: '@nodata' }, () => {
  // The gate is the speed ALONG the water, not the total. That is what makes a
  // thing falling out of the sky go in while a thing thrown flat skips, which is
  // how play described it and the only reading that produces both.
  const falling = dropped(6000, 0)
  expect(skipsOnWater(falling)).toBe(false)
  expect(dousedByWater(falling)).toBe(true)
  // …and something barely moving along it goes in too.
  const dribbling = dropped(0, WATER_DOUSE_SPEED / 2)
  expect(skipsOnWater(dribbling)).toBe(false)
})

test('the hops RUN DOWN, and a spent grenade cannot cross a pond', { tag: '@nodata' }, () => {
  // The whole of play's complaint in one measurement. Water is type 4 (0.90
  // friction, 0.10 restitution — measured over CAMP, BAY and ARCHI, every wet
  // sample), a grenade brings 0.30/0.80, and each hop pays a fifth of its travel
  // for the kick that lifts it.
  // The throw is stated against the speed at which a bounce STOPS being one,
  // because that is what the hops run down to — and both ride `FRAME_SECONDS`,
  // which play moves (ballistics.ts). A flat 4000 here counted three hops at
  // 1/15 and two at 1/20, purely because the cutoff had moved under it.
  const shot = dropped(0, BOUNCE_CUTOFF * 11)
  const hops: number[] = []
  // At the ENGINE's step, not a hand-written 1/30. A grenade's path in world
  // units does not care what `FRAME_SECONDS` is — speed rides 1/F and gravity
  // 1/F², so the range cancels — but the TIME does, so a fixed delta integrates
  // it more coarsely the faster the rate is set and hops start merging. Play
  // moves that number (ballistics.ts); a spec should drive at the rate the
  // engine runs at instead of guessing one.
  for (let frame = 0; frame < 1600 && hops.length < 40; frame++) {
    advanceLob(shot, STEP_SECONDS)
    if (shot.y < 0) continue
    if (skipsOnWater(shot)) {
      bounceLob(shot, 0, UP, 4, false, lobBounce(ROW))
      skipOffWater(shot)
      hops.push(Math.hypot(shot.vx, shot.vz))
      continue
    }
    douseInWater(shot)
    break
  }
  // A handful of hops, each markedly slower than the last, and then it goes in.
  expect(hops.length).toBeGreaterThan(2)
  expect(hops.length).toBeLessThan(10)
  expect(hops[hops.length - 1]).toBeLessThan(hops[0] * 0.6)
  // Nothing gains: a skip is an exchange, so the total speed never comes out of a
  // contact higher than it went in.
  expect(shot.doused).toBe(true)
})

test('once it is in and slow, water DOUSES it — no blast', { tag: '@nodata' }, () => {
  // The arm at 0x437bfb sets the projectile's quiet flag, and the destructor's
  // first test then spawns nothing and plays nothing (0x4328c9).
  const sinking = dropped(0, 0)
  expect(dousedByWater(sinking)).toBe(true)
})

test('a doused grenade SINKS for a couple of seconds, then is simply gone', { tag: '@nodata' }, () => {
  // Play: "граната должна реально пару секунд тонуть, как и все прожектайлы." It
  // cannot come from the map — the shipped water is 0 to 48 units deep, the bed
  // and the surface being the same plane — so the descent is the remake's and it
  // goes THROUGH the bed on purpose.
  const shot = dropped(6000, 0)
  douseInWater(shot)
  expect(shot.vx).toBe(0)
  expect(shot.vy).toBe(WATER_SINK_SPEED)
  expect(sunkAway(shot)).toBe(false)

  let sunk = 0
  for (let frame = 0; frame < 30 * (WATER_SINK_SECONDS + 1); frame++) {
    if (sunkAway(shot)) break
    sinkLob(shot, 1 / 30)
    sunk++
  }
  // It went down, it took its couple of seconds about it, and then it went.
  expect(shot.y).toBeCloseTo(WATER_SINK_SPEED * WATER_SINK_SECONDS, 0)
  expect(sunk / 30).toBeCloseTo(WATER_SINK_SECONDS, 1)
  expect(sunkAway(shot)).toBe(true)
})
