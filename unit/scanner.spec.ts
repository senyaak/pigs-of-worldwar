// PHASE 002 (domain) — what the battle's MAP shows, and what it refuses to.
// Pure, no Electron, no installation.
//
// The rules are the exe's and the library's (lib/game/scanner.ts): the
// espionage classes are off the map on anybody else's turn, only four model
// names get a marker at all, a side's colour comes from its NATION through the
// skin remap, and the board is a tilted square of the whole level.

import { test, expect } from '@playwright/test'

import {
  BLINK_SECONDS,
  BLIP_COLOURS,
  BLIP_WHITE,
  HIDDEN_CLASSES,
  SCANNER_CENTRE,
  SCANNER_REACH,
  SCANNER_SCALE,
  SCANNER_SCALE_SMALL,
  SCANNER_SLIDE,
  TILT_SIN,
  objectBlips,
  pigBlips,
  projectScanner,
  scannerShrink
} from '../src/lib/game/scanner'
import { GROUND_PALETTE, MINE_TEXEL, RASTER_SIZE, RASTER_WORLD, mapRaster } from '../src/lib/game/mapRaster'
import type { TerrainBlock } from '../src/lib/formats/pmg'
import { BLOCKS_PER_SIDE, TILES_PER_SIDE, TILE_MINE, TILE_STEP, TILE_WATER } from '../src/lib/formats/pmg'
import type { MapObject } from '../src/lib/formats/pog'
import type { Pig, Player } from '../src/lib/game/game'
import { LARD } from '../src/lib/game/nations'

const pig = (name: string, pigClass: number, x = 0, z = 0, health = 50): Pig =>
  ({ id: name.length, name, index: 0, health, carrying: [], holding: null, position: { x, y: 0, z }, heading: 0, pigClass, parachutes: false }) as unknown as Pig

const team = (name: string, pigs: Pig[], activePig = 0, nation = 0): Player => ({ name, nation, pigs, activePig })

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

test('the acting pig flashes white, once every two seconds, and nobody else does', { tag: '@nodata' }, () => {
  // Play twice: much slower than the 64 ms a millisecond reading of the exe's
  // own bit would give, and faster than the 5.12 s the exe-frame reading gave
  // -- "раз в 2 секунды". So a state is a second and a cycle is two.
  expect(BLINK_SECONDS).toBeCloseTo(1, 6)
  const squad = team('MINE', [pig('ACTING', 0), pig('OTHER', 0)], 0)
  const dark = pigBlips([squad], 0, 0)
  const lit = pigBlips([squad], 0, BLINK_SECONDS)
  expect(dark[0].colour).toEqual(BLIP_COLOURS[0])
  expect(lit[0].colour).toEqual(BLIP_WHITE)
  // The pig that is not acting keeps its team's colour through the flash.
  expect(dark[1].colour).toEqual(BLIP_COLOURS[0])
  expect(lit[1].colour).toEqual(BLIP_COLOURS[0])
})

test("a blip takes its side's NATION colour, through the skin", { tag: '@nodata' }, () => {
  // Nation 1 is French and skin 2 is blue; nation 2 is American and skin 1 is
  // cyan — so the pair proves the remap rather than the ordering
  // (lib/game/nations.ts, `Team::SkinOf` 0x4508E0).
  const sides = [team('BR', [pig('A1', 0)], 0, 0), team('FR', [pig('B1', 0)], 0, 1), team('US', [pig('C1', 0)], 0, 2)]
  const blips = pigBlips(sides, 0, 0)
  expect(blips.map((one) => one.colour)).toEqual([BLIP_COLOURS[0], BLIP_COLOURS[2], BLIP_COLOURS[1]])
  // Six colours and no seventh: Team Lard has none in either table.
  expect(BLIP_COLOURS).toHaveLength(6)
  expect(pigBlips([team('LARD', [pig('L', 0)], 0, LARD)], 0, 0)[0].colour).toEqual(BLIP_WHITE)
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

test('the picture is one pixel a tile, and the board overreaches it', { tag: '@nodata' }, () => {
  expect(RASTER_SIZE).toBe(BLOCKS_PER_SIDE * TILES_PER_SIDE)
  // The board's rim is the world at ±18884 while the picture on it only
  // reaches ±16384 — the library's own mis-scaling, kept because it is what
  // the original looks like.
  expect(SCANNER_REACH).toBeGreaterThan(RASTER_WORLD / 2)
  expect((SCANNER_REACH * 2) / RASTER_WORLD).toBeCloseTo(1.153, 3)
})

test('the board is TILTED, not flat, and the camera faces UP it', { tag: '@nodata' }, () => {
  // 28.125° down from the horizontal: the vertical axis keeps under half of
  // what the horizontal one does, which is the tilt and not a chosen squash.
  expect(Math.abs(TILT_SIN)).toBeCloseTo(0.4714, 4)

  // The direction the camera looks comes out straight up the widget.
  const yaw = 0.7
  const ahead = projectScanner(Math.cos(yaw) * 0.1, Math.sin(yaw) * 0.1, yaw)
  expect(ahead.x).toBeCloseTo(0, 6)
  expect(ahead.y).toBeLessThan(0)
  // …and its left hand comes out to the left.
  const left = projectScanner(-Math.sin(yaw) * 0.1, Math.cos(yaw) * 0.1, yaw)
  expect(left.x).toBeLessThan(0)
  expect(left.y).toBeCloseTo(0, 6)

  // The perspective is a real recession: the same step sideways is drawn
  // WIDER on the near edge of the board than on the far one.
  const board = (across: number, along: number): { x: number; y: number } =>
    projectScanner(
      Math.sin(yaw) * across + Math.cos(yaw) * along,
      -Math.cos(yaw) * across + Math.sin(yaw) * along,
      yaw
    )
  const near = board(0.15, -0.15)
  const far = board(0.15, 0.15)
  expect(Math.abs(near.x)).toBeGreaterThan(Math.abs(far.x))
  // …and the far edge is drawn higher up the widget than the near one.
  expect(far.y).toBeLessThan(near.y)
})

test('it sits bottom left, and it is ONE size', { tag: '@nodata' }, () => {
  expect(SCANNER_CENTRE.left).toBe(110)
  expect(SCANNER_CENTRE.fromBottom).toBe(75)
  // The library has a small size and two callers for it — a charging shot and
  // the map view — and play ruled it out on sight: "у неё всегда 1 размер".
  // The numbers stay READ, and stay unapplied; what pins that is the drawer
  // holding `scale` as a `const` (ui/battleMap.ts), so this asserts only that
  // the library's own compensation is what it was measured to be.
  expect(scannerShrink(SCANNER_SCALE)).toBeCloseTo(0, 6)
  expect(scannerShrink(SCANNER_SCALE_SMALL)).toBeCloseTo(-15, 1)
})

test('twelve ground types have a colour', { tag: '@nodata' }, () => {
  // exe: scanner/board.md, the palette at dll 0x1002BEB8; nothing clamps the
  // other twenty.
  expect(GROUND_PALETTE).toHaveLength(12)
})

test('the entrance is twenty frames and ends settled', { tag: '@nodata' }, () => {
  expect(SCANNER_SLIDE).toHaveLength(20)
  expect(SCANNER_SLIDE[0]).toBe(0)
  expect(SCANNER_SLIDE[SCANNER_SLIDE.length - 1]).toBe(100)
  // It overshoots and comes back — the table's own bounce at 13..17.
  expect(Math.max(...SCANNER_SLIDE.slice(0, 15))).toBe(100)
  expect(SCANNER_SLIDE[14]).toBeLessThan(100)
})

/** One block of flat ground of one type, at grid position (bx, bz). */
const flatBlock = (bx: number, bz: number, height: number, type: number): TerrainBlock => ({
  x: bx * TILE_STEP - RASTER_WORLD / 2,
  z: bz * TILE_STEP - RASTER_WORLD / 2,
  heights: Int16Array.from(new Array((TILES_PER_SIDE + 1) ** 2).fill(height)),
  shades: new Uint8Array((TILES_PER_SIDE + 1) ** 2),
  tiles: new Array(TILES_PER_SIDE ** 2).fill(0).map(() => ({
    texture: 0,
    rotateFlip: 0,
    type,
    slip: 0
  }))
})

test('the picture lights the PEAKS, and high ground CLAMPS to white', { tag: '@nodata' }, () => {
  // Play reported four white stripes round the board and they are the
  // ORIGINAL's: the library shades a texel `palette[type] * shade >> 9` with
  // shade 64 at the map's lowest vertex and 194 at its highest, and clamps
  // each channel at 31 — `cmp ecx,1Fh / jle / mov ecx,1Fh`, dll 0x1000A3F4.
  // Row 9 is (100,100,100), and 100*194>>9 is 37, so any high grey ground
  // comes out pure white. CAMP's boundary plateau is exactly that.
  const raster = mapRaster([flatBlock(0, 0, 64, 9), flatBlock(4, 0, 4352, 9)])
  const texel = (x: number, z: number): number[] => {
    const at = (x * RASTER_SIZE + z) * 4
    return [raster.rgba[at], raster.rgba[at + 1], raster.rgba[at + 2]]
  }
  // Read at z = 2, clear of the first column, which is a copy of the second.
  //
  // The LOWEST ground is shade 64, where the arithmetic is the exact 8→5 bit
  // conversion — the palette entry as authored, `100 >> 3` back out as 99.
  expect(texel(0, 2)).toEqual([99, 99, 99])
  // The HIGHEST is 194, which saturates. This is the white play saw.
  expect(texel(4, 2)).toEqual([255, 255, 255])
  // …and that direction is READ, not assumed (`scanner/notes.md`): height is
  // an elevation, positive UP. Turning it over would darken the peaks.
  expect(texel(4, 2)[0]).toBeGreaterThan(texel(0, 2)[0])
})

test('the first column of the picture is a copy of the second', { tag: '@nodata' }, () => {
  // The library's fill loop writes the texel TWICE when it reaches column 1
  // (`cmp edi,1 / jne / sub ebp,2 / mov [ebp],cx`, dll 0x1000A431), so column
  // 0 never keeps what it computed. The picture's column runs along world z.
  const block = flatBlock(0, 0, 64, 9)
  // Give the second column, which is tile row 0 (the next test), a colour of
  // its own, so a picture that did not copy it would say so.
  for (let c = 0; c < TILES_PER_SIDE; c++) block.tiles[c].type = 11
  const raster = mapRaster([block])
  const texel = (x: number, z: number): number[] => {
    const at = (x * RASTER_SIZE + z) * 4
    return [raster.rgba[at], raster.rgba[at + 1], raster.rgba[at + 2]]
  }
  // Flat ground, so every shade is the floor 64: type 9 comes out 99 and type
  // 11, `240,100,53`, comes out 247, 99, 49.
  expect(texel(0, 1)).toEqual([247, 99, 49])
  expect(texel(0, 0)).toEqual([247, 99, 49])
  // …and the column after it is untouched, which is what says the copy went
  // from the second to the first and no further.
  expect(texel(0, 2)).toEqual([99, 99, 99])
})

/** A map of one flat block with one tile mined, and how to read its picture. */
const mined = (row: number, col: number, type = 9 | TILE_MINE, bz = 0): ((x: number, z: number) => number[]) => {
  const block = flatBlock(0, bz, 64, 9)
  block.tiles[row * TILES_PER_SIDE + col].type = type
  const raster = mapRaster([block])
  return (x, z) => {
    const at = (x * RASTER_SIZE + z) * 4
    return [raster.rgba[at], raster.rgba[at + 1], raster.rgba[at + 2]]
  }
}

const RED = [255, 0, 0]
/** Row 9 of the palette at the shade floor: the plain ground of `mined`. */
const PLAIN = [99, 99, 99]

test('a mine-flagged tile is the solid red texel, whatever the ground under it', { tag: '@nodata' }, () => {
  // exe: scanner/visibility.md, dll 0x1000A3E6 tests the flags for 0x40, and the
  // arm writes 31, 0, 0 into channels of five bits.
  expect(MINE_TEXEL).toEqual([31, 0, 0])
  // Tile col 2, row 1: picture row 2 (the row runs along x), column 2.
  const picture = mined(1, 2)
  expect(picture(2, 2)).toEqual(RED)
  // Its neighbours are the ground, so it is that one tile and no spread.
  expect(picture(2, 3)).toEqual(PLAIN)
  expect(picture(1, 2)).toEqual(PLAIN)
  expect(picture(3, 2)).toEqual(PLAIN)
  // The arm comes after the shade and asks about nothing else in the byte, so a
  // mine on water is as red: 197 shipped tiles carry both bits
  // (docs/facts/weapons/mines.md, [measured]).
  expect(mined(1, 2, 9 | TILE_WATER | TILE_MINE)(2, 2)).toEqual(RED)
})

test('a tile lands one column up z from its own row, and the last row is off the picture', { tag: '@nodata' }, () => {
  // exe: scanner/board.md § Which tile a texel shows. `afSetMap` reads the exe's
  // cell rows in reverse (dll 0x1000258D) and writes grid z `j` from cell row
  // `64 - j`, whose tile lies on the -z side of that vertex; the picture's column
  // is grid z (dll 0x1000A36B). So tile row r is column r + 1.
  const picture = mined(1, 2)
  expect(picture(2, 2)).toEqual(RED)
  expect(picture(2, 1)).toEqual(PLAIN)

  // Tile row 0 is on the picture twice: its own column 1, and the copy in column 0.
  const first = mined(0, 2)
  expect(first(2, 1)).toEqual(RED)
  expect(first(2, 0)).toEqual(RED)
  expect(first(2, 2)).toEqual(PLAIN)

  // Tile row 63, the top row of the block at z index 60, would be column 64 of 64.
  const last = mined(3, 2, 9 | TILE_MINE, 60)
  for (let z = 0; z < RASTER_SIZE; z++) expect(last(2, z)).not.toEqual(RED)
})

test('the height that shades a column is its own vertex, one row up z from the tile', { tag: '@nodata' }, () => {
  // exe: dll 0x1000A376 reads the height off the same record the flags come from
  // (scanner/board.md), so a raised vertex row lights column j, while the type
  // that colours column j is tile row j - 1.
  const block = flatBlock(0, 0, 64, 9)
  const verts = TILES_PER_SIDE + 1
  for (let c = 0; c < verts; c++) block.heights[2 * verts + c] = 4352
  const raster = mapRaster([block])
  const red = (z: number): number => raster.rgba[(1 * RASTER_SIZE + z) * 4]
  expect(red(2)).toBe(255)
  expect(red(1)).toBe(99)
  expect(red(3)).toBe(99)
})
