// PHASE 002 (app) — A TAKEN CRATE IS BACK AT THE START OF THE NEXT TURN.
//
// `[play]`, 2026-11-02: "one round per crate per turn"
// (docs/facts/proving-ground.md). The rule is pinned headless
// (000/proving-ground-headless.spec.ts); this is what the player sees. The debug
// read says what the view thinks and the canvas says what was laid down
// (docs/testing.md), so the crate is looked at from one fixed spot in each of its
// three states and the frames are held against each other.

import { existsSync } from 'node:fs'

import { PHASE_ENV } from '../launch'
import { expect, test } from '../app'
import { skipTurn, swapMap, warp } from '../controller'
import { openBattle } from '../load'
import { pickupsOf } from '../../src/lib/game/pickups'
import { PIG_AT, provingGroundObjects } from '../../src/lib/game/provingGround'
import { restingPlaceOf } from '../../src/lib/game/scenery'
import { SKILL } from '../../src/lib/game/skills'

type Page = import('@playwright/test').Page

interface Spot {
  x: number
  y: number
  z: number
}

interface Look {
  eye: Spot
  at: Spot
}

type Rgb = [number, number, number]

/** What a look asks of the debug surface: the app's own `pow.debug` (input/pow.ts). */
interface CrateDebug {
  props(): { at: { name: string; x: number; z: number; visible: boolean }[] }
  lensFrom(eye: Spot, at: Spot): { width: number; height: number }
  pixelsFrom(eye: Spot, at: Spot, spots: readonly (readonly [number, number])[]): Rgb[]
}

/** The crates the frame should be drawing, and whether this one is among them. */
const drawn = (page: Page, crate: { x: number; z: number }): Promise<{ crates: number; it: boolean }> =>
  page.evaluate(
    (crate) => {
      const { debug } = (window as unknown as { pow: { debug: CrateDebug } }).pow
      const crates = debug.props().at.filter((one) => one.name === 'CRATE1')
      const it = crates.find((one) => one.x === crate.x && one.z === crate.z)
      if (!it) throw new Error('the proving ground has no mesh for this crate')
      return { crates: crates.filter((one) => one.visible).length, it: it.visible }
    },
    crate
  )

/** The look, drawn once, and a grid of pixels round the middle of the frame, which
 * is where `lookAt` puts the crate. */
const pixels = (page: Page, look: Look): Promise<Rgb[]> =>
  page.evaluate(
    ({ eye, at }) => {
      const { debug } = (window as unknown as { pow: { debug: CrateDebug } }).pow
      const { width, height } = debug.lensFrom(eye, at)
      /** Inside the crate's own box from where the eye stands: it fills about a
       * fifth of the frame's height. */
      const step = Math.floor(height * 0.012)
      const spots: [number, number][] = []
      for (let across = -5; across <= 5; across++) {
        for (let down = -5; down <= 5; down++) {
          spots.push([Math.floor(width / 2) + across * step, Math.floor(height / 2) + down * step])
        }
      }
      return debug.pixelsFrom(eye, at, spots)
    },
    look
  )

/** How far apart two pixels may be, over the three channels, and still be the
 * same thing drawn. */
const SAME = 24

/** The share of two frames' spots that show something else. */
const differing = (a: readonly Rgb[], b: readonly Rgb[]): number =>
  a.filter(
    (pixel, index) =>
      Math.abs(pixel[0] - b[index][0]) + Math.abs(pixel[1] - b[index][1]) + Math.abs(pixel[2] - b[index][2]) > SAME
  ).length / a.length

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 002 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

test('a crate taken leaves the frame, and the turn handed over puts it back on the canvas', async ({ app }) => {
  const { page } = app
  await openBattle(page)
  expect(await swapMap(page, 'PROVING')).toBe(true)

  const crate = pickupsOf(provingGroundObjects()).find((one) => one.skill === SKILL.TNT)
  if (!crate) throw new Error('no TNT crate on the proving ground')
  const record = provingGroundObjects().find((one) => one.id === crate.id)
  if (!record) throw new Error(`no record ${crate.id}`)
  // World space, as the camera stands in it: the battle's root is a half turn
  // about x, so y and z negate (docs/facts/space-and-scale.md).
  const middle = { x: crate.x, y: -restingPlaceOf(record).y, z: -crate.z }
  // From the crates' near side and above, far from the pig's own spot on the strip
  // (the crate is 6528 down the row), so nothing but the crate changes in view.
  const look: Look = { eye: { x: middle.x - 700, y: middle.y + 500, z: middle.z }, at: middle }

  const before = await drawn(page, crate)
  expect(before, 'all 48 crates stand on the ground (lib/game/provingGround.ts)').toEqual({ crates: 48, it: true })
  const standing = await pixels(page, look)

  // Taken: the mesh is off, and the pig is sent home so it is not in the picture.
  await warp(page, crate.x, crate.z, 0)
  await expect.poll(() => drawn(page, crate), { message: 'the crate is taken' }).toEqual({ crates: 47, it: false })
  await warp(page, PIG_AT.x, PIG_AT.z, Math.PI / 2)
  const taken = await pixels(page, look)
  expect(differing(standing, taken), 'the crate was on the canvas, and has left it').toBeGreaterThan(0.3)

  // [play] 2026-11-02, docs/facts/proving-ground.md: back at the start of the next
  // turn, whoever's turn that is. The next one is a dummy's.
  await skipTurn(page)
  await expect.poll(() => drawn(page, crate), { message: 'the crate is back' }).toEqual({ crates: 48, it: true })
  const back = await pixels(page, look)
  expect(differing(taken, back), 'it is on the canvas again').toBeGreaterThan(0.3)
  expect(differing(standing, back), 'the same crate in the same place').toBeLessThan(0.05)

  expect(app.errors()).toEqual([])
})
