// PHASE 001 — LOAD GAME, record 10: a campaign that went to disk comes back.
//
// The write half is NEW GAME's (`campaign.begin`); this drives the read half:
// the slot list is the real folder (`POW_SAVE_DIR`, e2e/launch.ts), the chosen
// slot becomes the campaign, and the squad stands up on it.

import { expect } from '@playwright/test'

import { test } from '../app'
import { FIRST_ARMY, TEST_TEAM, choose, labels, nameTeam, values } from '../menu'
import { tap } from '../controller'

test('a saved campaign is listed and loads back to its squad', async ({ app }) => {
  const { page } = app

  // Raise a campaign, which autosaves on the way to the squad screen…
  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await choose(page, 'NEW GAME', 'onePlayer')
  await expect(page.locator('#team')).toBeVisible()
  await choose(page, FIRST_ARMY, 'teamScreen')
  await expect(page.locator('#name')).toBeVisible()
  await nameTeam(page, TEST_TEAM)
  await expect(page.locator('#player')).toBeVisible()

  // …walk all the way out…
  await tap(page, 'menuBack')
  await tap(page, 'menuBack')
  await tap(page, 'menuBack')
  await expect(page.locator('#oneplayer')).toBeVisible()

  // …and LOAD GAME lists it: the team's name on the bar, the campaign's
  // progress on the right. A fresh campaign stands at 0 of 26.
  await choose(page, 'LOAD GAME', 'onePlayer')
  await expect(page.locator('#load')).toBeVisible()
  await expect.poll(() => labels(page, 'loadScreen')).toContain(TEST_TEAM)
  const listed = await labels(page, 'loadScreen')
  const slot = listed.indexOf(TEST_TEAM)
  expect((await values(page, 'loadScreen'))[slot]).toBe('0/26')

  // Choosing it stands the squad up again, eight pigs and START MISSION.
  await choose(page, TEST_TEAM, 'loadScreen')
  await expect(page.locator('#player')).toBeVisible()
  await expect.poll(() => labels(page, 'playerScreen')).toContain('START MISSION')

  await tap(page, 'menuBack')
  await expect(page.locator('#name')).toBeVisible()
  expect(app.errors()).toEqual([])
})
