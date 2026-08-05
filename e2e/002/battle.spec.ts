// PHASE 002 (app) — the first battle scene: New Game drops two squads onto
// ARCHI, the HUD names whose turn it is, End Turn rotates through players
// and pigs, and the scene actually draws.
//
// The squad rosters here mirror ui/battle.ts; the rotation rules themselves
// are pinned down in game-logic.spec.ts — this spec checks the wiring.

import { existsSync } from 'node:fs'

import { PHASE_ENV } from '../launch'
import { expect, test } from '../app'
import { debugState, hold, press, release, tap, warp } from '../controller'
import { TILE_STEP, TILE_WALL, TILE_WATER, parsePmg } from '../../src/lib/formats/pmg'
import { WORLD_LIMIT } from '../../src/lib/game/terrain'
import { TerrainQuery } from '../../src/lib/game/terrain'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { GAME_DIR } from '../launch'

/**
 * The center of a whole-tile wall on the battle map with two tiles of dry
 * open ground due west of it — read from the shipped map, so it stays true
 * if the map does. Well inside the world limit: a pig clamped at the border
 * is refused for a different reason entirely.
 */
function wallWithOpenGroundWest(): { x: number; z: number } {
  const blocks = parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG')))
  const query = new TerrainQuery(blocks)
  const clear = (x: number, z: number): boolean =>
    query.walkable(x, z) && !query.isWater(x, z) && query.walkable(x, z - TILE_STEP)
  for (const block of blocks) {
    for (let tile = 0; tile < block.tiles.length; tile++) {
      const { type, slip } = block.tiles[tile]
      if ((type & TILE_WALL) === 0 || (slip & 0x0f) !== 0 || (type & TILE_WATER) !== 0) continue
      const x = block.x + (tile % 4) * TILE_STEP + TILE_STEP / 2
      const z = block.z - Math.floor(tile / 4) * TILE_STEP - TILE_STEP / 2
      const room = Math.max(Math.abs(x), Math.abs(z)) < WORLD_LIMIT - 2 * TILE_STEP
      if (room && clear(x - TILE_STEP, z) && clear(x - 2 * TILE_STEP, z)) return { x, z }
    }
  }
  throw new Error('no wall with open ground west of it on CAMP')
}

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 002 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

test('New Game: squads on the map, turns rotate, the scene draws', async ({ app }) => {
  const { page } = app
  await page.locator('#menu-new-game').click()
  await expect(page.locator('#battle')).toBeVisible()

  // Turn 1: first player's first pig, full health, the clock running.
  await expect(page.locator('#battle-hud')).toHaveText(
    /Turn 1 — Tommy’s Trotters: Tommy \(100 hp, \d+s\)/
  )

  // The battle canvas draws something that is not background.
  const foregroundPixels = async (): Promise<number> =>
    page.evaluate(() => {
      const canvas = document.querySelector('#battle-canvas canvas') as HTMLCanvasElement | null
      if (!canvas) return -1
      const probe = document.createElement('canvas')
      probe.width = canvas.width
      probe.height = canvas.height
      const ctx = probe.getContext('2d')
      if (!ctx) return -1
      ctx.drawImage(canvas, 0, 0)
      const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data
      let count = 0
      for (let i = 0; i < pixels.length; i += 4) {
        if (
          Math.abs(pixels[i] - 0x23) > 32 ||
          Math.abs(pixels[i + 1] - 0x27) > 32 ||
          Math.abs(pixels[i + 2] - 0x1d) > 32
        ) {
          count++
        }
      }
      return count
    })
  await expect.poll(foregroundPixels, { message: 'rendered battle pixels' }).toBeGreaterThan(20000)

  // The clock is real: the HUD's seconds tick down on their own.
  const secondsLeft = async (): Promise<number> => {
    const text = (await page.locator('#battle-hud').textContent()) ?? ''
    return parseInt(text.match(/(\d+)s/)?.[1] ?? '-1', 10)
  }
  const before = await secondsLeft()
  expect(before).toBeGreaterThan(40)
  await expect.poll(secondsLeft, { message: 'turn clock ticking' }).toBeLessThan(before)

  // End Turn through the controller — the same action the button and the
  // Enter key fire.
  await tap(page, 'endTurn')
  await expect(page.locator('#battle-hud')).toHaveText(
    /Turn 1 — Kaiser’s Grunters: Hans \(100 hp, \d+s\)/
  )
  expect(await secondsLeft()).toBeGreaterThan(40)
  await page.locator('#battle-end-turn').click()
  await expect(page.locator('#battle-hud')).toHaveText(
    /Turn 2 — Tommy’s Trotters: Wilson \(100 hp, \d+s\)/
  )

  // Leaving lands back on the menu; a fresh New Game starts over at turn 1.
  await page.locator('#battle-leave').click()
  await expect(page.locator('#menu')).toBeVisible()
  await page.locator('#menu-new-game').click()
  await expect(page.locator('#battle-hud')).toHaveText(
    /Turn 1 — Tommy’s Trotters: Tommy \(100 hp, \d+s\)/
  )


  expect(app.errors()).toEqual([])
})

test('the controller drives the pig: walking moves it, turning aims it', async ({ app }) => {
  const { page } = app
  await page.locator('#menu-new-game').click()
  await expect(page.locator('#battle')).toBeVisible()

  // Walking moves the pig — position read off the scene, the ground truth
  // the HUD only summarises.
  const start = await debugState(page)
  await hold(page, 'walkForward', 700)
  const walked = await debugState(page)
  const distance = Math.hypot(walked.x - start.x, walked.z - start.z)
  expect(distance, 'walkForward moved the pig').toBeGreaterThan(200)

  // Turning aims it.
  await hold(page, 'turnRight', 400)
  const turned = await debugState(page)
  expect(Math.abs(turned.heading - walked.heading), 'turnRight rotated the pig').toBeGreaterThan(0.3)

  // Jump is a one-shot: it must leave the ground. Game space is Y-down, so
  // airborne means a SMALLER y than standing.
  await tap(page, 'jump')
  await page.waitForTimeout(120)
  const airborne = await debugState(page)
  expect(airborne.nodeY, 'jump left the ground').toBeLessThan(turned.nodeY - 50)

  expect(app.errors()).toEqual([])
})

test('shove a wall long enough and the pig is thrown off it', async ({ app }) => {
  const { page } = app
  await page.locator('#menu-new-game').click()
  await expect(page.locator('#battle')).toBeVisible()

  // Somewhere on the real battle map with open ground and then a wall: the
  // pig starts a tile and a half west of the wall, facing straight at it.
  const wall = wallWithOpenGroundWest()
  const EAST = Math.PI / 2
  await warp(page, wall.x - 768, wall.z, EAST)
  const standing = await debugState(page)

  await press(page, 'walkForward')
  let against = standing
  try {
    // It walks east and comes to rest against the wall: two readings a beat
    // apart that agree is the pig having nowhere left to go.
    await expect
      .poll(
        async () => {
          const before = await debugState(page)
          await page.waitForTimeout(150)
          const after = await debugState(page)
          against = after
          return after.x > standing.x + 100 && Math.abs(after.x - before.x) < 5
        },
        { message: 'walked up to the wall and stopped' }
      )
      .toBe(true)

    // Then, still shoving, the original's patience runs out and the pig is
    // thrown clear. Game space is Y-down, so leaving the ground is a SMALLER
    // y — the same reading the jump assertion uses.
    await expect
      .poll(async () => (await debugState(page)).nodeY, {
        message: 'thrown off the wall',
        timeout: 8000
      })
      .toBeLessThan(against.nodeY - 30)
  } finally {
    await release(page, 'walkForward')
  }

  // It comes back down rather than sailing off — settled means the height
  // stops changing, not that it matches where it took off from: the pig has
  // moved, and the ground it lands on is its own.
  await expect
    .poll(
      async () => {
        const before = await debugState(page)
        await page.waitForTimeout(200)
        const after = await debugState(page)
        return Math.abs(after.nodeY - before.nodeY) < 1
      },
      { message: 'stopped bouncing', timeout: 10000 }
    )
    .toBe(true)

  // And it is off the wall: thrown back the way it came, not through it.
  const landed = await debugState(page)
  expect(landed.x, 'thrown back from the wall').toBeLessThan(against.x)

  expect(app.errors()).toEqual([])
})
