// PHASE 002 — a planted charge's fuse, on the canvas (docs/testing.md: a debug
// read is not a paint check). `pow.debug.burning` says a flame is up; only the
// picture says it was laid down, and in what colour.
//
// exe: effects/fuse.md, 0x48B85C — ten orange records on the top of the charge.
// The charge's own sticks are orange too (three/grenades.ts, `STAND`), so the look
// is ABOVE the fuse tip, which is the model's highest point.
//
// On a dark green map, because the flame is LIGHT, added to what is behind it:
// over CAMP's snow the channels are already near full and there is no orange left
// to add. The original's additive draw is the same (effects/cloud.md, 0x489FA0).
//
// `:not(#battle-hud)` because the dashboard's canvas comes first in that element.

import type { Page } from '@playwright/test'

import { expect, test } from '../app'
import { debugState, tap, warp } from '../controller'
import { openBattle } from '../load'

const TNT = 37
const DARK_GROUND = 'TRENCH'

const lobs = (page: Page): Promise<{ x: number; z: number }[]> =>
  page.evaluate(() =>
    (window as unknown as { pow: { debug: { grenades(): { x: number; z: number }[] } } }).pow.debug.grenades()
  )

/**
 * How many pixels in a box standing on the fuse tip have had ORANGE added to them,
 * measured against the mean of the same box to either side: a good deal more red,
 * some green but less of it, and no blue (lib/game/fuse.ts, red 15, green 0..14,
 * blue nothing). Null until the tip is in the picture.
 */
const orangeAtTip = (page: Page): Promise<{ orange: number; box: number } | null> =>
  page.evaluate(() => {
    const pow = (
      window as unknown as {
        pow: { debug: { fuseTips(): { x: number; y: number; z: number }[] } }
      }
    ).pow
    const [tip] = pow.debug.fuseTips()
    const canvas = document.querySelector('#battle-canvas canvas:not(#battle-hud)') as HTMLCanvasElement | null
    if (!tip || !canvas || Math.abs(tip.x) > 0.8 || Math.abs(tip.y) > 0.8 || tip.z > 1) return null
    const probe = document.createElement('canvas')
    probe.width = canvas.width
    probe.height = canvas.height
    const context = probe.getContext('2d')
    if (!context) return null
    context.drawImage(canvas, 0, 0)
    const side = Math.max(12, Math.round(canvas.height / 30))
    const left = Math.round(((tip.x + 1) / 2) * canvas.width - side / 2)
    const top = Math.round(((1 - tip.y) / 2) * canvas.height) - side
    const pixels = (from: number): Uint8ClampedArray =>
      context.getImageData(from, top, side, side).data
    const behind = [0, 0, 0]
    for (const from of [left - side * 2, left + side * 2]) {
      const data = pixels(from)
      for (let i = 0; i < data.length; i += 4) {
        for (let channel = 0; channel < 3; channel++) behind[channel] += data[i + channel]
      }
    }
    const count = side * side * 2
    const [r, g, b] = behind.map((sum) => sum / count)
    const data = pixels(left)
    let orange = 0
    for (let i = 0; i < data.length; i += 4) {
      const red = data[i] - r
      const green = data[i + 1] - g
      const blue = data[i + 2] - b
      if (red > 30 && green < red && Math.abs(blue) < 30) orange++
    }
    return { orange, box: side * side }
  })

test('a planted charge burns ORANGE above its fuse', async ({ app }) => {
  const { page } = app
  await openBattle(page, DARK_GROUND)

  expect(
    await page.evaluate(
      (skill) => (window as unknown as { pow: { give(x: number): boolean } }).pow.give(skill),
      TNT
    )
  ).toBe(true)
  // The press does nothing while the weapon is still coming out, and a second
  // press once the charge is down is refused, so this is a press until it lands.
  await expect
    .poll(
      async () => {
        await tap(page, 'fire')
        return (await lobs(page)).length
      },
      { timeout: 10_000, message: 'the charge to go down' }
    )
    .toBe(1)

  // Back from it and looking at it, so the pig is not stood in the way of the box
  // above the tip. A warp is the debug surface's own write: the picture goes with it.
  const [charge] = await lobs(page)
  const { heading } = await debugState(page)
  const back = 420
  const x = charge.x - Math.sin(heading) * back
  const z = charge.z - Math.cos(heading) * back
  await warp(page, x, z, heading)

  // The camera comes round on its own time, and the charge's fuse outlasts it.
  await expect
    .poll(
      async () => {
        const seen = await orangeAtTip(page)
        return seen !== null && seen.orange > seen.box / 8
      },
      { timeout: 5000, message: 'orange added above the fuse, an eighth of the box at least' }
    )
    .toBe(true)

  expect(app.errors()).toEqual([])
})
