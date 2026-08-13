// PHASE 001 — PLEASE NAME YOUR TEAM, record 15.
//
// The screen has no bars: the alphabet is one string and the cursor is an
// index into it, with three keys past its end (`lib/game/nameEntry.ts`, and
// `unit/nameEntry.spec.ts` for the rules). What this spec is for is the SCREEN
// — that it arrives, paints, takes a name and carries it into the campaign.

import { expect } from '@playwright/test'

import { test } from '../app'
import { FIRST_ARMY, choose, selection } from '../menu'
import { tap } from '../controller'

const typed = (page: import('@playwright/test').Page): Promise<string> =>
  page.evaluate(() => {
    const hooks = (window as unknown as { pow?: { nameScreen?: { typed(): string } } }).pow
      ?.nameScreen
    if (!hooks) throw new Error('the name screen is not up')
    return hooks.typed()
  })

/** The screen refuses a press while it is still driving in — the exe's own
 * gate, and the reason `lightBar` waits on the same thing. */
const settled = async (page: import('@playwright/test').Page): Promise<void> => {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const hooks = (window as unknown as { pow?: { nameScreen?: { flipping(): boolean } } })
            .pow?.nameScreen
          return hooks ? hooks.flipping() : true
        }),
      { message: 'the name screen is still driving in' }
    )
    .toBe(false)
}

const type = (page: import('@playwright/test').Page, text: string): Promise<void> =>
  page.evaluate((characters) => {
    const hooks = (window as unknown as { pow?: { nameScreen?: { type(c: string): void } } }).pow
      ?.nameScreen
    if (!hooks) throw new Error('the name screen is not up')
    for (const character of characters) hooks.type(character)
  }, text)

test('an army chosen opens the name entry, and it paints', async ({ app }) => {
  const { page } = app
  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await choose(page, 'NEW GAME', 'onePlayer')
  await expect(page.locator('#team')).toBeVisible()
  await choose(page, FIRST_ARMY, 'teamScreen')
  await expect(page.locator('#name')).toBeVisible()

  // Really painted, the same reading the other two screens get.
  const distinctColors = async (): Promise<number> =>
    page.evaluate(() => {
      const canvas = document.getElementById('name-screen') as HTMLCanvasElement
      const context = canvas.getContext('2d')
      if (!context) return -1
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const seen = new Set<number>()
      for (let i = 0; i < pixels.length; i += 4) {
        seen.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2])
      }
      return seen.size
    })
  await expect.poll(distinctColors, { message: 'the painted name screen' }).toBeGreaterThan(50)

  // It opens on the first letter, and nothing has been typed.
  await settled(page)
  expect(await selection(page, 'nameScreen')).toBe(0)
  expect(await typed(page)).toBe('')

  await tap(page, 'menuBack')
  await expect(page.locator('#team')).toBeVisible()
  expect(app.errors()).toEqual([])
})

test('the grid types, deletes and accepts', async ({ app }) => {
  const { page } = app
  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await choose(page, 'NEW GAME', 'onePlayer')
  await expect(page.locator('#team')).toBeVisible()
  await choose(page, FIRST_ARMY, 'teamScreen')
  await expect(page.locator('#name')).toBeVisible()
  await settled(page)

  // The GRID: the cursor starts on A, and choosing it types one.
  await tap(page, 'menuSelect')
  await expect.poll(() => typed(page)).toBe('A')

  // Right off the end of a row lands in the keys' column — 42 is DELETE — and
  // choosing it takes the A back off again.
  for (let i = 0; i < 8; i++) {
    if ((await selection(page, 'nameScreen')) >= 42) break
    await tap(page, 'menuRight')
  }
  expect(await selection(page, 'nameScreen')).toBe(42)
  await tap(page, 'menuSelect')
  await expect.poll(() => typed(page)).toBe('')

  // ENTER on an empty name is refused: the screen stays.
  await tap(page, 'menuDown')
  await tap(page, 'menuDown')
  expect(await selection(page, 'nameScreen')).toBe(44)
  await tap(page, 'menuSelect')
  await expect(page.locator('#name')).toBeVisible()

  // With a name it goes through, and the battle opens on the far side.
  await type(page, 'PIGS')
  await expect.poll(() => typed(page)).toBe('PIGS')
  await tap(page, 'menuSelect')
  await expect(page.locator('#battle')).toBeVisible()

  expect(app.errors()).toEqual([])
})
