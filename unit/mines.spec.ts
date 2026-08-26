// PHASE 002 (domain) — the sapper LAYS a mine. Pure, no Electron.
//
// The exe's own shape, read 2026-08-26 (lib/game/mines.ts): the lay drops a
// visible object at the layer's feet, it arms after 25 frames with the
// L_MINETR click, and it BEDS INTO THE GROUND — becomes the tile bit — only
// when not one live pig stands within ±512 of it on either axis. That
// clearance is the whole of why a layer never trips its own mine.

import { test, expect } from '@playwright/test'

import { ARM_FRAMES, BED_CLEARANCE, createMines, isMine } from '../src/lib/game/mines'
import { fromExeFrames } from '../src/lib/game/ballistics'
import { TILE_MINE } from '../src/lib/formats/pmg'
import { NO_BODY } from '../src/lib/game/body'
import type { Pig } from '../src/lib/game/game'
import type { BattleEvent } from '../src/lib/game/events'
import { terrain } from './fixture'

const MINE = 35

const pigAt = (x: number, z: number, id = 1): Pig =>
  ({
    id,
    name: 'SAPPER',
    index: 0,
    health: 80,
    carrying: [],
    holding: null,
    position: { x, y: 0, z },
    body: NO_BODY,
    heading: 0,
    pigClass: 5,
    gone: false,
    parachutes: false
  }) as unknown as Pig

/** Open flat ground, one shipped mine tile far away at (2304, 2304). */
const field = (): {
  mines: ReturnType<typeof createMines>
  pigs: Pig[]
  heard: BattleEvent[]
} => {
  const query = terrain(
    () => 0,
    // The tile callback gets the TILE'S ORIGIN, a multiple of 512 — so the
    // one at (2048, 2048) is the shipped mine, centred on (2304, 2304).
    (x, z) => (x >= 2048 && x < 2560 && z >= 2048 && z < 2560 ? { type: TILE_MINE } : {})
  )
  const pigs: Pig[] = []
  const heard: BattleEvent[] = []
  const mines = createMines(
    { pigs: () => pigs, targets: [], present: () => true, training: false, query, random: () => 0 },
    (event) => heard.push(event)
  )
  return { mines, pigs, heard }
}

test('a laid mine arms with the click and stays FURNITURE while the layer stands there', { tag: '@nodata' }, () => {
  const { mines, pigs, heard } = field()
  const sapper = pigAt(256, 256)
  pigs.push(sapper)
  expect(isMine(MINE)).toBe(true)
  expect(mines.lay(sapper, MINE)).toBe(true)
  expect(mines.laid()).toHaveLength(1)
  // Not yet armed, not yet ground: nothing to tread on.
  expect(mines.buried(256, 256)).toBe(false)
  mines.update(fromExeFrames(ARM_FRAMES) + 0.01)
  expect(heard.some((one) => one.kind === 'mineArmed')).toBe(true)
  // The layer is still standing on it — armed, and STILL furniture.
  expect(mines.laid()).toHaveLength(1)
  expect(mines.buried(256, 256)).toBe(false)
  expect(mines.tread(256, 256)).toBe(false)
})

test('the moment everyone is a tile away it BEDS IN — and then anyone trips it', { tag: '@nodata' }, () => {
  const { mines, pigs, heard } = field()
  const sapper = pigAt(256, 256)
  pigs.push(sapper)
  mines.lay(sapper, MINE)
  mines.update(fromExeFrames(ARM_FRAMES) + 0.01)
  // One step past the clearance on one axis is enough — the walker compares
  // x and z separately (0x436fe6/0x4370b2).
  sapper.position.x = 256 + BED_CLEARANCE + 1
  mines.update(0.01)
  expect(mines.laid()).toHaveLength(0)
  expect(mines.buried(256, 256)).toBe(true)
  // …and it is revealed to a detector's 3×3, like any bedded bit.
  expect(
    mines.revealed([pigAt(256 + 512, 256, 2)]).some((one) => one.x === 256 && one.z === 256)
  ).toBe(true)
  // The layer walks back on — the exe checks nobody's side, and neither does
  // this: the tread is the ordinary one, one-shot, tile centre and all.
  sapper.position.x = 256
  expect(mines.tread(256, 256)).toBe(true)
  expect(mines.buried(256, 256)).toBe(false)
  mines.update(1)
  expect(heard.some((one) => one.kind === 'blasted')).toBe(true)
})

test('a tile already carrying a mine refuses the lay', { tag: '@nodata' }, () => {
  const { mines, pigs } = field()
  const sapper = pigAt(2304, 2304)
  pigs.push(sapper)
  // Standing on the map's own minefield: the bed-in could never take a
  // second bit, so the lay refuses up front instead of leaving furniture.
  expect(mines.buried(2304, 2304)).toBe(true)
  expect(mines.lay(sapper, MINE)).toBe(false)
  expect(mines.laid()).toHaveLength(0)
})
