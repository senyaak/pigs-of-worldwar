// PHASE 002 (domain) — what a tile IS, against the exe rather than the raw
// byte. The byte carries flags above the terrain type, and reading it whole
// misses the swamp: 1857 of the 1865 type-11 tiles on the shipped maps are
// 0x2b — type 11 with the water bit riding on top — so `type === 11` never
// fired and `waterBit !== 0` said "swim" on every bank.
//
// The exe's own readings, both disassembled:
//   UpdateGroundState 0x46fde4  `and edx,1Fh` before `cmp ecx,0Bh` (0x470085)
//                               — the swamp test is on the LOW 5 BITS
//   IsInWater 0x4a6fd6          bit 5 is only a PREFILTER; the verdict is
//                               `afIsPointWatery` (_d3d.dll 0x10010210),
//                               which samples a per-texture water mask
//
// This spec pins the remake's own stand-in, which keeps type 11 out of the
// water wholesale.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { test, expect } from '@playwright/test'

import { GAME_DIR } from '../launch'
import { SWAMP_TILE, TerrainQuery } from '../../src/lib/game/terrain'
import { parsePmg } from '../../src/lib/formats/pmg'
import { terrain } from '../../unit/fixture'

test('tileType is the low 5 bits; the raw byte stays readable for debugging', () => {
  const mud = terrain(() => 0, () => ({ type: 0x2b }))
  expect(mud.tileType(0, 0)).toBe(SWAMP_TILE)
  expect(mud.tileAddress(0, 0)?.type).toBe(0x2b)
})

test('swamp banks do not swim here — the water bit alone is not water', () => {
  // 0x2b: type 11 + water bit — the shipped maps' bank at the water's edge.
  // Bare 0x0b reads the same; open sea (0x24) actually swims.
  const bank = terrain(() => 0, () => ({ type: 0x2b }))
  expect(bank.tileType(0, 0)).toBe(SWAMP_TILE)
  expect(bank.isWater(0, 0)).toBe(false)

  const dry = terrain(() => 0, () => ({ type: 0x0b }))
  expect(dry.tileType(0, 0)).toBe(SWAMP_TILE)
  expect(dry.isWater(0, 0)).toBe(false)

  const sea = terrain(() => 0, () => ({ type: 0x24 }))
  expect(sea.tileType(0, 0)).not.toBe(SWAMP_TILE)
  expect(sea.isWater(0, 0)).toBe(true)
})

test('a walled swamp tile still blocks — the flags are independent', () => {
  // 0xab exists on the shipped maps (8 tiles): wall + water bit + type 11.
  const walled = terrain(() => 0, () => ({ type: 0xab, slip: 0 }))
  expect(walled.walkable(0, 0)).toBe(false)
  expect(walled.tileType(0, 0)).toBe(SWAMP_TILE)
})

test('ARTGUN: the mask finds the swamp the byte hid', () => {
  // 390 type-11 tiles ship on ARTGUN, none of them with a bare type byte.
  const query = new TerrainQuery(parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'ARTGUN.PMG'))))
  let swamp = 0
  for (let x = -8192; x < 8192; x += 512) {
    for (let z = -8192; z < 8192; z += 512) {
      if (query.tileType(x + 256, z + 256) === SWAMP_TILE) swamp++
    }
  }
  expect(swamp).toBeGreaterThan(100)
})
