// PHASE 001 — the PLAYER screen, record 12: the squad the campaign starts with.
//
// The rules it draws by are `lib/game/ranks.ts` and `unit/ranks.spec.ts`; this
// is about the screen — that the eight pigs arrive on it with the names their
// nation gives them, that it paints, and that START MISSION opens the battle.

import { expect } from '@playwright/test'

import { test } from '../app'
import { FIRST_ARMY, TEST_TEAM, choose, labels, nameTeam, selection, values } from '../menu'
import { tap } from '../controller'

async function toPlayerScreen(page: import('@playwright/test').Page): Promise<void> {
  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await choose(page, 'NEW GAME', 'onePlayer')
  await expect(page.locator('#team')).toBeVisible()
  await choose(page, FIRST_ARMY, 'teamScreen')
  await expect(page.locator('#name')).toBeVisible()
  await nameTeam(page, TEST_TEAM)
  await expect(page.locator('#player')).toBeVisible()
}

test('the squad arrives with eight named pigs, all GRUNTs', async ({ app }) => {
  const { page } = app
  await toPlayerScreen(page)

  // TOMMY'S TROTTERS' own nine, of which a squad takes eight — fetext 167
  // onwards (lib/game/teams.ts).
  // START MISSION alone past the pigs — SAVE TEAM went with the autosave
  // (docs/todo.md: SAVE ARMY is deliberately never built).
  await expect.poll(() => labels(page, 'playerScreen')).toEqual([
    'NOBBY', 'GINGER', 'DEN', 'MONTY', 'BASIL', 'PONSONBY', 'PERCY', 'SMITH',
    'START MISSION'
  ])

  // Everyone starts a GRUNT — the manual says so and the tree agrees, class 0
  // being the only one with four ways out.
  const ranks = await values(page, 'playerScreen')
  expect(ranks.slice(0, 8)).toEqual(Array(8).fill('GRUNT'))

  // And it is painted, the same reading every other frontend screen gets.
  const distinctColors = async (): Promise<number> =>
    page.evaluate(() => {
      const canvas = document.getElementById('player-screen') as HTMLCanvasElement
      const context = canvas.getContext('2d')
      if (!context) return -1
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const seen = new Set<number>()
      for (let i = 0; i < pixels.length; i += 4) {
        seen.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2])
      }
      return seen.size
    })
  await expect.poll(distinctColors, { message: 'the painted player screen' }).toBeGreaterThan(50)

  await tap(page, 'menuBack')
  await expect(page.locator('#name')).toBeVisible()
  expect(app.errors()).toEqual([])
})

test('it opens on START MISSION, and the grid is two columns of five and three', async ({ app }) => {
  const { page } = app
  await toPlayerScreen(page)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const pow = (window as unknown as { pow?: { playerScreen?: { flipping(): boolean } } }).pow
          return pow?.playerScreen ? pow.playerScreen.flipping() : true
        }),
      { message: 'the player screen is still driving in' }
    )
    .toBe(false)

  // Place 8 is START MISSION — the screen opens on it, so a player who wants
  // nothing else presses once.
  expect(await selection(page, 'playerScreen')).toBe(8)

  // Up walks the list, which — the grid standing up as two columns — is up the
  // right-hand three and on into the left-hand five.
  await tap(page, 'menuUp')
  expect(await selection(page, 'playerScreen')).toBe(7)
  await tap(page, 'menuUp')
  expect(await selection(page, 'playerScreen')).toBe(6)

  // Sideways CROSSES the columns at the same row: slot 6 is the right column's
  // second, so it lands on the left column's second.
  await tap(page, 'menuLeft')
  expect(await selection(page, 'playerScreen')).toBe(1)

  await tap(page, 'menuBack')
  await expect(page.locator('#name')).toBeVisible()
  expect(app.errors()).toEqual([])
})
