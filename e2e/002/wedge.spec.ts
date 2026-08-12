// PHASE 002 (domain) — a pig that comes down on a WALL tile settles. Pure.
//
// Play, with the tile's own address in hand: "нашёл ещё 1 баг tile 43,17 tex 157
// byte 0 type 0x85 — там соскользнул с подьема и попал в бесконечный цыкл, туда
// сюда скользит на 1м месте." 0x85 is a wall flag over terrain type 5.
//
// The cause was the landing rule reading the exe's stand-up gate as a refusal to
// LAND: `Map::IsBlocked` refuses the getting-up (0x471350's arm), not the
// contact, and the arrival speed is the only thing that decides between a bounce
// and a stop (`cmp di,19h`, 0x4711d8). Refused outright, a pig on a wall tile
// kept 99% of its slope-parallel speed off `WALL_MATERIAL` every frame and the
// wedge counter relaunched it every 25, for ever.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { GAME_DIR } from '../launch'
import { parsePmg } from '../../src/lib/formats/pmg'
import { parsePog } from '../../src/lib/formats/pog'
import { TerrainQuery } from '../../src/lib/game/terrain'
import { ObstacleField } from '../../src/lib/game/obstacles'
import { STEP_SECONDS } from '../../src/lib/game/engine'
import { createLocomotion, updateLocomotion } from '../../src/lib/game/locomotion'

const mapFile = (name: string): Buffer => readFileSync(path.join(GAME_DIR, 'Maps', name))

/** Where a tile of the map's own grid is, in world units — the middle of it. */
const tileAt = (query: TerrainQuery, col: number, row: number): { x: number; z: number } => {
  for (let x = -16384; x < 16384; x += 128) {
    for (let z = -16384; z < 16384; z += 128) {
      const at = query.tileAddress(x, z)
      if (at && at.col === col && at.row === row) return { x, z }
    }
  }
  throw new Error(`CAMP has no tile ${col},${row}`)
}

test('the tile play named is the one this is about', () => {
  const query = new TerrainQuery(parsePmg(mapFile('CAMP.PMG')))
  const at = tileAt(query, 43, 17)
  const tile = query.tileAddress(at.x, at.z)
  // Their own reading, checked: a WALL flag (0x80) over terrain type 5.
  expect(tile?.type).toBe(0x85)
  expect(query.walkable(at.x, at.z), 'it is blocked ground').toBe(false)
})

test('coming down on a wall tile it SETTLES, and is then thrown out', () => {
  const query = new TerrainQuery(parsePmg(mapFile('CAMP.PMG')))
  const field = new ObstacleField(parsePog(mapFile('CAMP.POG')))
  const at = tileAt(query, 43, 17)
  const state = createLocomotion(query, at.x, at.z, 0)
  // Slid off the rise onto it: in the air, with a walk's worth of speed.
  state.airborne = { vy: 0, vx: 120, vz: 120, bouncing: false, pushIn: null }

  let settled = false
  let settledBy = 0
  const seconds = 8
  const steps = Math.round(seconds / STEP_SECONDS)
  for (let i = 0; i < steps; i++) {
    updateLocomotion(state, query, { walk: 0, turn: 0, jump: false }, STEP_SECONDS, field)
    if (state.airborne === null && !settled) {
      settled = true
      settledBy = i * STEP_SECONDS
    }
  }

  // The bug, in one assertion: it never once stopped being a flying body.
  expect(settled, 'it came to rest at all').toBe(true)
  expect(settledBy, `it rested after ${settledBy.toFixed(2)}s`).toBeLessThan(3)
  // …and the wedge counter's whole job is that a pig does not stay in a wall:
  // eight seconds is four of its 25-frame throws.
  expect(query.walkable(state.x, state.z), 'and it is out of the wall').toBe(true)
})

test('the tile play stood ON: pushed clear, not hopped in place', () => {
  // Play, with the address again: "tile 18,12 tex 158 byte 0 type 0x85 — тут
  // прыгает по полу будто соскальзывает, но на месте, если встать туда." Another
  // wall over terrain type 5, and this one is 128 units BELOW the open ground
  // beside it, so a pig walking in drops into it rather than climbing.
  const query = new TerrainQuery(parsePmg(mapFile('CAMP.PMG')))
  const field = new ObstacleField(parsePog(mapFile('CAMP.POG')))
  const at = tileAt(query, 18, 12)
  expect(query.tileAddress(at.x, at.z)?.type).toBe(0x85)
  // …and it is FLAT, which is what makes it the case that broke: the remake's
  // eject asked for a downhill direction and there is none here.
  expect(query.downhill(at.x, at.z), 'nothing to be thrown down').toBeNull()

  const state = createLocomotion(query, at.x, at.z, 0)
  const facing = state.heading
  let ejections = 0
  let wasAir = false
  for (let i = 0; i < Math.round(6 / STEP_SECONDS); i++) {
    updateLocomotion(state, query, { walk: 1, turn: 0, jump: false }, STEP_SECONDS, field)
    const air = state.airborne !== null
    if (air && !wasAir) ejections++
    wasAir = air
  }

  // **The pig is never turned.** `EjectFromWall` spends its bearing on an
  // impulse and writes no heading anywhere (0x46fbd0 → 0x470c70); turning him
  // meant W walked him straight back in, to be thrown again 25 frames later.
  expect(Math.abs(state.heading - facing), 'the eject turned him').toBeLessThan(1e-6)
  // …and it has a HORIZONTAL: two impulses of 0x20, one level along the
  // gradient and one at 83.5°, so he leaves the tile instead of hopping on it.
  expect(Math.hypot(state.x - at.x, state.z - at.z), 'he went nowhere').toBeGreaterThan(512)
  expect(ejections, `thrown ${ejections} times in six seconds`).toBeLessThan(4)
})
