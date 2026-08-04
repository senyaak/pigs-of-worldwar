// PHASE 001 — the game's frame: the main menu, wearing the original
// frontend art.
//
// The background is pigbkpc1.mgl out of FEBMP.MAD — the MGL compression was
// reverse-engineered from the game's own decompressor for this phase
// (docs/formats.md, pigs-disasm/mgl/notes.md). The menu holds the whole
// game skeleton: New Game (a stub until the battle phases), Asset Viewer
// (the phase-000 debug browsers), and Exit, which must actually quit.

import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'

import { PHASE_ENV, launchApp } from '../launch'

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 001 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

test('the menu wears the original art and routes New Game and Assets', async () => {
  const launched = await launchApp({ envFile: PHASE_ENV })
  const { page } = launched
  try {
    // Warm start lands on the menu with all three items.
    await expect(page.locator('#menu')).toBeVisible()
    await expect(page.locator('#menu-new-game')).toHaveText('New Game')
    await expect(page.locator('#menu-assets')).toHaveText('Asset Viewer')
    await expect(page.locator('#menu-exit')).toHaveText('Exit')

    // The background canvas holds the decoded 640×480 original, actually
    // painted — a decode failure would leave a blank (uniform) canvas.
    await expect(page.locator('#menu-bg')).toHaveAttribute('width', '640')
    await expect(page.locator('#menu-bg')).toHaveAttribute('height', '480')
    const distinctColors = async (): Promise<number> =>
      page.evaluate(() => {
        const canvas = document.getElementById('menu-bg') as HTMLCanvasElement
        const ctx = canvas.getContext('2d')
        if (!ctx) return -1
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        const seen = new Set<number>()
        for (let i = 0; i < pixels.length; i += 4) {
          seen.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2])
        }
        return seen.size
      })
    await expect.poll(distinctColors, { message: 'painted menu background' }).toBeGreaterThan(50)

    // New Game → the battle view (phase 002 owns its contents) and back.
    await page.locator('#menu-new-game').click()
    await expect(page.locator('#battle')).toBeVisible()
    await expect(page.locator('#menu')).toBeHidden()
    await page.locator('#battle-leave').click()
    await expect(page.locator('#menu')).toBeVisible()

    // Asset Viewer → the debug browsers and back.
    await page.locator('#menu-assets').click()
    await expect(page.locator('#file-list')).toBeVisible()
    await page.locator('#browser-menu').click()
    await expect(page.locator('#menu')).toBeVisible()

    expect(launched.errors).toEqual([])
  } finally {
    await launched.app.close()
  }
})

/** Resolves with the app process's exit code once it truly terminates. */
function processExit(launched: { app: { process(): { once(e: 'exit', cb: (code: number | null) => void): unknown } } }): Promise<number | null> {
  return new Promise((resolve) => launched.app.process().once('exit', resolve))
}

test('without --windowed the game takes the whole screen, borderless', async () => {
  const launched = await launchApp({ envFile: PHASE_ENV, windowed: false })
  try {
    await expect(launched.page.locator('#menu')).toBeVisible()
    const state = await launched.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      const [width, height] = window.getSize()
      return { fullscreen: window.isFullScreen(), width, height }
    })
    expect(state.fullscreen, 'fullscreen flag set').toBe(true)
    // A borderless-fullscreen window spans the display exactly.
    const display = await launched.app.evaluate(({ screen }) => screen.getPrimaryDisplay().size)
    expect(state.width).toBe(display.width)
    expect(state.height).toBe(display.height)
    expect(launched.errors).toEqual([])
  } finally {
    await launched.app.close()
  }
})

test('Exit quits the app cleanly: process gone, exit code 0, no errors', async () => {
  const launched = await launchApp({ envFile: PHASE_ENV })
  const { page } = launched
  const exited = processExit(launched)
  const closed = launched.app.waitForEvent('close')
  await expect(page.locator('#menu')).toBeVisible()
  expect(launched.errors).toEqual([])
  await page.locator('#menu-exit').click()
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
  await page.evaluate(() => window.close())
  await closed
  expect(await exited, 'window-all-closed shut the app down').toBe(0)
})
