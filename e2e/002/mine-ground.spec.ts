// PHASE 002 — WHAT A DETECTOR SEES: its mines, as yellow-and-black ground.
//
// Play: "видят жёлто-чёрные текстуры там где есть мины." The exe's reveal swaps
// the texture of a mine tile in a detector's 3×3 for `Mine.tim`
// (scanner/visibility.md, 0x4767A0, 0x4A6E30), so the subject is drawn on a
// canvas, and it gets a PAINT CHECK: the picture is read at the tile's own place
// on the screen, not only the scene's word for what it stamped (docs/testing.md).

import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '../app'
import { hud, warp } from '../controller'
import { GAME_DIR } from '../launch'
import { openBattle } from '../load'
import { parsePmg } from '../../src/lib/formats/pmg'
import { parseTim } from '../../src/lib/formats/tim'
import { DETECT_TILES, MINE_GROUND_ART } from '../../src/lib/game/mines'
import { TerrainQuery } from '../../src/lib/game/terrain'

/** exe: scanner/visibility.md, the gate at 0x4768ED — class 5 is the SAPPER, inside
 * it, and class 0, the GRUNT CAMP fields, is outside it. */
const GRUNT = 0
const SAPPER = 5

const TILE = 512

const campQuery = (): TerrainQuery =>
  new TerrainQuery(parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG'))))

interface Tile {
  x: number
  z: number
  col: number
  row: number
}

/**
 * A mine with two plain tiles lined up behind it along one axis, so a pig can
 * stand on the near one looking at it, then on the far one still looking at it
 * but out of reach. None of the three may be water, and the pig's two must be
 * ground it can stand on.
 */
function lineUp(query: TerrainQuery): { mine: Tile; near: Tile; far: Tile; heading: number } {
  const plain = (x: number, z: number): boolean =>
    query.walkable(x, z) && !query.isWater(x, z) && !query.hasMine(x, z)
  const steps = [
    { dx: 0, dz: -TILE },
    { dx: 0, dz: TILE },
    { dx: -TILE, dz: 0 },
    { dx: TILE, dz: 0 }
  ]
  for (const mine of query.mineTiles()) {
    if (!query.walkable(mine.x, mine.z) || query.isWater(mine.x, mine.z)) continue
    for (const { dx, dz } of steps) {
      if (!plain(mine.x + dx, mine.z + dz) || !plain(mine.x + 2 * dx, mine.z + 2 * dz)) continue
      const near = query.tileCentre(mine.x + dx, mine.z + dz)
      const far = query.tileCentre(mine.x + 2 * dx, mine.z + 2 * dz)
      if (!near || !far) continue
      // Forward is (sin heading, cos heading), so this looks from the pig to the mine.
      return { mine, near, far, heading: Math.atan2(-dx, -dz) }
    }
  }
  throw new Error('CAMP has no mine a pig can walk up to')
}

const stamped = (page: Page): Promise<{ col: number; row: number }[]> =>
  page.evaluate(() => window.pow!.debug!.mineGround())

const models = (page: Page): Promise<number> => page.evaluate(() => window.pow!.debug!.mineModels())

const asClass = (page: Page, pigClass: number): Promise<void> =>
  page.evaluate((wanted) => window.pow!.debug!.asClass(wanted), pigClass)

interface Painted {
  /** How many pixels the tile covers on the screen. */
  pixels: number
  /** …how many of them are the art's yellow, darkened by any shade. */
  yellow: number
  /** …and how many its near-black. */
  black: number
}

/**
 * THE PAINT CHECK: the scene's own pixels inside a tile's outline on the screen,
 * off its WebGL canvas (preserveDrawingBuffer, three/scene.ts). The dashboard is
 * another canvas, so nothing of it is counted.
 */
const paintOf = (page: Page, tile: { col: number; row: number }): Promise<Painted> =>
  page.evaluate(({ col, row }) => {
    const corners = window.pow!.debug!.tileOnScreen(col, row)
    if (!corners) throw new Error(`tile ${col},${row} is not on the map`)
    const scene = document.querySelector('#battle-canvas canvas:not(#battle-hud)') as HTMLCanvasElement
    const probe = document.createElement('canvas')
    probe.width = scene.width
    probe.height = scene.height
    const context = probe.getContext('2d')
    if (!context) throw new Error('no 2d context to read the scene with')
    context.drawImage(scene, 0, 0)
    const { data } = context.getImageData(0, 0, scene.width, scene.height)
    // Clip space to pixels, round the tile's edge: corners are built (0,0), (1,0),
    // (0,1), (1,1), so the outline visits 0, 1, 3, 2.
    const ring = [0, 1, 3, 2].map((i) => ({
      x: ((corners[i].x + 1) / 2) * scene.width,
      y: ((1 - corners[i].y) / 2) * scene.height
    }))
    const inside = (px: number, py: number): boolean => {
      let side = 0
      for (let i = 0; i < 4; i++) {
        const a = ring[i]
        const b = ring[(i + 1) % 4]
        const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x)
        if (cross === 0) continue
        if (side === 0) side = Math.sign(cross)
        else if (Math.sign(cross) !== side) return false
      }
      return true
    }
    const painted = { pixels: 0, yellow: 0, black: 0 }
    const left = Math.max(0, Math.floor(Math.min(...ring.map((one) => one.x))))
    const right = Math.min(scene.width - 1, Math.ceil(Math.max(...ring.map((one) => one.x))))
    const top = Math.max(0, Math.floor(Math.min(...ring.map((one) => one.y))))
    const bottom = Math.min(scene.height - 1, Math.ceil(Math.max(...ring.map((one) => one.y))))
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (!inside(x + 0.5, y + 0.5)) continue
        painted.pixels++
        const at = (y * scene.width + x) * 4
        const r = data[at]
        const g = data[at + 1]
        const b = data[at + 2]
        if (r > 60 && g > 0.6 * r && g < r && b < 0.45 * r) painted.yellow++
        else if (Math.max(r, g, b) < 60) painted.black++
      }
    }
    return painted
  }, tile)

/** Wait for the chase camera to stop swinging after a warp, measured on the tile
 * itself: its outline stops moving on the screen. A reading taken mid-swing is of
 * another view than the one being compared with. */
async function settled(page: Page, tile: { col: number; row: number }): Promise<void> {
  let last = ''
  await expect
    .poll(
      async () => {
        const corners = await page.evaluate(
          ({ col, row }) => window.pow!.debug!.tileOnScreen(col, row),
          tile
        )
        const now = JSON.stringify(corners, (_key, value: unknown) =>
          typeof value === 'number' ? Math.round(value * 500) : value
        )
        const still = now === last
        last = now
        return still
      },
      { message: 'the camera never came to rest', timeout: 10000 }
    )
    .toBe(true)
}

/** How much of a tile's outline has to be the art for it to be the art: the pig
 * or a prop may stand in front of some of it, and the rims between the squares
 * are neither colour. */
const WORN = 0.25

const wearing = (one: Painted): boolean =>
  one.pixels > 200 && one.yellow > WORN * one.pixels && one.black > WORN * one.pixels

/** The opposite verdict, with room for a stray yellowish texel of the map's own. */
const plain = (one: Painted): boolean => one.pixels > 200 && one.yellow < 0.1 * one.pixels

test('Mine.tim is the picture play remembers: opaque yellow and black squares', () => {
  // [measured] Language/Tims/Mine.tim, scanner/visibility.md § The art; the path is
  // the string at 0x4DB0FC.
  const tim = parseTim(readFileSync(path.join(GAME_DIR, MINE_GROUND_ART)))
  expect({ width: tim.width, height: tim.height }).toEqual({ width: 32, height: 32 })
  // Sampled in the middle of each 8-texel square: a 4×4 checkerboard, black at the
  // top left.
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const at = ((row * 8 + 4) * 32 + col * 8 + 4) * 4
      const [r, g, b, a] = tim.rgba.subarray(at, at + 4)
      expect(a, 'every texel is opaque').toBe(255)
      if ((row + col) % 2 === 0) expect(Math.max(r, g, b), `square ${col},${row} is black`).toBeLessThan(50)
      else expect({ r, g, b }, `square ${col},${row} is yellow`).toEqual({ r: 255, g: 214, b: 0 })
    }
  }
})

test('a SAPPER beside a mine sees yellow-and-black ground; a GRUNT in the same place does not', async ({ app }) => {
  const { page } = app
  await openBattle(page)
  const query = campQuery()
  const { mine, near, far, heading } = lineUp(query)
  const tile = { col: mine.col, row: mine.row }

  // A GRUNT first, in the place the sapper is going to stand. CAMP fields one.
  await warp(page, near.x, near.z, heading)
  await settled(page, tile)
  const grunt = await paintOf(page, tile)
  expect(plain(grunt), `a grunt sees plain ground: ${JSON.stringify(grunt)}`).toBe(true)
  expect(await stamped(page), 'a grunt lights nothing').toEqual([])

  // The same pig in the same place, as a SAPPER. exe: scanner/visibility.md,
  // 0x4768ED — class 5 is inside the gate.
  await asClass(page, SAPPER)
  await expect
    .poll(async () => wearing(await paintOf(page, tile)), {
      message: 'the mine tile is not painted yellow and black'
    })
    .toBe(true)

  // …and it is every mine tile of the 3×3 and nothing else, out of the map itself
  // (exe: 0x476B11, one tile either way on both axes; 0x476B4A, the mine bit).
  const expected = query
    .mineTiles()
    .filter(
      (one) =>
        Math.abs(one.col - near.col) <= DETECT_TILES && Math.abs(one.row - near.row) <= DETECT_TILES
    )
    .map((one) => ({ col: one.col, row: one.row }))
  const byPlace = (a: { col: number; row: number }, b: { col: number; row: number }): number =>
    a.row - b.row || a.col - b.col
  expect((await stamped(page)).sort(byPlace)).toEqual(expected.sort(byPlace))

  // There is no model standing in for it (the `WE_MINE` this replaced).
  expect(await models(page), 'a mine model is on the scene').toBe(0)

  // It walks on, still looking at the mine, one tile further than the reach: the
  // ground goes back (exe: 0x47690B, the old block restored before the new one is
  // read). `far` is two tiles from the mine.
  await warp(page, far.x, far.z, heading)
  await settled(page, tile)
  const walked = await paintOf(page, tile)
  expect(plain(walked), `the ground did not go back: ${JSON.stringify(walked)}`).toBe(true)
  expect(await stamped(page), 'the mine is still stamped').not.toContainEqual(tile)

  // Back beside it, it lights again…
  await warp(page, near.x, near.z, heading)
  await expect
    .poll(async () => wearing(await paintOf(page, tile)), { message: 'it did not light again' })
    .toBe(true)
  // …and it is the class that does it: a GRUNT standing there has plain ground.
  await asClass(page, GRUNT)
  await expect
    .poll(async () => plain(await paintOf(page, tile)), {
      message: 'a grunt beside a mine still sees the stamp'
    })
    .toBe(true)
  expect(await stamped(page)).toEqual([])
  expect((await hud(page)).health, 'nothing went off').toBe(50)

  expect(app.errors()).toEqual([])
})
