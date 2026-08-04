// PHASE 000 (continued) — the debug model viewer: a textured pig out of
// british.mad + british.mtd, on screen in Three.js.
//
// Still foundation, not a milestone: this proves the FORMAT PIPELINE — VTX
// vertices resolved through HIR bone offsets, FAC faces and UVs, TIM textures
// out of the paired .mtd — using the screen as the assertion. A meaningful
// scene is what phase 001 is reserved for. The model is pcace_hi — numbers
// from docs/formats.md, verified against this install: 536 triangles + 390
// quads (split in two each → 1316), 658 vertices, 120 textures in the .mtd.
//
// "It rendered" is asserted two ways: the stats line carries the parsed
// counts, and the WebGL canvas is read back and must contain a meaningful
// number of pixels that differ from the background — a black window with a
// happy stats line is exactly the failure a dead scene graph would produce.

import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'

import { PHASE_ENV, launchApp, openAssets } from '../launch'

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('this spec starts from the .env the foundation spec saves — run the whole suite, not this spec alone')
  }
})

test('pcace_hi renders: correct counts in the stats, pig pixels on the canvas', async () => {
  const launched = await launchApp({ envFile: PHASE_ENV })
  const { page } = launched
  try {
    await openAssets(page)
    await page.locator('#filter').fill('Chars/british.mad')
    await page.locator('#file-list .file-row').click()
    await expect(page.locator('#archive-view')).toBeVisible()

    await page.locator('#archive-list .file-row', { hasText: 'pcace_hi.VTX' }).click()
    await expect(page.locator('#viewer')).toBeVisible()
    await expect(page.locator('#viewer-stats')).toHaveText(
      'pcace_hi — 1316 triangles (536 + 390 quads), 658 vertices, 120 textures, 15 bones, 93 clips'
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
        // Background is #23271d; count pixels where any channel strays far
        // from it — the textured pig is khaki AND pink, the background flat.
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
    await expect.poll(foregroundPixels, { message: 'rendered pig pixels' }).toBeGreaterThan(5000)

    // A clip plays without killing the renderer: 94 dropdown options (T-pose
    // + 93 MCAP clips), and the canvas still shows a pig mid-animation.
    await expect(page.locator('#anim-select option')).toHaveCount(94)
    await page.selectOption('#anim-select', '1')
    await expect.poll(foregroundPixels, { message: 'animated pig pixels' }).toBeGreaterThan(5000)

    // Back returns to the archive, still on its entries.
    await page.locator('#viewer-back').click()
    await expect(page.locator('#viewer')).toBeHidden()
    await expect(page.locator('#archive-view')).toBeVisible()

    expect(launched.errors).toEqual([])
  } finally {
    await launched.app.close()
  }
})
