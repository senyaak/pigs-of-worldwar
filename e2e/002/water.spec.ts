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
import { parsePtg } from '../../src/lib/formats/ptg'
import { buildWaterMask, textureKind } from '../../src/lib/game/watermask'
import type { TerrainArt } from '../../src/lib/game/watermask'
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
  // `shape` in the fixture is already WORLD elevation — it divides by
  // HEIGHT_SCALE on the way into the block, and the query multiplies back —
  // so these are the shape's own numbers, with no scale on top.
  expect(wet.waterElevation).toBe(200)
  // A dry map has no level at all.
  expect(terrain(() => 300).waterElevation).toBeNull()
})

test('the surface is the ground with everything under water raised to it', () => {
  const wet = lake()
  // Over the dip the surface reads the water level, not the seabed…
  expect(wet.surface(0, 2000)).toBe(-200)
  expect(wet.height(0, 2000)).toBeCloseTo(-40)
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
  expect(overDip.y).toBeCloseTo(-200 + SWIM_SINK)
})

test('CAMP: the fitted level is the 128 the mapmakers authored', () => {
  const blocks = parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG')))
  expect(fitWaterElevation(blocks)).toBe(128 * HEIGHT_SCALE)
})

const TRANSLUCENT = 0x8000 | 0x1234
const OPAQUE = 0x1234
/**
 * A 2×2 texture: `colours` is the palette (the top bit is what decides), and
 * `texels` names which palette entry each of the four wears. The palette
 * alone gives the texture's KIND; the indices matter only where it is mixed.
 */
const art = (colours: number[], texels: number[] = [0, 0, 0, 0]): TerrainArt => ({
  width: 2,
  height: 2,
  rgba: new Uint8Array(2 * 2 * 4),
  palette: Uint16Array.from(colours),
  indices: Uint8Array.from(texels)
})

test('the palette says water, solid, or ask-the-texels', () => {
  // The library's own three-way classification, and the transparent entry
  // votes for nothing.
  expect(textureKind(Uint16Array.from([TRANSLUCENT, TRANSLUCENT]))).toBe(2)
  expect(textureKind(Uint16Array.from([OPAQUE, OPAQUE]))).toBe(0)
  expect(textureKind(Uint16Array.from([TRANSLUCENT, OPAQUE]))).toBe(1)
  expect(textureKind(Uint16Array.from([0, TRANSLUCENT]))).toBe(2)
  expect(textureKind(Uint16Array.from([0, OPAQUE]))).toBe(0)
})

test('translucent art swims whole, opaque art holds whole — that is the ice', () => {
  // Both rows carry the water flag: a pond and the frozen channel beside
  // it. Neither needs a texel read, and neither can flicker.
  const blocks = terrainBlocks(
    () => 0,
    (_x, z) => (z > 512 ? { type: 0x24, texture: 0 } : z > 0 ? { type: 0x24, texture: 1 } : {})
  )
  const textures = [art([TRANSLUCENT]), art([OPAQUE])]
  const query = new TerrainQuery(blocks, buildWaterMask(blocks, textures))
  expect(query.isWater(256, 1500), 'the pond swims').toBe(true)
  // Tiles key off their origin corner, so the ice row spans z 512..1024,
  // and it holds end to end.
  expect(query.isWater(100, 768), 'the ice holds at one end').toBe(false)
  expect(query.isWater(400, 768), 'and at the other').toBe(false)
  expect(query.isWater(256, -500), 'dry land is dry').toBe(false)
})

test('a SHORE tile is mixed art, and the waterline runs through it', () => {
  // Kind 1 is the case the pond's own rim wears, and it must not answer
  // whole: making it solid let a pig walk out over the rim as if the water
  // were a floor. So the texels decide, off the colour set — half this
  // tile is the pond's colour and half is sand.
  const blocks = terrainBlocks(
    () => 0,
    (_x, z) => (z > 512 ? { type: 0x24, texture: 0 } : z > 0 ? { type: 0x24, texture: 1 } : {})
  )
  // The shore's low-x texels wear palette entry 0 (translucent, water) and
  // its high-x texels entry 1 (opaque, bank).
  const textures = [art([TRANSLUCENT]), art([TRANSLUCENT, OPAQUE], [0, 1, 0, 1])]
  expect(textureKind(textures[1].palette), 'the shore is mixed art').toBe(1)
  const query = new TerrainQuery(blocks, buildWaterMask(blocks, textures))
  expect(query.isWater(256, 1500), 'the pond swims').toBe(true)
  expect(query.isWater(100, 768), 'the painted water half swims').toBe(true)
  expect(query.isWater(400, 768), 'the painted sand half stands').toBe(false)
})

test('CAMP: the pond is kind 2 outright, and its rim is not', () => {
  // The shipped map, against terrain/watery.js: three textures
  // classify as water and 80 flagged tiles wear them; the other 30 are
  // mixed art, where the waterline lives.
  const blocks = parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG')))
  const textures = parsePtg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PTG')))
  const swims = textures.flatMap((t, i) => (textureKind(t.palette) === 2 ? [i] : []))
  expect(swims).toEqual([44, 45, 46])

  const mask = buildWaterMask(blocks, textures)
  expect(mask, 'CAMP has water').not.toBeNull()
  let outright = 0
  let mixed = 0
  for (const block of blocks) {
    for (const tile of block.tiles) {
      if ((tile.type & 0x20) === 0) continue
      if (textureKind(textures[tile.texture].palette) === 2) outright++
      else mixed++
    }
  }
  expect(outright, 'tiles that swim without a texel read').toBe(80)
  expect(mixed, 'tiles whose art carries the waterline').toBe(30)
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
  expect(twoPools.surface(0, -6000)).toBe(-100)
  expect(twoPools.surface(0, 6000)).toBe(-700)
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
