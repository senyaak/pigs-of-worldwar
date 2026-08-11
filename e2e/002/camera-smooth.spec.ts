// PHASE 002 (app) — does the VIEW move smoothly, or in steps?
//
// Play felt it before anything measured it: "есть ощущение дрожания камеры —
// когда она вверх вниз ездит — например летит граната или падает ящик с
// парашютом." The rules step in fixed quanta now (lib/game/engine.ts), and one
// rendered frame buys one step, sometimes none, sometimes two. Anything the
// camera is pointed at that is drawn straight off the engine's own numbers
// therefore moves in a stutter, and the rig eases where it STANDS but not what
// it LOOKS at — so the shake is in the facing and hardly shows in the position,
// which is exactly why it was felt and not seen.
//
// The measurement is the second difference of the view direction: how much the
// turn rate changes from frame to frame, against how much it turns at all.
// Smooth motion turns by nearly the same amount each frame and scores near
// zero; a target that stands still one frame and jumps two steps the next
// scores around 1.

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { beginTurn, press, release, warp } from '../controller'
import { startGame } from '../menu'
import { parsePog } from '../../src/lib/formats/pog'
import { DUMMY_MODEL, targetsOf } from '../../src/lib/game/targets'

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

const grenadesUp = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (window as unknown as { pow: { debug: { grenades(): unknown[] } } }).pow.debug.grenades()
        .length
  )

/**
 * Watch the view for `ms`, one reading a rendered frame, and score its
 * roughness: mean |change in turn RATE| over mean |turn rate|.
 *
 * **The rate, not the step, and that is the whole of what this measure got
 * wrong.** The first version scored the second difference of the facing itself,
 * per frame — which asks a frame that took 33 ms to have moved the view as far
 * as one that took 16, and calls the difference judder. On a machine building and
 * running other suites at the same time the frame interval swings by that much
 * and more, so the number wandered: the opening drop measured 0.15 on a quiet run
 * and 0.39 on a busy one, against a bar of 0.35, and nothing about the camera had
 * changed between them.
 *
 * Dividing each step by the time it was given fixes it at the root. A view moving
 * at a steady rate scores zero however uneven the frames are, and the case this
 * spec exists for still scores about 1: a target drawn straight off the engine's
 * quanta stands still on the frames that buy no step and jumps two on the ones
 * that buy two, which is a change in RATE and survives the division.
 *
 * The time each step was given is the app's own (`pow.debug.frame()`), not the
 * gap between two of these readings. This callback runs after the battle's in the
 * same frame, so its own gaps carry the app's work as noise — measuring with them
 * would put back a good part of what the division just took out.
 *
 * Frames where the view does not move at all are dropped from the denominator — a
 * camera holding still is not judder, and including them would flatter the number.
 */
const roughness = (page: Page, ms: number): Promise<{ score: number; frames: number }> =>
  page.evaluate((limit) => {
    const pow = (
      window as unknown as {
        pow: { debug: { facing(): { x: number; y: number; z: number }; frame(): number } }
      }
    ).pow
    return new Promise<{ score: number; frames: number }>((resolve) => {
      const seen: { x: number; y: number; z: number }[] = []
      /** How long the frame that produced each reading took, seconds. */
      const took: number[] = []
      const start = performance.now()
      const sample = (): void => {
        seen.push(pow.debug.facing())
        took.push(pow.debug.frame())
        if (performance.now() - start < limit) {
          requestAnimationFrame(sample)
          return
        }
        const size = (a: { x: number; y: number; z: number }): number =>
          Math.hypot(a.x, a.y, a.z)
        const minus = (
          a: { x: number; y: number; z: number },
          b: { x: number; y: number; z: number }
        ): { x: number; y: number; z: number } => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
        // Reading i came out of a frame that lasted `took[i]`, so that is the time
        // the step into it was given. A frame with no length to it — the very
        // first, before the battle has been handed one — cannot be a rate.
        const rates: { x: number; y: number; z: number }[] = []
        for (let i = 1; i < seen.length; i++) {
          const span = took[i]
          if (!(span > 0)) continue
          const step = minus(seen[i], seen[i - 1])
          rates.push({ x: step.x / span, y: step.y / span, z: step.z / span })
        }
        const moving = rates.filter((one) => size(one) > 1e-6)
        if (moving.length < 3) {
          resolve({ score: 0, frames: seen.length })
          return
        }
        const jerks = rates.slice(1).map((one, i) => size(minus(one, rates[i])))
        const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
        resolve({
          score: mean(jerks) / mean(moving.map(size)),
          frames: seen.length
        })
      }
      requestAnimationFrame(sample)
    })
  }, ms)

test('the view comes down with the squad smoothly', async ({ app }) => {
  const { page } = app
  // The level's opening: the pig hangs on a canopy and the camera watches it
  // come down, face on. Straight-line VERTICAL motion, which is the case play
  // named — and the descent is the engine's, so the art that lifts the pig is
  // drawn between steps like everything else (three/dropIn.ts).
  await startGame(page)
  const { score, frames } = await roughness(page, 900)
  console.log(`opening drop: view roughness ${score.toFixed(3)} over ${frames} frames`)
  expect(frames, 'the sampler actually ran').toBeGreaterThan(30)
  expect(score, `view roughness ${score.toFixed(3)}`).toBeLessThan(0.35)
})

test('the view follows a walking pig smoothly', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await warp(page, FIRST.x, FIRST.z - 2000, 0)
  await beginTurn(page)

  // The control reading. The acting pig is drawn BETWEEN steps
  // (three/battle.ts, `tween`), so a turn — which moves the view most — has to
  // come out smooth even though the rules underneath it move in quanta.
  await press(page, 'turnLeft')
  try {
    const { score, frames } = await roughness(page, 900)
    console.log(`walking: view roughness ${score.toFixed(3)} over ${frames} frames`)
    expect(frames, 'the sampler actually ran').toBeGreaterThan(30)
    expect(score, `view roughness ${score.toFixed(3)}`).toBeLessThan(0.35)
  } finally {
    await release(page, 'turnLeft')
  }
})

test('the view rides a grenade smoothly — no step in what it is pointed at', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await warp(page, FIRST.x, FIRST.z - 900, 0)
  await beginTurn(page)
  expect(await give(page, GRENADE)).toBe(true)

  // Charge and let go: the camera leaves the pig and rides the throw
  // (three/battle.ts, `watch`).
  await press(page, 'fire')
  await page.waitForTimeout(700)
  await release(page, 'fire')
  await expect.poll(() => grenadesUp(page), { timeout: 4000 }).toBeGreaterThan(0)

  const { score, frames } = await roughness(page, 900)
  console.log(`grenade ride: view roughness ${score.toFixed(3)} over ${frames} frames`)
  expect(frames, 'the sampler actually ran').toBeGreaterThan(30)
  // A view that steps scores about 1: it turns twice as far on the frames that
  // buy a step and not at all on the ones that do not. Anything well under that
  // is the easing doing its job on a target that moves every frame.
  //
  // This bar was let out to 0.6 once, because the measure it was reading swung
  // with the machine's load — the same ride scored 0.17 alone and 0.41 behind
  // other app specs. It is back at 0.35 with the rest of them now that the score
  // is a RATE (`roughness` above): measured 0.131 on its own and 0.077 inside a
  // full 241-test run, which is the spread the old bar was inside.
  expect(score, `view roughness ${score.toFixed(3)}`).toBeLessThan(0.35)
})
