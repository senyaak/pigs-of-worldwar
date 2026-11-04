// PHASE 002 (app) — THE PROVING GROUND'S DUMMIES SKIP THEIR TURNS.
//
// `[play]`, 2026-11-02: "real enemy pigs that skip their turns"
// (docs/facts/proving-ground.md). The rule itself is pinned headless
// (000/proving-ground-headless.spec.ts); this is what the player sees: the
// dummy's card comes up, the turn comes back, and every dummy's DRAWN NODE is
// where it stood — the renderer's own word (docs/testing.md).

import { existsSync } from 'node:fs'

import { PHASE_ENV } from '../launch'
import { expect, test } from '../app'
import { beginTurn, debugState, hold, hud, press, release, skipTurn } from '../controller'
import type { HudState } from '../controller'
import { openBattle } from '../load'
import { DUMMIES_AT, PROVING_GROUND } from '../../src/lib/game/provingGround'

type Page = import('@playwright/test').Page

interface Node3 {
  x: number
  y: number
  z: number
}

interface DummiesDebug {
  nodeAt(id: number): Node3 | null
  hud(): HudState
  brain(): { remote: boolean; asked: number }
}

/** The player's pig is 0, the side carrying the scripted bit comes first
 * (lib/game/provingGround.ts); the four dummies follow. */
const DUMMY_IDS = [1, 2, 3, 4]

const nodesOf = (page: Page): Promise<Node3[]> =>
  page.evaluate((ids) => {
    const debug = (window as unknown as { pow: { debug: DummiesDebug } }).pow.debug
    return ids.map((id) => {
      const node = debug.nodeAt(id)
      if (node === null) throw new Error(`pig ${id} has no drawn node`)
      return node
    })
  }, DUMMY_IDS)

/** What one whole turn of the other side looked like, sampled in the page every
 * frame: a poll from the test would miss most of it. */
interface OtherTurn {
  /** Whether its card was up: the side changed and the turn had not begun. */
  card: boolean
  /** The furthest any dummy's drawn node got from where it stood. */
  drift: number
}

const watchOtherTurn = (page: Page, ours: string): Promise<OtherTurn> =>
  page.evaluate(
    ({ ids, side, limit }) => {
      const debug = (window as unknown as { pow: { debug: DummiesDebug } }).pow.debug
      const stood = ids.map((id) => debug.nodeAt(id))
      const away = (): number =>
        ids.reduce((far, id, index) => {
          const at = debug.nodeAt(id)
          const from = stood[index]
          if (at === null || from === null) throw new Error(`pig ${id} has no drawn node`)
          return Math.max(far, Math.hypot(at.x - from.x, at.y - from.y, at.z - from.z))
        }, 0)
      return new Promise<OtherTurn>((resolve, reject) => {
        const deadline = performance.now() + limit
        const seen: OtherTurn = { card: false, drift: 0 }
        const sample = (): void => {
          const now = debug.hud()
          if (now.side === side) {
            resolve(seen)
            return
          }
          if (now.starting) seen.card = true
          try {
            seen.drift = Math.max(seen.drift, away())
          } catch (error) {
            reject(error)
            return
          }
          if (performance.now() >= deadline) reject(new Error('the turn never came back'))
          else requestAnimationFrame(sample)
        }
        sample()
      })
    },
    { ids: DUMMY_IDS, side: ours, limit: 20_000 }
  )

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 002 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

test("the dummy's card comes up and the turn comes back: every dummy where it stood, the keys muted, the brain not asked", async ({
  app
}) => {
  test.setTimeout(60_000)
  const { page } = app
  await openBattle(page, PROVING_GROUND)

  const ours = await hud(page)
  // These ids are the dummies: their nodes stand at the map's own marks.
  const before = await nodesOf(page)
  expect(before.map((node) => node.x).sort((a, b) => a - b)).toEqual(DUMMIES_AT.map((at) => at.x))

  // The player's pass, the way the keys make it, with the beat cut.
  await skipTurn(page)
  const handed = await hud(page)
  expect(handed.side, "it is the dummies' turn").not.toBe(ours.side)
  expect(handed.starting, 'on the card').toBe(true)

  // The walk key held through the whole of it: muted (input/battleInput.ts), so
  // it moves nobody.
  const watching = watchOtherTurn(page, ours.side)
  await press(page, 'walkForward')
  const turn = await watching
  await release(page, 'walkForward')

  expect(turn.card, "the dummy's card was up").toBe(true)
  expect(turn.drift, 'no dummy left its spot').toBeLessThan(1)
  expect(await nodesOf(page)).toEqual(before)
  const brain = await page.evaluate(() => (window as unknown as { pow: { debug: DummiesDebug } }).pow.debug.brain())
  expect(brain, 'the brain process was never asked').toMatchObject({ remote: true, asked: 0 })

  // It is the player's again, and the keys are live again.
  expect((await hud(page)).side).toBe(ours.side)
  await beginTurn(page)
  const start = await debugState(page)
  await hold(page, 'walkForward', 400)
  const walked = await debugState(page)
  expect(Math.hypot(walked.x - start.x, walked.z - start.z)).toBeGreaterThan(100)

  expect(app.errors()).toEqual([])
})
