// PHASE 002 (app) — water HURTS, and a turn ends with a beat and a swim out.
//
// Play: "нет урона в воде — должен быть для всех кроме определённых классов", and
// "когда кончается ход — управление отключается и все кто в воде плывут к берегу
// ближайшим путём… конец хода наступает мгновенно — там хотя бы секунду надо
// задержки между ходами."
//
// Both are decoded — the ramp in the tail of the pig's own ground update
// (`lib/game/drowning.ts`) and the beat in the exe's mode 13, WALK AWAY
// (`lib/game/walkAway.ts`) — and NEITHER can be seen from a pure spec: the
// verdict "this point is water" comes off the map's own art through the scene's
// terrain query, and the beat is a phase of the running battle.
//
// The damage is deliberately invisible in the game itself (the exe's floating
// number is gated above 0x7f and water's cap is 0x40), so the health the
// dashboard carries is the only thing that reports it — which is what this reads.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { beginTurn, hud, skipTurn, warp } from '../controller'
import { startGame } from '../menu'
import { parsePmg } from '../../src/lib/formats/pmg'
import { TerrainQuery } from '../../src/lib/game/terrain'
import { TRAINING_FLOOR } from '../../src/lib/game/health'
import { WALK_AWAY_QUIET } from '../../src/lib/game/walkAway'

type Page = import('@playwright/test').Page

/** The middle of CAMP's pond, and a dry spot well away from it — both off the
 * map's own water flags, the same way `sink.spec.ts` finds them. */
const camp = (): { wet: { x: number; z: number }; dry: { x: number; z: number } } => {
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
  const middle = wet.reduce((best, one) =>
    Math.hypot(one.x - mid.x, one.z - mid.z) < Math.hypot(best.x - mid.x, best.z - mid.z) ? one : best
  )
  // Dry, walkable, and a good way from the water so the beat has nobody to wait
  // for — the pig's own spawn is exactly that.
  let dry: { x: number; z: number } | null = null
  for (let x = -8000; x <= 8000 && dry === null; x += 256) {
    for (let z = -8000; z <= 8000; z += 256) {
      if (query.isWater(x, z) || !query.walkable(x, z)) continue
      if (Math.hypot(x - middle.x, z - middle.z) < 4000) continue
      dry = { x, z }
      break
    }
  }
  if (dry === null) throw new Error('CAMP has no dry ground away from its pond')
  return { wet: middle, dry }
}

/**
 * How long the WALK AWAY beat lasts, in seconds — watched IN THE PAGE from
 * before it starts to after it ends.
 *
 * Polling from the test cannot do this: `expect.poll` backs off to a sample a
 * second and the beat is about a second long.
 */
const beatSeconds = (page: Page, ms = 30_000): Promise<number> =>
  page.evaluate((limit) => {
    const pow = (
      window as unknown as { pow?: { debug?: { walkAway(): { swimming: number } | null } } }
    ).pow
    if (!pow?.debug) throw new Error('no battle scene is up — window.pow.debug is missing')
    return new Promise<number>((resolve, reject) => {
      let began: number | null = null
      const deadline = performance.now() + limit
      const sample = (): void => {
        const running = pow.debug!.walkAway() !== null
        if (running && began === null) began = performance.now()
        if (!running && began !== null) {
          resolve((performance.now() - began) / 1000)
          return
        }
        if (performance.now() >= deadline) {
          reject(new Error(began === null ? 'the beat never started' : 'the beat never ended'))
          return
        }
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
  }, ms)

test('standing in it costs health, and the training ground still will not kill', async ({ app }) => {
  const { page } = app
  const at = camp()
  await startGame(page)
  await warp(page, at.wet.x, at.wet.z, 0)
  await beginTurn(page)
  expect((await hud(page)).swimming, 'the warp put it in the water').toBe(true)

  const started = (await hud(page)).health
  expect(started).toBeGreaterThan(10)
  // The bite RAMPS — it is the frame counter itself, in 128ths — so the first
  // points go slowly and then it bites half a point a frame. Doubled here,
  // because this is the pig whose turn it is.
  await expect.poll(async () => (await hud(page)).health, { timeout: 15_000 }).toBeLessThan(started - 5)

  // …and then it stops at ONE POINT, whatever else the water does: CAMP is the
  // training ground and its floor is the exe's own (0x467c85).
  await expect.poll(async () => (await hud(page)).health, { timeout: 30_000 }).toBe(TRAINING_FLOOR)
  await page.waitForTimeout(1000)
  expect((await hud(page)).health, 'the floor holds').toBe(TRAINING_FLOOR)

  expect(app.errors()).toEqual([])
})

test('the turn ends with a BEAT, and it swims a pig out of the water first', async ({ app }) => {
  const { page } = app
  const at = camp()
  await startGame(page)

  // On dry land the beat is the wait and nothing else — about a second.
  await warp(page, at.dry.x, at.dry.z, 0)
  await beginTurn(page)
  expect((await hud(page)).swimming, 'the dry spot is dry').toBe(false)
  const watching = beatSeconds(page)
  await skipTurn(page)
  const dryBeat = await watching
  expect(dryBeat, 'a turn does not hand over on the spot').toBeGreaterThan(WALK_AWAY_QUIET * 0.75)
  expect(dryBeat, 'and it does not hang about either').toBeLessThan(WALK_AWAY_QUIET + 3)

  // In the water it holds until the pig is ashore: the exe calls
  // `Pig::MakeForShore` for the ACTING pig only while mode 13 is up, so this is
  // the one moment it happens.
  await beginTurn(page)
  await warp(page, at.wet.x, at.wet.z, 0)
  expect((await hud(page)).swimming).toBe(true)
  const swimming = beatSeconds(page)
  await skipTurn(page)
  const wetBeat = await swimming
  expect(wetBeat, 'the beat waited for the swim').toBeGreaterThan(dryBeat)
  expect((await hud(page)).swimming, 'and it reached dry land').toBe(false)

  expect(app.errors()).toEqual([])
})
