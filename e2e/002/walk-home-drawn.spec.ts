// PHASE 002 (app) — THE WALK HOME IS DRAWN.
//
// The engine's half is e2e/002/walk-home.spec.ts and unit/walkHome.spec.ts, and both
// read the engine. A debug read is not a paint check (docs/testing.md): this polls the
// DRAWN NODE of a pig the throw has carried past the line, out and back again, in the
// live scene.
//
// LIBERATE, because it fields two sides and it is one of the seven maps whose every tile
// outside the box has a way home (`terrain/boundary.md`).

import path from 'node:path'

import { expect, test } from '../app'
import { openBattle } from '../load'
import { GAME_DIR } from '../launch'
import { loadTerrain } from '../../src/main/assets'
import { buildQuery, STEP_SECONDS } from '../../src/lib/game/engine'
import { createLocomotion, updateLocomotion } from '../../src/lib/game/locomotion'
import { THROWN_LIMIT, WORLD_LIMIT } from '../../src/lib/game/terrain'
import type { TerrainQuery } from '../../src/lib/game/terrain'
import { flingVelocity } from '../../src/lib/game/tumble'

type Page = import('@playwright/test').Page

interface FlingDebug {
  flingOther(speed?: number): { pig: number; x: number; z: number } | null
  nodeAt(id: number): { x: number; y: number; z: number } | null
}

const flingOther = (page: Page, speed: number): Promise<{ pig: number; x: number; z: number } | null> =>
  page.evaluate((thrown) => {
    const pow = (window as unknown as { pow?: { debug?: FlingDebug } }).pow
    if (!pow?.debug) throw new Error('no battle scene is up')
    return pow.debug.flingOther(thrown)
  }, speed)

const nodeOf = (page: Page, pig: number): Promise<{ x: number; y: number; z: number }> =>
  page.evaluate((id) => {
    const pow = (window as unknown as { pow?: { debug?: FlingDebug } }).pow
    if (!pow?.debug) throw new Error('no battle scene is up')
    const node = pow.debug.nodeAt(id)
    if (node === null) throw new Error(`pig ${id} has no drawn node`)
    return node
  }, pig)

/**
 * The throw along +z that lands a pig standing at (x, z) on dry ground past the line and
 * short of the far limit, measured with the flight itself over the map's own ground.
 * `flingOther` throws at a bearing of nought.
 */
const speedFor = (query: TerrainQuery, x: number, y: number, z: number): number => {
  for (let speed = 1000; speed < 60000; speed += 250) {
    const state = createLocomotion(query, x, z, 0)
    state.heldAtLimit = false
    state.y = y
    state.airborne = { ...flingVelocity(speed, 0), bouncing: true, pushIn: null, hurled: true }
    for (let step = 0; step < 3000 && state.airborne !== null; step++) {
      updateLocomotion(state, query, { walk: 0, turn: 0, jump: false }, STEP_SECONDS)
    }
    const landedOut = state.z > WORLD_LIMIT + 300 && state.z < THROWN_LIMIT - 300
    if (state.airborne === null && landedOut && !query.isWater(state.x, state.z)) return speed
  }
  throw new Error('no throw lands this pig past the line')
}

test('a pig thrown past the line is drawn out there, and drawn coming back', async ({ app }) => {
  test.setTimeout(120_000)
  const { page } = app
  await openBattle(page, 'LIBERATE')

  const terrain = await loadTerrain(path.join(GAME_DIR, 'Maps', 'LIBERATE.PMG'))
  const query = buildQuery(terrain.blocks, terrain.textures)

  // Asked at a speed of one it says who it would throw and from where, and the throw is
  // nothing next to the one that follows.
  const who = await flingOther(page, 1)
  expect(who, 'somebody other than the acting pig to throw').not.toBeNull()
  if (who === null) return
  await page.waitForTimeout(500)
  const start = await nodeOf(page, who.pig)
  await flingOther(page, speedFor(query, start.x, start.y, start.z))

  // exe: terrain/boundary.md — no line for a thrown pig. The DRAWN node goes past it.
  await expect
    .poll(async () => (await nodeOf(page, who.pig)).z, {
      message: 'the drawn pig never went past the line',
      timeout: 30_000
    })
    .toBeGreaterThan(WORLD_LIMIT)
  // …and it comes back by itself: fifty frames, the turn on the spot, and the run.
  await expect
    .poll(async () => (await nodeOf(page, who.pig)).z, {
      message: 'the drawn pig never came back over the line',
      timeout: 60_000
    })
    .toBeLessThanOrEqual(WORLD_LIMIT)

  expect(app.errors()).toEqual([])
})
