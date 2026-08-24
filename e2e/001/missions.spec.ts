// PHASE 001 — MISSION SELECT (ui/missionSelect.ts): the squad screen's
// replay door, LOAD GAME's furniture over the completed missions, each row
// carrying its PP record. The banking rule is pinned in unit/save.spec.ts;
// this drives the screen.

import fs from 'node:fs'
import path from 'node:path'
import { expect } from '@playwright/test'

import { test } from '../app'
import { SAVE_DIR } from '../launch'
import { choose, labels, selection, values } from '../menu'
import { tap } from '../controller'
import { newGame, serialise } from '../../src/lib/game/save'
import { newSquad } from '../../src/lib/game/roster'

test('the completed missions are listed, name left and record right', async ({ app }) => {
  const { page } = app

  // A campaign three missions in, with a record at position 1 — planted as a
  // save file, the way the pig-menu's rich fixture is.
  const veteran = {
    ...newGame(
      'VETERAN',
      0,
      newSquad(
        ['JONES', 'DEN', 'BASIL', 'GINGER', 'MONTY', 'SMITH', 'PONSONBY', 'PERCY'],
        [0, 1, 2, 3, 4, 5, 6, 7]
      ),
      new Date().toISOString()
    ),
    position: 3,
    tokens: 2,
    best: [0, 1, 0]
  }
  fs.mkdirSync(SAVE_DIR, { recursive: true })
  fs.writeFileSync(path.join(SAVE_DIR, 'savearmy6.json'), serialise(veteran))

  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await choose(page, 'LOAD GAME', 'onePlayer')
  await expect(page.locator('#load')).toBeVisible()
  await choose(page, 'VETERAN', 'loadScreen')
  await expect(page.locator('#player')).toBeVisible()
  // The screen answers SELECT only once it has driven in.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const pow = (window as unknown as { pow?: { playerScreen?: { flipping(): boolean } } })
          .pow
        return pow?.playerScreen ? pow.playerScreen.flipping() : true
      })
    )
    .toBe(false)

  // Down once from START MISSION and choose: the replay list stands up.
  await tap(page, 'menuDown')
  expect(await selection(page, 'playerScreen')).toBe(9)
  await tap(page, 'menuSelect')
  await expect(page.locator('#missions')).toBeVisible()

  // EVERY real mission is a row and boot camp is not one (play: "тренировку
  // туда не пихай"); the window shows the first eight. The two the campaign
  // is past carry their pair — completion + survival is what a map with no
  // specials can pay, and the parse floor gives the old pickup-only records
  // their completion point — and every locked row is grey: no pair at all.
  await expect.poll(() => labels(page, 'missionSelect')).toHaveLength(8)
  const names = await labels(page, 'missionSelect')
  expect(names[0]).toContain('THE WAR FOUNDATION')
  expect(names.join(' ')).not.toContain('BOOT CAMP')
  const pairs = await values(page, 'missionSelect')
  expect(pairs).toEqual(['1/2', '1/2', null, null, null, null, null, null])

  // …and it is PAINTED, not only computed (CLAUDE.md's rule).
  const distinctColors = (): Promise<number> =>
    page.evaluate(() => {
      const canvas = document.getElementById('missions-screen') as HTMLCanvasElement
      const context = canvas.getContext('2d')
      if (!context) return -1
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const seen = new Set<number>()
      for (let i = 0; i < pixels.length; i += 4) {
        seen.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2])
      }
      return seen.size
    })
  await expect.poll(distinctColors, { message: 'the painted mission list' }).toBeGreaterThan(50)

  // BACK is the squad.
  await tap(page, 'menuBack')
  await expect(page.locator('#player')).toBeVisible()

  await tap(page, 'menuBack')
  await expect(page.locator('#menu')).toBeVisible()
  expect(app.errors()).toEqual([])
})
