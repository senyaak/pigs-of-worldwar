// PHASE 002 — THE MAP'S RED GROUND: a shipped map's minefield on the dashboard's map.
//
// The library bakes the mine bit into the board's own picture (scanner/visibility.md,
// dll 0x1000A3E6), so the subject is drawn on a canvas and it gets a PAINT CHECK: the
// dashboard's pixels are read where the map file says the mines are. The mines come
// from the .PMG, not from the picture being checked.

import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '../app'
import { hud, skipTurn } from '../controller'
import { GAME_DIR } from '../launch'
import { openBattle } from '../load'
import { parsePmg } from '../../src/lib/formats/pmg'
import {
  SCANNER_CENTRE,
  SCANNER_REACH,
  SCANNER_SCALE,
  projectScanner
} from '../../src/lib/game/scanner'
import { TerrainQuery } from '../../src/lib/game/terrain'
import { AUTHORED_HEIGHT } from '../../src/renderer/src/ui/hud/layout'

/** A tile of the map, by the place the query counts it in. */
interface Tile {
  col: number
  row: number
}

/** The map's tiles a side, and the last texel of the picture's 64. */
const TILES = 64
const LAST_TEXEL = TILES - 1

const key = (col: number, row: number): number => row * TILES + col

/** A map's mines, out of its file. [measured] CAMP has 99, of which 23 have all eight
 * neighbours mined too; BUTE has 997, of which 403 do. */
function minesOf(map: string): Set<number> {
  const query = new TerrainQuery(parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', `${map}.PMG`))))
  return new Set(query.mineTiles().map((one) => key(one.col, one.row)))
}

/** Every tile (clear of the picture's edge) whose `reach` round it is all mined, or
 * none of it. */
function patches(mines: Set<number>, reach: number, wantMined: boolean): Tile[] {
  const found: Tile[] = []
  for (let row = reach; row < TILES - reach - 1; row++) {
    for (let col = reach; col < TILES - reach; col++) {
      let all = true
      for (let dz = -reach; dz <= reach && all; dz++) {
        for (let dx = -reach; dx <= reach && all; dx++) {
          all = mines.has(key(col + dx, row + dz)) === wantMined
        }
      }
      if (all) found.push({ col, row })
    }
  }
  return found
}

/**
 * Where a tile's texel is drawn, in the dashboard's authored units.
 *
 * exe: scanner/board.md. Tile (col, row) is texel row `col` and texel column `row + 1`
 * (§ Which tile a texel shows); the board spans ±scale with its rim on texel centres
 * 0.5 and 63.5; the picture's row runs along the board's px and its column along py.
 */
function tileOnBoard(tile: Tile, yaw: number): { x: number; y: number } {
  const across = (texel: number): number => ((texel / LAST_TEXEL) * 2 - 1) * SCANNER_SCALE
  const point = projectScanner(across(tile.col), across(tile.row + 1), yaw)
  return {
    x: SCANNER_CENTRE.left + point.x,
    y: AUTHORED_HEIGHT - SCANNER_CENTRE.fromBottom + point.y
  }
}

/** Solid red, through the board's bilinear stretch: nothing in the ground palette
 * comes close (exe: dll 0x1002BEB8, whose lowest green at the shade floor is 49). */
const isRed = (r: number, g: number, b: number): boolean => r > 200 && g < 40 && b < 40

interface MapPaint {
  /** How many of the tiles were read, a blip on one leaving it out. */
  read: number
  /** Those of them drawn red, with the colour they were found in. */
  red: { tile: Tile; rgb: number[] }[]
  /** …and those drawn anything else. */
  other: { tile: Tile; rgb: number[] }[]
}

/**
 * THE PAINT CHECK: how many of these tiles are red on the dashboard's canvas, leaving
 * out any a blip stands on, since a side's blip may be red itself (exe: the table at
 * dll 0x1002BE70, `BLIP_COLOURS`). The picture is re-read until the camera's yaw agrees
 * before and after, so the places looked at are the places it was drawn at.
 */
async function paintOn(page: Page, tiles: readonly Tile[]): Promise<MapPaint> {
  const map = (): Promise<{ eye: { heading: number }; blips: { x: number; z: number }[] }> =>
    page.evaluate(() => window.pow!.debug!.map())
  // A marker is 10×11, so this clears a blip's own square and a margin round it.
  const CLEAR = 10
  // How far the yaw may move between two reads and still be the same picture: a
  // hundredth of a texel's turn at the board's rim.
  const STILL = 0.002
  for (let attempt = 0; attempt < 200; attempt++) {
    const { eye, blips } = await map()
    const yaw = eye.heading
    const standing = blips.map((blip) =>
      projectScanner(
        (blip.x * SCANNER_SCALE) / SCANNER_REACH,
        (blip.z * SCANNER_SCALE) / SCANNER_REACH,
        yaw
      )
    )
    const clear = tiles
      .map((tile) => ({ tile, ...tileOnBoard(tile, yaw) }))
      .filter((spot) =>
        standing.every(
          (one) =>
            Math.abs(SCANNER_CENTRE.left + one.x - spot.x) > CLEAR ||
            Math.abs(AUTHORED_HEIGHT - SCANNER_CENTRE.fromBottom + one.y - spot.y) > CLEAR
        )
      )
    const pixels = await page.evaluate(
      ({ spots, authored }) => {
        const canvas = document.getElementById('battle-hud') as HTMLCanvasElement
        const context = canvas.getContext('2d')
        if (!context) throw new Error('the dashboard has no 2d context')
        const scale = canvas.height / authored
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
        return spots.map(({ x, y }) => {
          const at = (Math.round(y * scale) * canvas.width + Math.round(x * scale)) * 4
          return [data[at], data[at + 1], data[at + 2]]
        })
      },
      { spots: clear.map(({ x, y }) => ({ x, y })), authored: AUTHORED_HEIGHT }
    )
    const after = (await map()).eye.heading
    if (Math.abs(after - yaw) < STILL) {
      const found = pixels.map((rgb, i) => ({ tile: clear[i].tile, rgb }))
      return {
        read: found.length,
        red: found.filter(({ rgb: [r, g, b] }) => isRed(r, g, b)),
        other: found.filter(({ rgb: [r, g, b] }) => !isRed(r, g, b))
      }
    }
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)))
  }
  throw new Error('the camera never stopped turning, so the map never held still to be read')
}

/** The map's mines are red where the file says, and clear ground is not. */
async function looking(page: Page, map: string, who: string): Promise<void> {
  const mines = minesOf(map)
  const solid = patches(mines, 1, true)
  const clear = patches(mines, 2, false)
  // These counts are the map file's: there is something to look at, on either side.
  expect(solid.length, `${map} has a solid patch of mines`).toBeGreaterThan(10)
  expect(clear.length, `${map} has ground clear of them`).toBeGreaterThan(1000)
  // exe: scanner/visibility.md § Mines, dll 0x1000A3E6 — the red texel.
  await expect
    .poll(async () => (await paintOn(page, solid)).other, {
      message: `${who}: every solid patch of mines is red on the map`
    })
    .toEqual([])
  expect((await paintOn(page, solid)).read, `${who}: the mines were read`).toBeGreaterThan(solid.length / 2)
  const ground = await paintOn(page, clear)
  expect(ground.read, `${who}: the map was read`).toBeGreaterThan(100)
  expect(ground.red, `${who}: the ground clear of mines is not red`).toEqual([])
}

test('CAMP\'s minefields are red on the map, for a grunt nowhere near them', async ({ app }) => {
  const { page } = app
  await openBattle(page)
  // The acting pig is a GRUNT at its marker, and no detector (mine-ground.spec.ts).
  // exe: dll 0x1000A3E6 asks about no class and no range.
  await looking(page, 'CAMP', 'a grunt')
  expect(app.errors()).toEqual([])
})

test('BUTE\'s minefields are red on the map on both sides\' turns', async ({ app }) => {
  const { page } = app
  await openBattle(page, 'BUTE')
  await looking(page, 'BUTE', 'the first side')

  // The picture is the one texture for everybody. exe: scanner/chain.md, 0x4549A0
  // fills it once, in the HUD's constructor.
  const before = await hud(page)
  await skipTurn(page)
  await expect
    .poll(async () => (await hud(page)).side, { message: 'the turn passing' })
    .not.toBe(before.side)
  await looking(page, 'BUTE', 'the second side')

  expect(app.errors()).toEqual([])
})
