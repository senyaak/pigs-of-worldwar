// PHASE 001 — the MULTI-PLAYER screen.
//
// Like the main menu it is the original's own, and the spec asserts what the
// DATA says rather than what the remake chose: the seven bars are fetext
// 60-63, 65, 66 and 64, and a team slot reads out of 330-332. Getting any of
// those indices wrong is exactly the mistake this pins.
//
// Three of the bars are dark and each is waiting on something real — an AI, a
// transport, a battle with knobs — and ui/multiPlayer.ts says which is which.
// DONE is the one that leads anywhere, and where it leads is a battle with
// two real squads in it, which is the whole point of the screen.

import { existsSync } from 'node:fs'

import { PHASE_ENV } from '../launch'
import { expect, test } from '../app'
import { tap } from '../controller'
import { choose, labels, nudge, selection, values } from '../menu'

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 001 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

/** Off the main menu and onto MULTI-PLAYER, the way a player gets there. */
async function open(page: import('@playwright/test').Page): Promise<void> {
  await choose(page, 'MULTI-PLAYER')
  await expect(page.locator('#multiplayer')).toBeVisible()
  await expect(page.locator('#menu')).toBeHidden()
}

test('MULTI-PLAYER is the original screen: four slots, three actions', async ({ app }) => {
  const { page } = app
  await open(page)

  await expect
    .poll(() => labels(page, 'multiPlayer'))
    .toEqual([
      'TEAM A',
      'TEAM B',
      'TEAM C',
      'TEAM D',
      'NETWORK',
      'FIELD CONDITIONS',
      'DONE'
    ])

  // A slot says what is in it; the three action bars carry no setting at all.
  // Two players and two empty is not a default a player picked — it is what
  // the battle can field, and ui/multiPlayer.ts says so.
  expect(await values(page, 'multiPlayer')).toEqual([
    'PLAYER',
    'PLAYER',
    'OFF',
    'OFF',
    null,
    null,
    null
  ])

  // Really painted, the same test the menu gets: a decode failure leaves it
  // blank where the art alone runs to hundreds of colours.
  const screen = page.locator('#mp-screen')
  await expect(screen).toHaveAttribute('width', '640')
  await expect(screen).toHaveAttribute('height', '480')
  const distinctColors = await page.evaluate(() => {
    const canvas = document.getElementById('mp-screen') as HTMLCanvasElement
    const context = canvas.getContext('2d')
    if (!context) return -1
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const seen = new Set<number>()
    for (let i = 0; i < pixels.length; i += 4) {
      seen.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2])
    }
    return seen.size
  })
  expect(distinctColors, 'the painted screen').toBeGreaterThan(50)

  expect(app.errors()).toEqual([])
})

test('a dark bar refuses to be chosen, and BACK returns to the menu', async ({ app }) => {
  const { page } = app
  await open(page)

  // NETWORK has nothing behind it yet. Choosing it must do NOTHING — not
  // throw, not leave the screen — because that is what the original does with
  // a bar it greys out.
  const bars = await labels(page, 'multiPlayer')
  const network = bars.indexOf('NETWORK')
  for (
    let at = await selection(page, 'multiPlayer');
    at !== network;
    at = await selection(page, 'multiPlayer')
  ) {
    await nudge(page, network > at ? 'menuDown' : 'menuUp', 'multiPlayer')
  }
  await tap(page, 'menuSelect')
  await expect(page.locator('#multiplayer')).toBeVisible()

  await tap(page, 'menuBack')
  await expect(page.locator('#menu')).toBeVisible()
  expect(app.errors()).toEqual([])
})

test('DONE opens a battle with two real squads in it', async ({ app }) => {
  const { page } = app
  await open(page)
  await choose(page, 'DONE', 'multiPlayer')
  await expect(page.locator('#battle')).toBeVisible()

  // The point of the screen: two sides, each fielded off the map's own spawn
  // markers, so a turn can actually be handed from one player to another.
  const squads = await page.evaluate(() =>
    (window as unknown as {
      pow: { debug: { squads(): { name: string; pigs: unknown[] }[] } }
    }).pow.debug.squads()
  )
  expect(squads.length, 'a two-sided map').toBe(2)
  for (const squad of squads) expect(squad.pigs.length).toBeGreaterThan(0)

  await page.locator('#battle-leave').click()
  await expect(page.locator('#menu')).toBeVisible()
  expect(app.errors()).toEqual([])
})
