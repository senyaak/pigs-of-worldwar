// PHASE 002 (domain) — what the battle's MAP shows, and what it refuses to.
// Pure, no Electron, no installation.
//
// The rules are the exe's and the library's (lib/game/scanner.ts): the
// espionage classes are off the map on anybody else's turn, only four model
// names get a marker at all, and the acting pig flashes on the millisecond
// clock's own bit.

import { test, expect } from '@playwright/test'

import {
  BLINK_MS,
  BLIP_COLOURS,
  BLIP_WHITE,
  HIDDEN_CLASSES,
  SCANNER_SCALE,
  SCANNER_SCALE_SMALL,
  SCANNER_SLIDE,
  objectBlips,
  pigBlips,
  scannerPixels
} from '../src/lib/game/scanner'
import { RASTER_SIZE, RASTER_WORLD } from '../src/lib/game/mapRaster'
import { BLOCKS_PER_SIDE, TILES_PER_SIDE } from '../src/lib/formats/pmg'
import type { MapObject } from '../src/lib/formats/pog'
import type { Pig, Player } from '../src/lib/game/game'

const pig = (name: string, pigClass: number, x = 0, z = 0, health = 50): Pig =>
  ({ id: name.length, name, index: 0, health, carrying: [], holding: null, position: { x, y: 0, z }, heading: 0, pigClass, parachutes: false }) as unknown as Pig

const team = (name: string, pigs: Pig[], activePig = 0): Player => ({ name, pigs, activePig })

const object = (name: string, id: number, x = 0, z = 0): MapObject =>
  ({ name, id, type: 0, x, y: 0, z, yaw: 0, pitch: 0, roll: 0 }) as unknown as MapObject

test('a SCOUT, SNIPER or SPY is off the map on anybody else\'s turn', { tag: '@nodata' }, () => {
  // 8, 9 and 10 — the three `Pig::Draw` drops the marker for at 0x440C67.
  expect([...HIDDEN_CLASSES].sort((a, b) => a - b)).toEqual([8, 9, 10])
  // Told apart by where they stand, since a blip carries no name.
  const mine = team('MINE', [pig('GRUNT', 0, 100), pig('SPY', 10, 200)])
  const theirs = team('THEIRS', [pig('THEIRGRUNT', 0, 300), pig('THEIRSPY', 10, 400)])

  // My turn: both of mine, and only their grunt.
  expect(pigBlips([mine, theirs], 0, 0).map((one) => one.x)).toEqual([100, 200, 300])
  // Their turn: their spy comes back and MINE goes. It is the turn and
  // nothing else — no range, no spotting, and it cuts both ways.
  expect(pigBlips([mine, theirs], 1, 0).map((one) => one.x)).toEqual([100, 300, 400])
})

test('a dead pig has no blip', { tag: '@nodata' }, () => {
  const squad = team('MINE', [pig('UP', 0), pig('DOWN', 0, 0, 0, 0)])
  expect(pigBlips([squad], 0, 0)).toHaveLength(1)
})

test('the acting pig flashes white every 64 ms and nobody else does', { tag: '@nodata' }, () => {
  const squad = team('MINE', [pig('ACTING', 0), pig('OTHER', 0)], 0)
  const dark = pigBlips([squad], 0, 0)
  const lit = pigBlips([squad], 0, BLINK_MS)
  expect(dark[0].colour).toEqual(BLIP_COLOURS[0])
  expect(lit[0].colour).toEqual(BLIP_WHITE)
  // The pig that is not acting keeps its team's colour through the flash.
  expect(dark[1].colour).toEqual(BLIP_COLOURS[0])
  expect(lit[1].colour).toEqual(BLIP_COLOURS[0])
})

test('each side takes its own blip colour', { tag: '@nodata' }, () => {
  const sides = [team('A', [pig('A1', 0)]), team('B', [pig('B1', 0)]), team('C', [pig('C1', 0)])]
  const blips = pigBlips(sides, 0, 0)
  expect(blips.map((one) => one.colour)).toEqual([BLIP_COLOURS[0], BLIP_COLOURS[1], BLIP_COLOURS[2]])
})

test('only crates and propoints get a marker — a drum does not', { tag: '@nodata' }, () => {
  // The exe's window is name-table ids 20..23 (0x45DFB9), and DRUM at 24 is
  // deliberately one past it.
  const blips = objectBlips(
    [
      object('CRATE1', 1),
      object('CRATE2', 2),
      object('CRATE4', 3),
      object('PROPOINT', 4),
      object('DRUM', 5),
      object('DRUM2', 6),
      object('TREEG', 7)
    ],
    () => false
  )
  expect(blips.map((one) => one.icon)).toEqual(['iconpkup', 'iconhart', 'iconpkup', 'iconprop'])
  // CRATE1 and CRATE4 share a marker AND a colour, so the map cannot tell
  // a weapon crate from an empty one.
  expect(blips[0].colour).toEqual(blips[2].colour)
})

test('a crate that has been taken leaves the map with its object', { tag: '@nodata' }, () => {
  const crates = [object('CRATE1', 1), object('CRATE1', 2)]
  expect(objectBlips(crates, (id) => id === 1)).toHaveLength(1)
})

test('the whole world fits the map, and charging shrinks it', { tag: '@nodata' }, () => {
  // One raster pixel a tile, and the tile grid is the world's own.
  expect(RASTER_SIZE).toBe(BLOCKS_PER_SIDE * TILES_PER_SIDE)
  // …and the picture at the resting scale is the 126 pixels the library's own
  // arithmetic gives: scale × 480 / 18884 across 64 tiles of 512.
  const across = RASTER_WORLD * scannerPixels(SCANNER_SCALE)
  expect(across).toBeGreaterThan(124)
  expect(across).toBeLessThan(128)
  expect(scannerPixels(SCANNER_SCALE_SMALL)).toBeLessThan(scannerPixels(SCANNER_SCALE))
})

test('the entrance is twenty frames and ends settled', { tag: '@nodata' }, () => {
  expect(SCANNER_SLIDE).toHaveLength(20)
  expect(SCANNER_SLIDE[0]).toBe(0)
  expect(SCANNER_SLIDE[SCANNER_SLIDE.length - 1]).toBe(100)
  // It overshoots and comes back — the table's own bounce at 13..17.
  expect(Math.max(...SCANNER_SLIDE.slice(0, 15))).toBe(100)
  expect(SCANNER_SLIDE[14]).toBeLessThan(100)
})
