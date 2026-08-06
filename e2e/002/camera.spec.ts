// PHASE 002 (app) — the chase camera, where it is hard to see and easy to
// break: going into the water.
//
// A swimming pig hangs SWIM_SINK below the surface, and the frame the water
// mask concedes it is swimming, it drops that whole distance at once — on
// this shore the bed sits exactly AT the water level, so nothing about the
// ground eases it in. The camera used to follow, which read as a lurch. It
// frames the pig less that sink now, so the two moves cancel: the pig sinks,
// the view does not move.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { press, release, warp } from '../controller'
import { startGame } from '../menu'
import { TILE_STEP, parsePmg } from '../../src/lib/formats/pmg'
import { parsePtg } from '../../src/lib/formats/ptg'
import { buildWaterMask } from '../../src/lib/game/watermask'
import { TerrainQuery } from '../../src/lib/game/terrain'
import { parsePog } from '../../src/lib/formats/pog'
import { ObstacleField } from '../../src/lib/game/obstacles'
import { SWIM_SINK, WALL_CLIMB } from '../../src/lib/game/locomotion'

/**
 * How far the camera holds itself ABOVE the acting pig, once it has stopped
 * gliding. Game space is Y-down, so the pig's world height is `-nodeY` and
 * the gap is `camY + nodeY`.
 *
 * A single frame proves nothing here: the camera eases toward where it wants
 * to be, so a 280-unit lurch in its target arrives as a dozen units a frame
 * and only shows up as the height it SETTLES at. Hence the wait.
 */
const settledGap = async (page: import('@playwright/test').Page): Promise<number> => {
  await page.waitForTimeout(1000)
  return page.evaluate(() => {
    const pow = (
      window as unknown as {
        pow: { debug: { currentNodeY(): number; camera(): { y: number } } }
      }
    ).pow
    return pow.debug.camera().y + pow.debug.currentNodeY()
  })
}

/** The lowest the camera gets over `ms`, sampled every animation frame. */
const lowestCamera = (page: import('@playwright/test').Page, ms: number): Promise<number> =>
  page.evaluate((limit) => {
    const pow = (window as unknown as { pow: { debug: { camera(): { y: number } } } }).pow
    return new Promise<number>((resolve) => {
      let low = Infinity
      const start = performance.now()
      const sample = (): void => {
        low = Math.min(low, pow.debug.camera().y)
        if (performance.now() - start >= limit) resolve(low)
        else requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
  }, ms)

/**
 * Dry, walkable ground on CAMP with SWIMMABLE water straight north of it —
 * and nothing in the way of walking there.
 *
 * The mask matters here: half the map's water-flagged tiles are the frozen
 * channel, walked on rather than swum in (lib/game/watermask), so a shore
 * picked off the flag alone can march a pig clean across the ice without
 * ever floating.
 *
 * So do the map's OBJECTS. The first shore this used to find sits under the
 * training ground's bridge, whose deck hangs 416 units over ground a pig is
 * 640 tall on: the pig walked north, met the underside and stopped one step
 * short of the water. That is the collision working, not failing — this
 * spec is about the camera, so it picks a shore with an open walk.
 */
function shoreOnCamp(): { x: number; z: number; query: TerrainQuery } {
  const blocks = parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG')))
  const textures = parsePtg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PTG')))
  const query = new TerrainQuery(blocks, buildWaterMask(blocks, textures))
  const objects = new ObstacleField(parsePog(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.POG'))))
  /** Every step of the walk in, with room for the pig's own width. */
  const openNorth = (x: number, z: number): boolean => {
    for (let step = 0; step <= 6; step++) {
      const at = z + step * TILE_STEP
      const footY = query.height(x, at)
      if (objects.blocks(x, at, footY, WALL_CLIMB)) return false
    }
    return true
  }
  for (let x = -14000; x < 14000; x += TILE_STEP) {
    for (let z = -14000; z < 14000; z += TILE_STEP) {
      if (query.isWater(x, z) || !query.walkable(x, z)) continue
      if (!query.isWater(x, z + 3 * TILE_STEP) || !query.isWater(x, z + 5 * TILE_STEP)) continue
      if (!openNorth(x, z)) continue
      return { x, z, query }
    }
  }
  throw new Error('no unobstructed shore with swimmable water north of it on CAMP')
}

test('the camera holds a swimming pig up by its whole sink', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  const shore = shoreOnCamp()

  // On dry land first: the gap the camera keeps when nothing is sunk.
  await warp(page, shore.x, shore.z, 0) // heading 0 is +z, straight at the water
  const onLand = await settledGap(page)

  // Then swim out. Held down long enough to cross the shelf, land, and get
  // onto art the mask calls water.
  await press(page, 'walkForward')
  const lowest = await lowestCamera(page, 2500)
  await release(page, 'walkForward')
  const afloat = await settledGap(page)

  const swimming = await page.evaluate(() => {
    const pow = (window as unknown as { pow: { debug: { currentNodeY(): number } } }).pow
    return pow.debug.currentNodeY()
  })
  expect(swimming, 'the pig ended up in the water').toBeLessThan(0)

  // The whole rule, in one number: afloat, the camera stands a swim sink
  // FURTHER above the pig than it does on land — which is what makes the
  // drop invisible, since the pig went down by exactly that.
  expect(afloat - onLand, 'the camera rose by the sink the pig fell').toBeGreaterThan(SWIM_SINK * 0.8)

  // And the view never went under the sheet it looks over: the water is
  // opaque, and from below it is the whole picture.
  const waterline = -shore.query.surface(shore.x, shore.z + 5 * TILE_STEP)
  expect(lowest, 'camera stayed above the waterline').toBeGreaterThan(waterline)
})
