// PHASE 002 (app) — the console map selector. There is deliberately no UI
// for this: `pow.swapMap('ARTGUN')` in the devtools console restarts the
// battle on another shipped map (fresh spawns, fresh turn order), a name
// that does not ship refuses and keeps the battle running, and the bare
// call is a usage hint. CAMP has no climbing ground at all, so this is also
// how the Scramble is reached by hand.

import { existsSync } from 'node:fs'

import { PHASE_ENV } from '../launch'
import { expect, test } from '../app'
import { debugState, hold } from '../controller'
import { startGame } from '../menu'
import type { Page } from '@playwright/test'

const swapMap = (page: Page, name?: string): Promise<boolean> =>
  page.evaluate((n) => {
    const pow = (window as unknown as { pow?: { swapMap?(name?: string): Promise<boolean> } }).pow
    if (!pow?.swapMap) throw new Error('pow.swapMap is missing — is the battle module loaded?')
    return pow.swapMap(n)
  }, name)

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
  await expect(page.locator('#battle-hud')).toHaveText(
    /Turn 1 — Tommy’s Trotters: Tommy \(100 hp, \d+s\)/
  )
  const start = await debugState(page)
  await hold(page, 'walkForward', 400)
  const walked = await debugState(page)
  expect(Math.hypot(walked.x - start.x, walked.z - start.z)).toBeGreaterThan(100)

  // Garbage keeps the battle exactly where it was.
  expect(await swapMap(page, 'NOSUCHMAP')).toBe(false)
  expect(await mapName(page)).toBe('ARTGUN')
  await expect(page.locator('#battle-hud')).toHaveText(/Tommy’s Trotters/)

  // The bare call is the usage hint, not a swap.
  expect(await swapMap(page)).toBe(false)
  expect(await mapName(page)).toBe('ARTGUN')

  // Back to the default for the specs that share this app.
  expect(await swapMap(page, 'CAMP')).toBe(true)
  expect(await mapName(page)).toBe('CAMP')

  expect(app.errors()).toEqual([])
})
