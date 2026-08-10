// PHASE 002 (app) — a grenade in WATER goes down and does not go off.
//
// Play, twice: "граната НЕ ТОНЕТ В ВОДЕ, должна прям тонуть и идти вниз", and then
// "граната сразу взрывается как только начинает тонуть — должна тонуть пару секунд,
// уходить под воду. Это совсем другой механизм ведь." It is: the engine's contact
// arm sets the projectile's quiet flag (0x437d34) and the destructor's first test
// then spawns nothing and plays nothing at all (0x4328c9), so a doused grenade
// leaves without a blast. The couple of seconds of sinking on top are the remake's,
// because the shipped maps have no depth to sink through (`lib/game/grenade.ts`).
//
// Nothing pure can see this: the douse happens in the SCENE, against the map's own
// water, and every previous water bug has lived in exactly that join.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { beginTurn, hold, warp } from '../controller'
import { startGame } from '../menu'
import { parsePmg } from '../../src/lib/formats/pmg'
import { TerrainQuery } from '../../src/lib/game/terrain'
import { WATER_SINK_SECONDS, WATER_SINK_SPEED } from '../../src/lib/game/grenade'

const GRENADE = 19

/**
 * Where to stand and which way to face to put a grenade in CAMP's pond: the dry
 * walkable spot nearest the middle of it, looking at that middle.
 *
 * **Not standing IN it, which this spec used to do.** The water takes a pig's
 * weapon away and does not give it back until it is out (lib/game/battle.ts,
 * play's own rule), so a swimming pig cannot throw anything at all — the throw
 * has to come off the bank. Measured: from 786 units out, a 600 ms hold on the
 * gauge carries it into the water, a 250 ms one lands it on the mud.
 */
const bank = (): { x: number; z: number; heading: number } => {
  const query = new TerrainQuery(parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG'))))
  const wet: { x: number; z: number }[] = []
  for (let x = -16000; x < 16000; x += 128) {
    for (let z = -16000; z < 16000; z += 128) {
      if (query.isWater(x, z)) wet.push({ x, z })
    }
  }
  if (wet.length === 0) throw new Error('CAMP has no water — the map is not what this spec thinks')
  const mid = {
    x: wet.reduce((sum, one) => sum + one.x, 0) / wet.length,
    z: wet.reduce((sum, one) => sum + one.z, 0) / wet.length
  }
  let best = { x: 0, z: 0, away: Infinity }
  for (let x = -16000; x < 16000; x += 64) {
    for (let z = -16000; z < 16000; z += 64) {
      if (query.isWater(x, z) || !query.walkable(x, z)) continue
      const away = Math.hypot(x - mid.x, z - mid.z)
      if (away < best.away) best = { x, z, away }
    }
  }
  if (best.away === Infinity) throw new Error('CAMP has no dry ground by its pond')
  return { x: best.x, z: best.z, heading: Math.atan2(mid.x - best.x, mid.z - best.z) }
}

/** How long the gauge is held to clear the rim — measured, see `bank`. */
const OVER_THE_RIM = 600

type Page = import('@playwright/test').Page

interface Live {
  x: number
  y: number
  z: number
  fuse: number
}

const thrown = (page: Page): Promise<Live[]> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow: { debug: { grenades(): Live[] } } }).pow
    return pow.debug.grenades()
  })

const sounds = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow: { debug: { sounds(): string[] } } }).pow
    return pow.debug.sounds()
  })

test('dropped in the drink it SINKS, for a couple of seconds, and never goes off', async ({
  app
}) => {
  const { page } = app
  const at = bank()
  await startGame(page)
  // On the bank, LOOKING at the water — see `bank` for why not in it.
  await warp(page, at.x, at.z, at.heading)
  await beginTurn(page)
  expect(
    await page.evaluate(() => {
      const pow = (window as unknown as { pow: { give(skill: number): boolean } }).pow
      return pow.give(19)
    })
  ).toBe(true)
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const pow = (window as unknown as { pow: { debug: { holding(): number | null } } }).pow
        return pow.debug.holding()
      })
    )
    .toBe(GRENADE)

  // Over the rim and into the water — the measured hold, and not a tap: a tap
  // drops it at the pig's own feet, which is now dry ground and a blast.
  const quiet = (await sounds(page)).length
  await hold(page, 'fire', OVER_THE_RIM)

  // It arrives, and once it does its y only ever GROWS: game space is Y-down, so
  // sinking is downward and there is nothing to stop it — not the bed, which is the
  // same plane as the water it went into.
  await expect.poll(async () => (await thrown(page)).length, { timeout: 4000 }).toBeGreaterThan(0)
  let deepest = -Infinity
  let shallowest = Infinity
  const started = Date.now()
  while (Date.now() - started < WATER_SINK_SECONDS * 1000) {
    const live = await thrown(page)
    if (live.length === 0) break
    deepest = Math.max(deepest, live[0].y)
    shallowest = Math.min(shallowest, live[0].y)
  }
  // It went DOWN, and by something like the rate it is supposed to.
  expect(deepest - shallowest, 'it sank').toBeGreaterThan(WATER_SINK_SPEED)

  // …and then it is simply gone, with no blast anywhere in it. `E_1` is the blast
  // and `FT_WATER` is the douse; a doused grenade plays the second and never the
  // first (0x4328c9 takes the silent branch).
  await expect
    .poll(async () => (await thrown(page)).length, { timeout: 4000 })
    .toBe(0)
  const heard = (await sounds(page)).slice(quiet)
  expect(heard, 'it splashed').toContain('FT_WATER')
  expect(heard, 'and did NOT go off').not.toContain('E_1')

  expect(app.errors()).toEqual([])
})
