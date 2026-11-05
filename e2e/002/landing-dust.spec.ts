// PHASE 002 (app) — A HARD LANDING'S RING IS ON THE CANVAS.
//
// Over 75 a frame a flying pig's contact spawns effect 0x1E, one grey ring at the
// feet (exe: movement/landing.md, 0x471052, 0x471143). The rule is pinned in
// unit/landing.spec.ts and the wiring in 000/engine-headless.spec.ts, and both read
// the field. The debug read says what the view thinks and the canvas says what was
// laid down (docs/testing.md), so here a real throw lands and the canvas is read.
//
// The ring lives five frames, so the battle is frozen on it. Frozen, nothing else
// moves, and the same look drawn with the effects and without them differs by the
// ring and by nothing else.

import { existsSync } from 'node:fs'

import { PHASE_ENV } from '../launch'
import { expect, test } from '../app'
import { swapMap } from '../controller'
import { openBattle } from '../load'
import { fromExeSpeed } from '../../src/lib/game/ballistics'
import { LANDING_DUST_EFFECT } from '../../src/lib/game/effects'
import { MODEL_SCALE } from '../../src/lib/game/scale'

type Page = import('@playwright/test').Page
type Rgb = [number, number, number]
type Pixel = [number, number]

interface Spot {
  x: number
  y: number
  z: number
}

interface RingLook {
  eye: Spot
  at: Spot
  /** Pixels in the middle of the band, one per step round it. */
  band: Pixel[]
  /** Pixels on the same bearings half as far out again: bare ground. */
  beyond: Pixel[]
  /** The ring's own colour, as the engine has it. */
  colour: [number, number, number]
}

/** Throw somebody, wait in the page for the ring its landing raises, and freeze the
 * battle on that frame. Polling from the test would miss a thing that lives five
 * frames. */
const freezeOnTheRing = (page: Page, speed: number): Promise<void> =>
  page.evaluate(
    (speed) =>
      new Promise<void>((resolve, reject) => {
        const { pow } = window
        if (!pow || !pow.debug || !pow.battle) throw new Error('no battle scene is up')
        const { debug, battle } = pow
        if (debug.flingOther(speed) === null) throw new Error('nobody to throw')
        const deadline = performance.now() + 20_000
        const sample = (): void => {
          if (debug.effects() > 0) {
            battle.pause(true)
            resolve()
          } else if (performance.now() >= deadline) {
            reject(new Error('the throw landed and raised no ring'))
          } else {
            requestAnimationFrame(sample)
          }
        }
        requestAnimationFrame(sample)
      }),
    speed
  )

/** Where the frozen ring is on the canvas, from above and to one side of it. */
const lookAtTheRing = (page: Page, scale: number): Promise<RingLook> =>
  page.evaluate((scale) => {
    const { pow } = window
    if (!pow || !pow.debug) throw new Error('no battle scene is up')
    const { debug } = pow
    const rings = debug.ringsAt()
    if (rings.length !== 1) throw new Error(`effect 0x1E is one ring, and ${rings.length} are up`)
    const [ring] = rings
    // World space, as the camera stands in it: the battle's root is a half turn
    // about x, so y and z negate (docs/facts/space-and-scale.md).
    const at = { x: ring.x, y: -ring.y, z: -ring.z }
    const eye = { x: at.x - 400, y: at.y + 400, z: at.z }
    const { view, projection, width, height } = debug.lensFrom(eye, at)
    const through = (m: number[], v: number[]): number[] =>
      [0, 1, 2, 3].map((row) => m[row] * v[0] + m[row + 4] * v[1] + m[row + 8] * v[2] + m[row + 12] * v[3])
    const onCanvas = (radius: number, step: number): Pixel => {
      // The band's vertices, three/effects.ts `shape`: game space, in the XZ plane.
      const angle = (step / 64) * 2 * Math.PI
      const point = [ring.x + Math.cos(angle) * radius, -ring.y, -(ring.z + Math.sin(angle) * radius), 1]
      const clip = through(projection, through(view, point))
      return [
        Math.floor(((clip[0] / clip[3] + 1) / 2) * width),
        Math.floor(((1 - clip[1] / clip[3]) / 2) * height)
      ]
    }
    const middle = (ring.radius - ring.width / 2) * scale
    const steps = Array.from({ length: 64 }, (_, step) => step)
    return {
      eye,
      at,
      band: steps.map((step) => onCanvas(middle, step)),
      beyond: steps.map((step) => onCanvas(ring.radius * scale * 1.5, step)),
      colour: ring.colour
    }
  }, scale)

/** The same look over the same frozen world, drawn with the effects and without,
 * with no frame between the two. */
const withAndWithout = (page: Page, look: RingLook, spots: Pixel[]): Promise<{ lit: Rgb[]; bare: Rgb[] }> =>
  page.evaluate(
    ({ eye, at, spots }) => {
      const { pow } = window
      if (!pow || !pow.debug) throw new Error('no battle scene is up')
      const { debug } = pow
      debug.paintEffects(true)
      const lit = debug.pixelsFrom(eye, at, spots)
      debug.paintEffects(false)
      const bare = debug.pixelsFrom(eye, at, spots)
      debug.paintEffects(true)
      return { lit, bare }
    },
    { eye: look.eye, at: look.at, spots }
  )

/** The channels of `a` over those of `b`. */
const gain = (a: Rgb, b: Rgb): Rgb => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

/** The ring is LIGHT, added to whatever is under it (three/effects.ts), and the two
 * draws are otherwise the same to the last bit, so a few levels on every channel is
 * the band. A pixel the band only part covers gains less than a whole one. */
const MEANS_LIT = 5

/** Spots of the 64 that must show the band. The thrown pig is still over it when the
 * battle freezes and its boots hide most of a ring this new: 15 show on the
 * proving ground's flat floor from this look. */
const BAND_FLOOR = 8

const pause = (page: Page, wanted: boolean): Promise<void> =>
  page.evaluate((wanted) => {
    const { pow } = window
    if (!pow || !pow.battle) throw new Error('no battle scene is up')
    pow.battle.pause(wanted)
  }, wanted)

const ringsUp = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const { pow } = window
    if (!pow || !pow.debug) throw new Error('no battle scene is up')
    return pow.debug.effects()
  })

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 002 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

test('a hard landing lays its ring on the canvas, and takes it off again', async ({ app }) => {
  test.setTimeout(60_000)
  const { page } = app
  // The proving ground fields a side of dummies, and a throw needs somebody else
  // to throw. Not LIBERATE: the body thrown there sets off a mine, whose ring comes
  // first and is not this one.
  await openBattle(page)
  expect(await swapMap(page, 'PROVING')).toBe(true)
  expect(await ringsUp(page), 'nothing has raised a ring yet').toBe(0)

  // A grenade's own throw is not hard enough: it leaves at 87 a frame and comes
  // down at 65 on flat ground (measured through `fly`), under the dust's bar. 200 is
  // the hardest knock there is (lib/game/falling.ts `FALL_GATE`).
  await freezeOnTheRing(page, fromExeSpeed(200))
  const look = await lookAtTheRing(page, MODEL_SCALE)
  // exe: effects/parameters.md, row 5, stage F — colour 7,7,7, so this is the
  // landing's ring and not some other effect's.
  expect(look.colour).toEqual(LANDING_DUST_EFFECT.rings[0].colour)

  const band = await withAndWithout(page, look, look.band)
  const gains = band.lit.map((pixel, index) => gain(pixel, band.bare[index]))
  const lit = gains.filter((one) => one.every((channel) => channel >= MEANS_LIT))
  // Only brighter: this floor is so pale that the light runs out at white, which
  // says nothing about its colour. That is the read above and unit/landing.spec.ts.
  expect(lit.length, `the ring's band is not on the canvas: ${JSON.stringify(gains)}`).toBeGreaterThanOrEqual(BAND_FLOOR)

  // Half as far out again the same frame has nothing of it: this is a ring, not a
  // wash over the whole picture.
  const beyond = await withAndWithout(page, look, look.beyond)
  expect(beyond.lit).toEqual(beyond.bare)

  // Five frames and it has gone, from the picture as well as the list.
  await pause(page, false)
  await expect.poll(() => ringsUp(page), { message: 'the ring outlived its five frames' }).toBe(0)
  await pause(page, true)
  const gone = await withAndWithout(page, look, look.band)
  expect(gone.lit, 'the ring has left the list and not the canvas').toEqual(gone.bare)
  await pause(page, false)

  expect(app.errors()).toEqual([])
})
