// PHASE 002 (domain) — the water level, against the exe's own load steps.
//
// "Setting Water Level." (exe 0x451c10) fits a single height per map so the
// flattened area matches the water-flagged tiles, and "Flattening water
// level: " (0x451d0c) then raises every vertex under it to exactly it: the
// visible water surface IS the ground mesh, clamped. The shipped maps
// author their water flat at one height already — the mode of the
// water-tile corner heights — with only scattered dips below, so that mode
// is the level. 128 stored units on every map checked (CAMP, ARCHI, BAY,
// ARTGUN).
//
// Swimming rides the SURFACE, not the seabed: a pig over a dip floats at
// the same depth as everywhere else.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { test, expect } from '@playwright/test'

import { GAME_DIR } from '../launch'
import {
  HEIGHT_SCALE,
  TerrainQuery,
  fitWaterElevation,
  isOpenWaterTile,
  openWaterMask
} from '../../src/lib/game/terrain'
import { ANIM, SWIM_SINK, createLocomotion, updateLocomotion } from '../../src/lib/game/locomotion'
import { FRAME_SECONDS } from '../../src/lib/game/ballistics'
import { parsePmg } from '../../src/lib/formats/pmg'
import type { TerrainBlock } from '../../src/lib/formats/pmg'
import { buildWaterMask } from '../../src/lib/game/watermask'
import { terrain, terrainBlocks } from './fixture'

/** A lake at elevation 200 whose seabed dips to 40 in a hole around x≈0,
 * z≈2000 — the dip is water too, and must not show in the surface. */
const lake = (): TerrainQuery =>
  terrain(
    (x, z) => (z > 0 ? (Math.hypot(x, z - 2000) < 700 ? 40 : 200) : 400),
    (_x, z) => (z > 0 ? { type: 0x24 } : {})
  )

test('the water level is where the water-tile corners sit, dips notwithstanding', () => {
  const wet = lake()
  expect(wet.waterElevation).toBe(200 * HEIGHT_SCALE)
  // A dry map has no level at all.
  expect(terrain(() => 300).waterElevation).toBeNull()
})

test('the surface is the ground with everything under water raised to it', () => {
  const wet = lake()
  // Over the dip the surface reads the water level, not the seabed…
  expect(wet.surface(0, 2000)).toBe(-200 * HEIGHT_SCALE)
  expect(wet.height(0, 2000)).toBeCloseTo(-40 * HEIGHT_SCALE)
  // …and dry land above the level is untouched.
  expect(wet.surface(0, -2000)).toBeCloseTo(wet.height(0, -2000))
})

test('a swimming pig floats at the surface — the seabed does not drag it down', () => {
  const wet = lake()
  const overFlat = createLocomotion(wet, 0, 1000, 0)
  const overDip = createLocomotion(wet, 0, 2000, 0)
  updateLocomotion(overFlat, wet, { walk: 0, turn: 0, jump: false }, FRAME_SECONDS)
  updateLocomotion(overDip, wet, { walk: 0, turn: 0, jump: false }, FRAME_SECONDS)
  expect(overFlat.clip).toBe(ANIM.SWIM)
  expect(overDip.y, 'same depth over the hole').toBeCloseTo(overFlat.y)
  expect(overDip.y).toBeCloseTo(-200 * HEIGHT_SCALE + SWIM_SINK)
})

test('CAMP: the fitted level is the 128 the mapmakers authored', () => {
  const blocks = parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG')))
  expect(fitWaterElevation(blocks)).toBe(128 * HEIGHT_SCALE)
})

test('the water is per TEXEL: a pig stands on the dry half of a shore tile', () => {
  // The afIsPointWatery reading: the tile flag is a prefilter, the texel
  // decides. Two 2×2 textures: pure water (all one colour) and a shore
  // whose low-x half is that water colour and high-x half is sand. The
  // shore tile wears the flag, but only its water half swims.
  const WATER = [40, 120, 110, 255]
  const SAND = [200, 180, 130, 255]
  const texture = (texels: number[][]): { width: number; height: number; rgba: Uint8Array } => ({
    width: 2,
    height: 2,
    rgba: Uint8Array.from(texels.flat())
  })
  const art = [
    texture([WATER, WATER, WATER, WATER]),
    texture([WATER, SAND, WATER, SAND])
  ]
  // Water body at z > 0 wearing texture 0; one shore row at its edge
  // wearing texture 1 (water side toward the body).
  const blocks = terrainBlocks(
    () => 0,
    (_x, z) => (z > 512 ? { type: 0x24, texture: 0 } : z > 0 ? { type: 0x24, texture: 1 } : {})
  )
  const query = new TerrainQuery(blocks, buildWaterMask(blocks, art))
  expect(query.isWater(256, 1500), 'open water swims').toBe(true)
  // Tiles key off their origin corner, so the shore row spans z 512..1024:
  // its low-x texel half is water, high-x is sand — the point over sand
  // STANDS even though the tile is flagged.
  expect(query.isWater(100, 768), 'the painted water half swims').toBe(true)
  expect(query.isWater(400, 768), 'the painted sand half stands').toBe(false)
  // Dry land is dry regardless.
  expect(query.isWater(256, -500)).toBe(false)
})

test('a micro-crack of water does not swallow a pig — nine probes must agree', () => {
  // The original's afIsPointWatery samples the centre AND a ring of eight
  // (dll 0x1002c6a0, ±4 mask pixels = ±64 world units); a single watery
  // texel in dry art fails the ring, so the pig keeps standing. One water
  // texel in a 32×32 sand texture is a 16-unit crack.
  const WATER = [40, 120, 110, 255]
  const SAND = [200, 180, 130, 255]
  const crack = {
    width: 32,
    height: 32,
    rgba: Uint8Array.from(
      Array.from({ length: 32 * 32 }, (_, i) => (i === 16 * 32 + 16 ? WATER : SAND)).flat()
    )
  }
  const pure = {
    width: 2,
    height: 2,
    rgba: Uint8Array.from([WATER, WATER, WATER, WATER].flat())
  }
  // A water body wearing the pure art (to teach the colour set), plus one
  // flagged tile wearing the cracked sand far away from it.
  const blocks = terrainBlocks(
    () => 0,
    (_x, z) => (z > 4000 ? { type: 0x24, texture: 0 } : z > 3500 && z < 4000 ? {} : {})
  )
  // Wear the crack on one dry-side tile by hand: tile at origin (0, 0).
  for (const block of blocks) {
    if (block.x === 0 && block.z === 0) {
      block.tiles[0] = { ...block.tiles[0], type: 0x24, texture: 1 }
    }
  }
  const query = new TerrainQuery(blocks, buildWaterMask(blocks, [pure, crack]))
  // Standing on the crack texel's centre: the ring lands on sand — stands.
  expect(query.isWater(16 * 16 + 8, 16 * 16 + 8)).toBe(false)
  // The real water body still swims.
  expect(query.isWater(256, 5000)).toBe(true)
})

test('each water region gets ITS OWN level — a raised pool is not underground', () => {
  // Two pools: one at elevation 100 in the south, one at 700 in the north,
  // dry land between. One global level would flood the south's banks or
  // sink the north's surface 600 under its seabed — which is exactly what
  // CAMP's raised channel did in play. Regions fix it: each surface clamps
  // to its own pool's level.
  const twoPools = terrain(
    (_x, z) => (z < -4000 ? 100 : z > 4000 ? 700 : 400),
    (_x, z) => (z < -4200 || z > 4200 ? { type: 0x24 } : {})
  )
  expect(twoPools.surface(0, -6000)).toBe(-100 * HEIGHT_SCALE)
  expect(twoPools.surface(0, 6000)).toBe(-700 * HEIGHT_SCALE)
  // The dry middle is untouched ground.
  expect(twoPools.surface(0, 0)).toBeCloseTo(twoPools.height(0, 0))
})

test('open water: flat-at-level water-flagged tiles, and nothing else', () => {
  // The original classes water by texture (fully watery art = kind 2); the
  // stand-in classes by geometry: at or under the level with the water
  // flag. This predicate feeds the shimmer mask below.
  const lakeShape = (x: number, z: number): number =>
    z > 0 ? (Math.hypot(x, z - 2000) < 700 ? 40 : 200) : 400
  const lakeTile = (_x: number, z: number): { type: number } | Record<string, never> =>
    z > 0 ? { type: 0x24 } : {}
  const blocks = terrainBlocks(lakeShape, lakeTile)
  const level = fitWaterElevation(blocks)
  const at = (x: number, z: number): [TerrainBlock, number] => {
    const block = blocks.find(
      (b) => x >= b.x && x < b.x + 2048 && z >= b.z && z < b.z + 2048
    )
    if (!block) throw new Error('off the fixture map')
    return [block, Math.floor((z - block.z) / 512) * 4 + Math.floor((x - block.x) / 512)]
  }
  expect(isOpenWaterTile(...at(0, 3000), level), 'flat sea is the sheet').toBe(true)
  expect(isOpenWaterTile(...at(0, 2000), level), 'the sunken dip too').toBe(true)
  expect(isOpenWaterTile(...at(0, -3000), level), 'dry land is ground').toBe(false)

  // Mud banks are LAND whatever the water bit says — a pig scrambles there.
  const mudBlocks = terrainBlocks(() => 0, () => ({ type: 0x2b }))
  expect(isOpenWaterTile(mudBlocks[0], 0, fitWaterElevation(mudBlocks))).toBe(false)
})

test('the mask is exactly the flat water-flagged tiles — shore masking is art, not geometry', () => {
  // The original runs its animated water right up to the shoreline and
  // lets the shore tiles' ART mask it (watery texels see-through); the
  // grid mask therefore excludes nothing but dry land. The fixture's
  // water fills z > 0 — tiles are keyed by their origin corner, so the
  // first water row starts one past the middle.
  const blocks = terrainBlocks(
    () => 0,
    (_x, z) => (z > 0 ? { type: 0x24 } : {})
  )
  const mask = openWaterMask(blocks)
  const side = mask.length
  const firstWater = side / 2 + 1
  expect(mask[firstWater][10], 'water starts at the water').toBe(true)
  expect(mask[side - 1][10], 'out to the map edge').toBe(true)
  expect(mask[firstWater - 1][10], 'dry land never').toBe(false)
})
