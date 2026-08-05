// PHASE 000 (continued) — the terrain viewer: a map's ground out of
// ARCHI.PMG + ARCHI.PTG, on screen in Three.js.
//
// Same deal as the model viewer: this proves the PMG/PTG pipeline with the
// screen as the assertion, and that is foundation — the meaningful scene
// stays reserved for phase 001. Numbers from docs/formats.md ("Verified"):
// every map is 16×16 blocks = 256, 4×4 tiles each = 4096; ARCHI.PTG holds
// 238 textures.

import { existsSync } from 'node:fs'

import { PHASE_ENV, openAssets } from '../launch'
import { expect, test } from '../app'

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('this spec starts from the .env the foundation spec saves — run the whole suite, not this spec alone')
  }
})

test('ARCHI renders: correct counts in the stats, terrain pixels on the canvas', async ({ app }) => {
  const { page } = app
  await openAssets(page)
  await page.locator('#filter').fill('Maps/ARCHI.PMG')
  await page.locator('#file-list .file-row').click()
  await expect(page.locator('#viewer')).toBeVisible()
  await expect(page.locator('#viewer-stats')).toHaveText(
    'Maps/ARCHI.PMG — 256 blocks, 4096 tiles, 238 textures'
  )

  // Same canvas readback as the model viewer: something must actually be
  // on screen, far from the flat background color.
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
  await expect.poll(foregroundPixels, { message: 'rendered terrain pixels' }).toBeGreaterThan(5000)

  // Terrain opens from the file list, so Back goes there — not to an archive.
  await page.locator('#viewer-back').click()
  await expect(page.locator('#viewer')).toBeHidden()
  await expect(page.locator('#file-list')).toBeVisible()


  expect(app.errors()).toEqual([])
})
