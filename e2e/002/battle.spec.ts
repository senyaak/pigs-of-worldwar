// PHASE 002 (app) — the first battle scene: New Game drops two squads onto
// ARCHI, the HUD names whose turn it is, End Turn rotates through players
// and pigs, and the scene actually draws.
//
// The squad rosters here mirror ui/battle.ts; the rotation rules themselves
// are pinned down in game-logic.spec.ts — this spec checks the wiring.

import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'

import { PHASE_ENV, launchApp } from '../launch'

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 002 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

test('New Game: squads on the map, turns rotate, the scene draws', async () => {
  const launched = await launchApp({ envFile: PHASE_ENV })
  const { page } = launched
  try {
    await page.locator('#menu-new-game').click()
    await expect(page.locator('#battle')).toBeVisible()

    // Turn 1: first player's first pig, full health, the clock running.
    await expect(page.locator('#battle-hud')).toHaveText(
      /Turn 1 — Tommy’s Trotters: Tommy \(100 hp, \d+s\)/
    )

    // The battle canvas draws something that is not background.
    const foregroundPixels = async (): Promise<number> =>
      page.evaluate(() => {
        const canvas = document.querySelector('#battle-canvas canvas') as HTMLCanvasElement | null
        if (!canvas) return -1
        const probe = document.createElement('canvas')
        probe.width = canvas.width
        probe.height = canvas.height
        const ctx = probe.getContext('2d')
        if (!ctx) return -1
        ctx.drawImage(canvas, 0, 0)
        const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data
        let count = 0
        for (let i = 0; i < pixels.length; i += 4) {
          if (
            Math.abs(pixels[i] - 0x23) > 32 ||
            Math.abs(pixels[i + 1] - 0x27) > 32 ||
            Math.abs(pixels[i + 2] - 0x1d) > 32
          ) {
            count++
          }
        }
        return count
      })
    await expect.poll(foregroundPixels, { message: 'rendered battle pixels' }).toBeGreaterThan(20000)

    // The clock is real: the HUD's seconds tick down on their own.
    const secondsLeft = async (): Promise<number> => {
      const text = (await page.locator('#battle-hud').textContent()) ?? ''
      return parseInt(text.match(/(\d+)s/)?.[1] ?? '-1', 10)
    }
    const before = await secondsLeft()
    expect(before).toBeGreaterThan(40)
    await expect.poll(secondsLeft, { message: 'turn clock ticking' }).toBeLessThan(before)

    // End Turn: over to the other squad with a fresh clock, then back to
    // squad one's SECOND pig.
    await page.locator('#battle-end-turn').click()
    await expect(page.locator('#battle-hud')).toHaveText(
      /Turn 1 — Kaiser’s Grunters: Hans \(100 hp, \d+s\)/
    )
    expect(await secondsLeft()).toBeGreaterThan(40)
    await page.locator('#battle-end-turn').click()
    await expect(page.locator('#battle-hud')).toHaveText(
      /Turn 2 — Tommy’s Trotters: Wilson \(100 hp, \d+s\)/
    )

    // Leaving lands back on the menu; a fresh New Game starts over at turn 1.
    await page.locator('#battle-leave').click()
    await expect(page.locator('#menu')).toBeVisible()
    await page.locator('#menu-new-game').click()
    await expect(page.locator('#battle-hud')).toHaveText(
      /Turn 1 — Tommy’s Trotters: Tommy \(100 hp, \d+s\)/
    )

    expect(launched.errors).toEqual([])
  } finally {
    await launched.app.close()
  }
})
