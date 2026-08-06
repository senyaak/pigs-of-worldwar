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

/** A 2×2 texture with the palette that decides it: `stp` marks the PSX
 * semi-transparency bit the library classifies on (dll 0x10007b6c). */
const art = (colours: number[]): TerrainArt => ({
  width: 2,
  height: 2,
  rgba: new Uint8Array(2 * 2 * 4),
  palette: Uint16Array.from(colours)
})
const TRANSLUCENT = 0x8000 | 0x1234
const OPAQUE = 0x1234

test('ice and water share a frozen body: the palette tells them apart', () => {
  // The whole rule. Both rows carry the water flag — a frozen channel and
  // the pond beside it — and only the translucent art swims. That is the
  // library's own classification, not ours: every non-transparent colour
  // carrying 0x8000 makes a texture kind 2, and afIsPointWatery answers off
  // the kind without reading a texel.
  const blocks = terrainBlocks(
    () => 0,
    (_x, z) => (z > 512 ? { type: 0x24, texture: 0 } : z > 0 ? { type: 0x24, texture: 1 } : {})
  )
  const textures = [art([TRANSLUCENT, TRANSLUCENT]), art([OPAQUE, OPAQUE])]
  const query = new TerrainQuery(blocks, buildWaterMask(blocks, textures))
  expect(query.isWater(256, 1500), 'the pond swims').toBe(true)
  // Tiles key off their origin corner, so the ice row spans z 512..1024 —
  // and is walked on end to end, flag or no flag.
  expect(query.isWater(100, 768), 'the ice holds at one end').toBe(false)
  expect(query.isWater(400, 768), 'and at the other').toBe(false)
  expect(query.isWater(256, -500), 'dry land is dry').toBe(false)
})

test('a mixed palette is solid too — the texel path cannot fire on this art', () => {
  // Kind 1 asks the texels, and a texel is only watery when it reads ZERO,
  // which needs a 0x0000 palette entry. No shipped ground texture has one
  // (pigs-disasm/terrain/watery.js), and the upload even lifts
  // non-transparent black off zero (0x100078a5). So a mixed palette walks.
  const blocks = terrainBlocks(
    () => 0,
    (_x, z) => (z > 512 ? { type: 0x24, texture: 0 } : z > 0 ? { type: 0x24, texture: 1 } : {})
  )
  const textures = [art([TRANSLUCENT]), art([TRANSLUCENT, OPAQUE])]
  const query = new TerrainQuery(blocks, buildWaterMask(blocks, textures))
  expect(textureKind(textures[1].palette), 'mixed').toBe(1)
  expect(query.isWater(256, 768), 'and solid underfoot').toBe(false)
  // The transparent entry votes for nothing: art that is otherwise all
  // translucent is still water.
  expect(textureKind(Uint16Array.from([0, TRANSLUCENT]))).toBe(2)
  expect(textureKind(Uint16Array.from([0, OPAQUE]))).toBe(0)
})

test('CAMP: the pond swims and the frozen channel beside it does not', () => {
  // The shipped map, against the counts in pigs-disasm/terrain/watery.js:
  // 80 flagged tiles wear kind-2 art (44, 45, 46) and 30 wear kind 1.
  const blocks = parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG')))
  const textures = parsePtg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PTG')))
  const swims = new Set(
    textures.flatMap((t, i) => (textureKind(t.palette) === 2 ? [i] : []))
  )
  expect([...swims].sort((a, b) => a - b)).toEqual([44, 45, 46])

  const mask = buildWaterMask(blocks, textures)
  expect(mask, 'CAMP has water').not.toBeNull()
  let wet = 0
  let walked = 0
  for (const block of blocks) {
    for (let tile = 0; tile < block.tiles.length; tile++) {
      if ((block.tiles[tile].type & 0x20) === 0) continue
      const x = block.x + (tile % 4) * 512 + 256
      const z = block.z + Math.floor(tile / 4) * 512 + 256
      if (mask!.wet(x, z)) wet++
      else walked++
    }
  }
  expect(wet, 'tiles a pig swims in').toBe(80)
  expect(walked, 'flagged tiles it walks on — the ice').toBe(30)
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
