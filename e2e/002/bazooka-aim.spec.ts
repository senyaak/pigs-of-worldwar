// PHASE 002 (app) — the rocket stays IN FRAME.
//
// Play, 2026-09-06: "снаряд базуки вообще улетает за экран — надо сделать
// чтобы камера ехала за ним, скажем максимум 20% от верха или низа экрана."
// The exe's flight camera aims a sixth a frame toward a third of the flight's
// height (three/chase.ts, `AIM_LIFT`), which is what lets a lob climb out of
// the middle of the frame — and lets a rocket fired high climb out of the
// frame altogether. `FRAME_KEEP` is play's rule over that: the flight never
// sits closer than a fifth of the screen's height to its top or bottom edge.
//
// A paint check, the way `grenade-aim.spec.ts` is: `pow.debug.facing()` is
// where the lens actually points.

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { beginTurn, hold, press, release, warp } from '../controller'
import { startGame } from '../menu'
import { parsePog } from '../../src/lib/formats/pog'
import { DUMMY_MODEL, targetsOf } from '../../src/lib/game/targets'

const CAMP = parsePog(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.POG')))
const BAZOOKA = 29
const DUMMIES = CAMP.filter((object) => object.name.toUpperCase() === DUMMY_MODEL)
const FIRST = targetsOf(DUMMIES)[0]

/** The band the flight is kept inside, as the elevation above the look axis
 * at which it would sit a fifth of the frame from the edge — 45° vertical
 * fov, so tan⁻¹(0.6 · tan 22.5°) ≈ 14° — plus two degrees of slack: the lens
 * is aimed at the flight as it was DRAWN last frame and the sampler reads the
 * engine's own position, and a rocket at 500 a frame moves ~1.7° at a
 * pursuit's distance in one 144 Hz frame (measured 15.3° against 14.0°). */
const CEILING = (Math.atan(0.6 * Math.tan((45 * Math.PI) / 360)) * 180) / Math.PI + 2

type Page = import('@playwright/test').Page

const give = (page: Page, skill: number): Promise<boolean> =>
  page.evaluate(
    (s) => (window as unknown as { pow: { give(x: number): boolean } }).pow.give(s),
    skill
  )

/** Degrees of elevation the rocket sits ABOVE the lens's own axis. */
const above = (page: Page): Promise<number | null> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow: Record<string, never> }).pow as unknown as {
      debug: {
        grenades(): { x: number; y: number; z: number }[]
        camera(): { x: number; y: number; z: number }
        facing(): { x: number; y: number; z: number }
      }
    }
    const shot = pow.debug.grenades()[0]
    if (!shot) return null
    const eye = pow.debug.camera()
    const look = pow.debug.facing()
    const to = { x: shot.x - eye.x, y: -shot.y - eye.y, z: -shot.z - eye.z }
    const len = Math.hypot(to.x, to.y, to.z)
    if (len < 1) return null
    return ((Math.asin(to.y / len) - Math.asin(look.y)) * 180) / Math.PI
  })

test('a rocket fired high never leaves the top fifth of the frame', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await warp(page, FIRST.x, FIRST.z - 2200, 0)
  await beginTurn(page)
  expect(await give(page, BAZOOKA)).toBe(true)
  await page.waitForTimeout(900) // the getting-it-out clip

  // Barrel UP — as far as the aim keys take it in a second and a half — and a
  // full charge, so the rocket climbs as hard as a rocket can.
  await hold(page, 'aimUp', 1500)
  await press(page, 'fire')
  await page.waitForTimeout(1200)
  await release(page, 'fire')

  const seen: number[] = []
  const until = Date.now() + 4000
  while (Date.now() < until) {
    const one = await above(page)
    if (one !== null) seen.push(one)
    else if (seen.length > 0) break
    await page.waitForTimeout(16)
  }

  expect(seen.length, 'the sampler actually saw the rocket in the air').toBeGreaterThan(10)
  const highest = Math.max(...seen)
  const lowest = Math.min(...seen)
  console.log(
    `rocket in frame: from ${lowest.toFixed(1)}° to ${highest.toFixed(1)}° about the axis over ${seen.length} samples (ceiling ${CEILING.toFixed(1)}°)`
  )
  expect(highest, `rose to ${highest.toFixed(1)}° above the axis`).toBeLessThan(CEILING)
  expect(lowest, `fell to ${lowest.toFixed(1)}° below the axis`).toBeGreaterThan(-CEILING)
  expect(app.errors()).toEqual([])
})
