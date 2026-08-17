// PHASE 001 — the MISSION MAP: the campaign's 26 on the cheat screen's
// mechanics, and the tutorial question's NO path that leads there.

import { expect } from '@playwright/test'

import { test } from '../app'
import { FIRST_ARMY, TEST_TEAM, choose, labels, selection, values, nameTeam } from '../menu'
import { tap } from '../controller'

test('NO to the tutorial lands on the map, and only the current mission launches', async ({
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
  // training ground (0x42C37E's own move) and opens the MAP. The squad
  // screen refuses a press while it is still driving in, so wait it out.
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
  await expect(page.locator('#missions')).toBeVisible()

  // The 26 wear their gtext titles, and the cursor stands on the first real
  // mission — position 1, THE WAR FOUNDATION, with BOOT CAMP done above it.
  await expect.poll(() => labels(page, 'missionList')).toHaveLength(26)
  const names = await labels(page, 'missionList')
  expect(names[0]).toBe('BOOT CAMP')
  expect(names[1]).toBe('THE WAR FOUNDATION')
  expect(names[25]).toBe('WELL, WELL, WELL!')
  expect(await selection(page, 'missionList')).toBe(1)
  const marks = await values(page, 'missionList')
  expect(marks[0]).toBe('done')
  expect(marks[1]).toBe('next')

  // A FUTURE mission refuses to be chosen: the cursor browses there and
  // SELECT is swallowed.
  await tap(page, 'menuDown')
  expect(await selection(page, 'missionList')).toBe(2)
  await tap(page, 'menuSelect')
  await expect(page.locator('#missions')).toBeVisible()

  // Back on the current one, SELECT launches the mission.
  await tap(page, 'menuUp')
  expect(await selection(page, 'missionList')).toBe(1)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const pow = (window as unknown as { pow?: { missionList?: { flipping(): boolean } } })
            .pow
          return pow?.missionList ? pow.missionList.flipping() : true
        }),
      { message: 'the mission map is still driving in' }
    )
    .toBe(false)
  await tap(page, 'menuSelect')
  await expect(page.locator('#battle')).toBeVisible()

  // Walking out is an abort: back to the squad, nothing settled.
  await page.locator('#battle-leave').click()
  await expect(page.locator('#player')).toBeVisible()

  expect(app.errors()).toEqual([])
})
