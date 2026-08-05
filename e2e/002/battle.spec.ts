// PHASE 002 (app) — the first battle scene: New Game drops two squads onto
// ARCHI, the HUD names whose turn it is, End Turn rotates through players
// and pigs, and the scene actually draws.
//
// The squad rosters here mirror ui/battle.ts; the rotation rules themselves
// are pinned down in game-logic.spec.ts — this spec checks the wiring.

import { existsSync } from 'node:fs'

import { PHASE_ENV } from '../launch'
import { expect, test } from '../app'
import { debugState, hold, peakNodeY, press, release, tap, warp } from '../controller'
import { TILE_STEP, TILE_WALL, TILE_WATER, parsePmg } from '../../src/lib/formats/pmg'
import { TerrainQuery, WORLD_LIMIT } from '../../src/lib/game/terrain'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { GAME_DIR } from '../launch'

/**
 * The center of a whole-tile wall on the battle map with dry open ground due
 * west of it — read from the shipped map, so it stays true if the map does.
 * Well inside the world limit: a pig clamped at the border is refused for a
 * different reason entirely.
 *
 * Of every such wall it takes the one with the LONGEST fall behind it. A
 * pig thrown off a wall onto rising ground barely goes anywhere; thrown off
 * onto a slope it bounces away down the hill, which is the behaviour worth
 * asserting — and the one the original is recognisable by.
 */
function wallAboveASlope(): { x: number; z: number; query: TerrainQuery } {
  const blocks = parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG')))
  const query = new TerrainQuery(blocks)
  const clear = (x: number, z: number): boolean =>
    query.walkable(x, z) && !query.isWater(x, z) && query.walkable(x, z - TILE_STEP)
  let best: { x: number; z: number; fall: number } | null = null
  for (const block of blocks) {
    for (let tile = 0; tile < block.tiles.length; tile++) {
      const { type, slip } = block.tiles[tile]
      if ((type & TILE_WALL) === 0 || (slip & 0x0f) !== 0 || (type & TILE_WATER) !== 0) continue
      const x = block.x + (tile % 4) * TILE_STEP + TILE_STEP / 2
      const z = block.z - Math.floor(tile / 4) * TILE_STEP - TILE_STEP / 2
      const room = Math.max(Math.abs(x), Math.abs(z)) < WORLD_LIMIT - 3 * TILE_STEP
      if (!room || !clear(x - TILE_STEP, z) || !clear(x - 2 * TILE_STEP, z)) continue
      if (!clear(x - 3 * TILE_STEP, z)) continue
      // Game space is Y-down, so ground FALLING away west means height grows.
      const fall = query.height(x - 3 * TILE_STEP, z) - query.height(x - TILE_STEP, z)
      if (!best || fall > best.fall) best = { x, z, fall }
    }
  }
  if (!best) throw new Error('no wall with open ground west of it on CAMP')
  return { x: best.x, z: best.z, query }
}

/** A scene reading as the (x, z) pair the terrain query takes. */
const positionOf = (at: { x: number; z: number }): [number, number] => [at.x, at.z]

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

  // And it recharges. The cooldown once ticked down inside the turn-change
  // block, where the next line reset it — so a pig could jump exactly once
  // per turn and never again.
  await expect
    .poll(async () => (await debugState(page)).nodeY, { message: 'back on the ground' })
    .toBeGreaterThan(airborne.nodeY + 50)
  await page.waitForTimeout(600)
  const standing = await debugState(page)
  await tap(page, 'jump')
  await page.waitForTimeout(120)
  expect((await debugState(page)).nodeY, 'jumped a second time').toBeLessThan(standing.nodeY - 50)

  expect(app.errors()).toEqual([])
})

test('walk into a wall long enough and the pig is thrown out of it', async ({ app }) => {
  const { page } = app
  await page.locator('#menu-new-game').click()
  await expect(page.locator('#battle')).toBeVisible()

  // A real wall on the battle map with the ground falling away behind it:
  // the pig starts a tile and a half west of it, facing straight at it.
  const wall = wallAboveASlope()
  const EAST = Math.PI / 2
  await warp(page, wall.x - 768, wall.z, EAST)

  await press(page, 'walkForward')
  let inside = await debugState(page)
  try {
    // Nothing refuses the step, so it walks IN — and lands on a floor with
    // 0.99 restitution and 0.01 friction, which shakes it about.
    await expect
      .poll(async () => !wall.query.walkable(...positionOf(await debugState(page))), {
        message: 'walked into the wall'
      })
      .toBe(true)
    inside = await debugState(page)
  } finally {
    // Let go before asking whether it got out: held, the key just walks it
    // straight back in after every ejection.
    await release(page, 'walkForward')
  }

  // And it does not stay there. Which way out it takes is the terrain's
  // business — 0.01 friction slides it off a slope, and the wedge counter
  // throws it clear if the ground is too flat to slide on — but out it goes,
  // and that is the property worth holding: a pig left in a wall is a pig
  // that cannot be played.
  await expect
    .poll(async () => wall.query.walkable(...positionOf(await debugState(page))), {
      message: 'came back out of the wall',
      timeout: 8000
    })
    .toBe(true)

  // It comes back down rather than sailing off.
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

  // And it is OUT: standing where a pig may stand. This is the one that
  // matters — a pig left inside a wall is a pig that cannot be played.
  const landed = await debugState(page)
  expect(wall.query.walkable(...positionOf(landed)), 'not left inside the wall').toBe(true)

  expect(app.errors()).toEqual([])
})

test('a jump cannot be started from inside a wall, so it is no ladder', async ({ app }) => {
  const { page } = app
  await page.locator('#menu-new-game').click()
  await expect(page.locator('#battle')).toBeVisible()

  // Riding a jump into a cliff face, landing higher up it and going again is
  // how a pig once climbed over everything and off the map. Walking in is
  // allowed — the original refuses nothing about the ground — but the jump
  // is not: "Can't jump from this tile type". So the climb ends on the first
  // landing inside the wall.
  const wall = wallAboveASlope()
  const EAST = Math.PI / 2
  await warp(page, wall.x - 768, wall.z, EAST)

  await press(page, 'walkForward')
  try {
    await expect
      .poll(async () => !wall.query.walkable(...positionOf(await debugState(page))), {
        message: 'walked into the wall'
      })
      .toBe(true)

    const inside = await debugState(page)
    await tap(page, 'jump')
    await page.waitForTimeout(150)
    const after = await debugState(page)
    // It may be shuddering on that near-elastic floor, but not JUMPING: a
    // jump clears far more than the contact does.
    expect(after.nodeY, 'no jump out of a wall').toBeGreaterThan(inside.nodeY - 200)
    expect(Math.abs(after.x)).toBeLessThanOrEqual(WORLD_LIMIT)
    expect(Math.abs(after.z)).toBeLessThanOrEqual(WORLD_LIMIT)
  } finally {
    await release(page, 'walkForward')
  }

  expect(app.errors()).toEqual([])
})
