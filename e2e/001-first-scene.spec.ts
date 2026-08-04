// PHASE 001 — the first rendered scene: a pig model out of british.mad,
// on screen in Three.js.
//
// Phase 000 proved the plumbing (archives open, entries listed); this is the
// first engine milestone a player could point at. The model is pcace_hi —
// numbers from docs/formats.md, verified against this install: 536 triangles
// + 390 quads (split in two each → 1316), 658 vertices.
//
// "It rendered" is asserted two ways: the stats line carries the parsed
// counts, and the WebGL canvas is read back and must contain a meaningful
// number of pixels that differ from the background — a black window with a
// happy stats line is exactly the failure a dead scene graph would produce.

import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'

import { PHASE_ENV, launchApp } from './launch'

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 001 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

test('pcace_hi renders: correct counts in the stats, pig pixels on the canvas', async () => {
  const launched = await launchApp({ envFile: PHASE_ENV })
  const { page } = launched
  try {
    await page.locator('#filter').fill('Chars/british.mad')
    await page.locator('#file-list .file-row').click()
    await expect(page.locator('#archive-view')).toBeVisible()

    await page.locator('#archive-list .file-row', { hasText: 'pcace_hi.VTX' }).click()
    await expect(page.locator('#viewer')).toBeVisible()
    await expect(page.locator('#viewer-stats')).toHaveText(
      'pcace_hi — 1316 triangles (536 + 390 quads), 658 vertices'
    )

    // Read the WebGL canvas back and count pixels that are not background.
    // expect.poll gives the first frame time to land without a sleep.
    const foregroundPixels = async (): Promise<number> =>
      page.evaluate(() => {
        const canvas = document.querySelector('#viewer-canvas canvas') as HTMLCanvasElement | null
        if (!canvas) return -1
        const probe = document.createElement('canvas')
        probe.width = canvas.width
        probe.height = canvas.height
        const ctx = probe.getContext('2d')
        if (!ctx) return -1
        ctx.drawImage(canvas, 0, 0)
        const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data
        // Background is #23271d; the mesh is lit pink. Count pixels whose
        // red channel is far from the background's 0x23.
        let count = 0
        for (let i = 0; i < pixels.length; i += 4) {
          if (Math.abs(pixels[i] - 0x23) > 32) count++
        }
        return count
      })
    await expect.poll(foregroundPixels, { message: 'rendered pig pixels' }).toBeGreaterThan(5000)

    // Back returns to the archive, still on its entries.
    await page.locator('#viewer-back').click()
    await expect(page.locator('#viewer')).toBeHidden()
    await expect(page.locator('#archive-view')).toBeVisible()

    expect(launched.errors).toEqual([])
  } finally {
    await launched.app.close()
  }
})
