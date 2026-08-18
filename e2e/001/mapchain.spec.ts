// PHASE 001 — the MISSION CHAIN: the world map, the zoom, the region with
// its flags, and the briefing page that is also the loading screen
// (`pigmap/notes.md` in the disasm repo). The training ground skips the map
// — the exe's own gate — which is why this spec walks the NO path: declining
// the tutorial launches position 1 through the whole chain.

import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { test } from '../app'
import { FIRST_ARMY, TEST_TEAM, choose, nameTeam } from '../menu'
import { tap } from '../controller'

const mapPhase = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { pigMap?: { phase(): string } } }).pow
    if (!pow?.pigMap) throw new Error('pow.pigMap is missing')
    return pow.pigMap.phase()
  })

const briefingReady = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { briefing?: { ready(): boolean } } }).pow
    return pow?.briefing ? pow.briefing.ready() : false
  })

test('declining the tutorial launches through the map: world, zoom, region, briefing', async ({
  app
}) => {
  const { page } = app
  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await choose(page, 'NEW GAME', 'onePlayer')
  await expect(page.locator('#team')).toBeVisible()
  await choose(page, FIRST_ARMY, 'teamScreen')
  await expect(page.locator('#name')).toBeVisible()
  await nameTeam(page, TEST_TEAM)
  await expect(page.locator('#player')).toBeVisible()

  // START at position 0 asks the original's question; NO steps past the
  // training ground and launches position 1 — through the MAP.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const pow = (window as unknown as { pow?: { playerScreen?: { flipping(): boolean } } })
            .pow
          return pow?.playerScreen ? pow.playerScreen.flipping() : true
        }),
      { message: 'the player screen is still driving in' }
    )
    .toBe(false)
  await tap(page, 'menuSelect')
  await expect(page.locator('#ask')).toBeVisible()
  await choose(page, 'NO', 'askTraining')

  // The world map first, then a key a phase — the exe's own skip.
  await expect(page.locator('#pigmap')).toBeVisible()
  await expect.poll(() => mapPhase(page)).toBe('world')
  await tap(page, 'menuSelect')
  await expect.poll(() => mapPhase(page)).toBe('zoom')
  await tap(page, 'menuSelect')
  await expect.poll(() => mapPhase(page)).toBe('region')
  await tap(page, 'menuSelect')

  // The chain always ends on the BRIEFING, which is the loading screen: the
  // bar walks while the level loads, and a key on the loaded page starts.
  await expect(page.locator('#briefing')).toBeVisible()
  await expect
    .poll(() => briefingReady(page), { message: 'the briefing is still loading the level' })
    .toBe(true)
  await tap(page, 'menuSelect')
  await expect(page.locator('#battle')).toBeVisible()

  // Walking out is an abort: back to the squad, nothing settled.
  await page.locator('#battle-leave').click()
  await expect(page.locator('#player')).toBeVisible()

  expect(app.errors()).toEqual([])
})

test('back on the map skips the whole chain to the briefing', async ({ app }) => {
  const { page } = app
  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await choose(page, 'NEW GAME', 'onePlayer')
  await expect(page.locator('#team')).toBeVisible()
  await choose(page, FIRST_ARMY, 'teamScreen')
  await expect(page.locator('#name')).toBeVisible()
  await nameTeam(page, TEST_TEAM)
  await expect(page.locator('#player')).toBeVisible()
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const pow = (window as unknown as { pow?: { playerScreen?: { flipping(): boolean } } })
            .pow
          return pow?.playerScreen ? pow.playerScreen.flipping() : true
        }),
      { message: 'the player screen is still driving in' }
    )
    .toBe(false)
  await tap(page, 'menuSelect')
  await expect(page.locator('#ask')).toBeVisible()
  await choose(page, 'NO', 'askTraining')
  await expect(page.locator('#pigmap')).toBeVisible()
  await expect.poll(() => mapPhase(page)).toBe('world')

  // The remake's own shortcut: BACK drops the whole animation.
  await tap(page, 'menuBack')
  await expect(page.locator('#briefing')).toBeVisible()
  await expect
    .poll(() => briefingReady(page), { message: 'the briefing is still loading the level' })
    .toBe(true)
  await tap(page, 'menuSelect')
  await expect(page.locator('#battle')).toBeVisible()
  await page.locator('#battle-leave').click()
  await expect(page.locator('#player')).toBeVisible()

  expect(app.errors()).toEqual([])
})
