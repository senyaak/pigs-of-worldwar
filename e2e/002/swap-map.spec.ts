// PHASE 002 (app) — the console map selector. There is deliberately no UI
// for this: `pow.swapMap('ARTGUN')` in the devtools console restarts the
// battle on another shipped map (fresh spawns, fresh turn order), a name
// that does not ship refuses and keeps the battle running, and the bare
// call is a usage hint. CAMP has no climbing ground at all, so this is also
// how the Scramble is reached by hand.

import { existsSync } from 'node:fs'

import { PHASE_ENV } from '../launch'
import { expect, test } from '../app'
import { debugState, hold, hud, swapMap } from '../controller'
import { startGame } from '../menu'
import type { Page } from '@playwright/test'

const mapName = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { map?(): string } }).pow
    if (!pow?.map) throw new Error('pow.map is missing — is the battle module loaded?')
    return pow.map()
  })

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 002 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

test('the console swaps the map; a name that does not ship is refused', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()
  expect(await mapName(page)).toBe('CAMP')

  // Case and decoration do not matter: it is a console, not a parser test.
  expect(await swapMap(page, 'maps/artgun.pmg')).toBe(true)
  expect(await mapName(page)).toBe('ARTGUN')

  // A fresh battle there: turn 1 again, and the pig is playable ground truth
  // — it stands somewhere real and walking moves it.
  await expect
    .poll(() => hud(page))
    // A grunt has fifty — the class's own maximum (lib/game/health.ts).
    .toMatchObject({ turn: 1, side: "TOMMY'S TROTTERS", pig: 'NOBBY', health: 50 })
  const start = await debugState(page)
  await hold(page, 'walkForward', 400)
  const walked = await debugState(page)
  expect(Math.hypot(walked.x - start.x, walked.z - start.z)).toBeGreaterThan(100)

  // Garbage keeps the battle exactly where it was.
  expect(await swapMap(page, 'NOSUCHMAP')).toBe(false)
  expect(await mapName(page)).toBe('ARTGUN')
  expect((await hud(page)).side).toBe("TOMMY'S TROTTERS")

  // The bare call is the usage hint, not a swap.
  expect(await swapMap(page)).toBe(false)
  expect(await mapName(page)).toBe('ARTGUN')

  // Back to the default for the specs that share this app.
  expect(await swapMap(page, 'CAMP')).toBe(true)
  expect(await mapName(page)).toBe('CAMP')

  expect(app.errors()).toEqual([])
})
