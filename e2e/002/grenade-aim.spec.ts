// PHASE 002 (app) — the thrown weapon's camera does NOT look AT the grenade.
//
// Play, 2026-09-01: "вроде у нас щас 1 граната в центре экрана — а в оригинале
// по другому." It was: `pursue` pointed the lens straight at the flight every
// frame, so the grenade sat dead centre for the whole arc.
//
// The exe does not. Mode 0x0D keeps an AIM POINT of its own at
// `[cam+0x64..0x68]` and hands THAT to the camera (0x4a3ed1 → 0x4A0B50); every
// frame it springs a third of the way toward the flight on the flat and a
// SIXTH of the way toward a height that is itself only a third up from the
// ground beneath it (three/chase.ts, `AIM_CHASE`). So a lob climbs out of the
// middle of the frame while the camera pans up behind it.
//
// **This is a paint check and not a state read**: `pow.debug.facing()` is the
// direction the camera is actually pointed, which is the thing that changed.

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { beginTurn, press, release, warp } from '../controller'
import { parsePog } from '../../src/lib/formats/pog'
import { DUMMY_MODEL, targetsOf } from '../../src/lib/game/targets'
import { openBattle } from '../load'

const CAMP = parsePog(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.POG')))
const GRENADE = 19
const DUMMIES = CAMP.filter((object) => object.name.toUpperCase() === DUMMY_MODEL)
const FIRST = targetsOf(DUMMIES)[0]

type Page = import('@playwright/test').Page

const give = (page: Page, skill: number): Promise<boolean> =>
  page.evaluate(
    (s) => (window as unknown as { pow: { give(x: number): boolean } }).pow.give(s),
    skill
  )

interface Sample {
  /** Degrees between where the lens points and where the grenade is. */
  off: number
  /** How far the grenade is ABOVE the aim, in degrees of elevation — positive
   * while it is climbing out of the frame. */
  above: number
}

/**
 * One reading: the angle between the camera's own facing and the direction
 * from the camera to the newest grenade.
 *
 * The engine's list is GAME space (Y-down, z as the engine keeps it) and the
 * camera is three space, so the direction is built the way `three/battle.ts`
 * places everything else — x through, y and z negated.
 */
const aimOff = (page: Page): Promise<Sample | null> =>
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
    const unit = { x: to.x / len, y: to.y / len, z: to.z / len }
    const dot = Math.min(1, Math.max(-1, unit.x * look.x + unit.y * look.y + unit.z * look.z))
    const degrees = (radians: number): number => (radians * 180) / Math.PI
    return {
      off: degrees(Math.acos(dot)),
      // Elevation of each direction, so "above" is a signed answer rather than
      // a magnitude: the grenade is higher in frame than the lens is aimed.
      above: degrees(Math.asin(unit.y) - Math.asin(look.y))
    }
  })

test('a thrown grenade rides ABOVE the middle of the frame, not in it', async ({ app }) => {
  const { page } = app
  await openBattle(page)
  await warp(page, FIRST.x, FIRST.z - 900, 0)
  await beginTurn(page)
  expect(await give(page, GRENADE)).toBe(true)

  // A full charge, so the arc is high enough for the lag to show.
  await press(page, 'fire')
  await page.waitForTimeout(900)
  await release(page, 'fire')
  await expect.poll(() => page.evaluate(() => 1), { timeout: 4000 }).toBe(1)

  const seen: Sample[] = []
  const until = Date.now() + 2500
  while (Date.now() < until) {
    const one = await aimOff(page)
    if (one) seen.push(one)
    else if (seen.length > 0) break
    await page.waitForTimeout(16)
  }

  expect(seen.length, 'the sampler actually saw a grenade in the air').toBeGreaterThan(20)
  const worst = Math.max(...seen.map((one) => one.off))
  const highest = Math.max(...seen.map((one) => one.above))
  console.log(
    `grenade aim: off by up to ${worst.toFixed(1)}°, and up to ${highest.toFixed(1)}° above the aim`
  )
  // Pinned as a FLOOR rather than a figure: the exact lag is the arc's, and the
  // arc is a throw. What must never come back is zero — the lens locked on the
  // flight, which is what this replaced.
  expect(worst, `off by ${worst.toFixed(1)}°`).toBeGreaterThan(3)
  // …and the sign is the half that says it is the exe's rule and not a wobble:
  // the vertical lags hardest (a sixth a frame against a third, toward a target
  // only a third of the way up), so the grenade is ABOVE where the lens points.
  expect(highest, `${highest.toFixed(1)}° above`).toBeGreaterThan(2)
})
