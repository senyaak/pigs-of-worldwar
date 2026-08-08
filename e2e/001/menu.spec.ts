// PHASE 001 — the game's frame: the main menu, wearing the original
// frontend.
//
// Everything on the screen is the game's own: the backdrop and the machinery
// out of FEBMP.MAD (the MGL compression was reverse-engineered from the
// game's own decompressor for this phase — docs/formats.md), the letters out
// of the FEText glyph tables, the four labels out of fetext.bin. So the spec
// asserts what the DATA says — ONE PLAYER, MULTI-PLAYER, OPTIONS, QUIT
// APPLICATION — and that the screen is really painted.
//
// Only ONE PLAYER leads anywhere yet: it opens the training ground. The
// asset browsers are not a menu bar at all — the original has no such
// screen, so they hang off the remake's own F1.

import { existsSync } from 'node:fs'

import { PHASE_ENV, launchApp, openAssets } from '../launch'
import { expect, test } from '../app'
import { tap } from '../controller'
import { choose, labels, lightBar, nudge, selection, startGame } from '../menu'

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 001 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

test('the menu is the original screen, in the original letters', async ({ app }) => {
  const { page } = app
  await expect(page.locator('#menu')).toBeVisible()

  // The four bars are fetext 13..16, in the file's own order.
  await expect
    .poll(() => labels(page))
    .toEqual(['ONE PLAYER', 'MULTI-PLAYER', 'OPTIONS', 'QUIT APPLICATION'])

  // The frontend is 640x480 and really painted: a decode failure would leave
  // it blank, where the art alone runs to hundreds of colours.
  const screen = page.locator('#menu-screen')
  await expect(screen).toHaveAttribute('width', '640')
  await expect(screen).toHaveAttribute('height', '480')
  const distinctColors = async (): Promise<number> =>
    page.evaluate(() => {
      const canvas = document.getElementById('menu-screen') as HTMLCanvasElement
      const context = canvas.getContext('2d')
      if (!context) return -1
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const seen = new Set<number>()
      for (let i = 0; i < pixels.length; i += 4) {
        seen.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2])
      }
      return seen.size
    })
  await expect.poll(distinctColors, { message: 'the painted frontend' }).toBeGreaterThan(50)

  expect(app.errors()).toEqual([])
})

test('the lit bar moves one at a time, and wraps', async ({ app }) => {
  const { page } = app
  // Start from the top DELIBERATELY. A screen is come back to wherever it was
  // left, and the suite's file order is not fixed, so a spec that reaches the
  // menu after one that opened MULTI-PLAYER finds the bar already moved —
  // which is what this line used to assert away.
  await lightBar(page, 'ONE PLAYER')
  expect(await selection(page)).toBe(0)

  // The machine will not move again while a bar is still turning, so a
  // second press on its heels does nothing — held keys and a mouse dragged
  // down the column both step one bar at a time.
  await tap(page, 'menuDown')
  await tap(page, 'menuDown')
  expect(await selection(page), 'the second press came too soon').toBe(1)

  // Once it settles it takes the next one, and off the top it wraps round.
  await nudge(page, 'menuUp')
  await nudge(page, 'menuUp')
  expect(await selection(page), 'up from the top wraps to the bottom').toBe(3)
  await nudge(page, 'menuDown')
  expect(await selection(page)).toBe(0)
  expect(app.errors()).toEqual([])
})

test('ONE PLAYER opens the battle, and F1 the asset browsers', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()
  await expect(page.locator('#menu')).toBeHidden()
  await page.locator('#battle-leave').click()
  await expect(page.locator('#menu')).toBeVisible()

  await openAssets(page)
  await expect(page.locator('#file-list')).toBeVisible()
  await page.locator('#browser-menu').click()
  await expect(page.locator('#menu')).toBeVisible()

  expect(app.errors()).toEqual([])
})

/** Resolves with the app process's exit code once it truly terminates. */
function processExit(launched: { app: { process(): { once(e: 'exit', cb: (code: number | null) => void): unknown } } }): Promise<number | null> {
  return new Promise((resolve) => launched.app.process().once('exit', resolve))
}

test('without --windowed the game takes the whole screen, borderless', async () => {
  const launched = await launchApp({ envFile: PHASE_ENV, windowed: false })
  try {
    await expect(launched.page.locator('#menu')).toBeVisible()
    // Asked of the PAGE, not of Electron: what matters is that the game has
    // the whole display with no frame around it, and the page is where that
    // is visible. Going fullscreen is the window manager's business and
    // lands a moment after the window does, so it is polled.
    const shape = (): Promise<string> =>
      launched.page.evaluate(
        () => `${window.innerWidth}x${window.innerHeight} of ${screen.width}x${screen.height}`
      )
    await expect
      .poll(shape, { message: 'a borderless window spanning the display' })
      .toMatch(/^(\d+)x(\d+) of \1x\2$/)
    expect(launched.errors).toEqual([])
  } finally {
    await launched.app.close()
  }
})

test('QUIT APPLICATION quits cleanly: process gone, exit code 0, no errors', async () => {
  const launched = await launchApp({ envFile: PHASE_ENV })
  const { page } = launched
  const exited = processExit(launched)
  const closed = launched.app.waitForEvent('close')
  await expect(page.locator('#menu')).toBeVisible()
  await expect.poll(() => labels(page)).toContain('QUIT APPLICATION')
  expect(launched.errors).toEqual([])
  // Choosing it quits the app; Playwright may lose the page mid-call and
  // throw "target closed" - that IS the success case here.
  await choose(page, 'QUIT APPLICATION').catch(() => undefined)
  await closed
  expect(await exited, 'the process terminated of its own accord').toBe(0)
})

test('closing the window quits the app cleanly too', async () => {
  const launched = await launchApp({ envFile: PHASE_ENV })
  const { page } = launched
  const exited = processExit(launched)
  const closed = launched.app.waitForEvent('close')
  await expect(page.locator('#menu')).toBeVisible()
  expect(launched.errors).toEqual([])
  // Same as Quit: the call tears the page down under Playwright's feet, so
  // a "target closed" rejection here IS the success path.
  await page.evaluate(() => window.close()).catch(() => undefined)
  await closed
  expect(await exited, 'window-all-closed shut the app down').toBe(0)
})
