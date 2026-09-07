// PHASE 002 (app) — THE MACHINE THINKS IN ITS OWN PROCESS.
//
// Everything else about the split is pinned pure (unit/brainPort.spec.ts:
// which answer belongs to which question, what a dropped one does, what a
// dead brain costs). What no pure spec can reach is the thing play actually
// asked for — that the flood really happens somewhere other than the thread
// the picture is drawn on. That needs the whole rig: an Electron main that
// forks `out/main/brain.js`, a preload carrying the messages, and a battle
// with a side the machine plays.
//
// So this hands the turn over and waits for an ORDER to come back down the
// pipe. `pow.debug.brain()` counts the asks out and the orders in
// (three/battle.ts); an `answered` that climbs cannot happen unless the
// process started, read the map off disk, ran a plan and replied.

import { existsSync } from 'node:fs'

import { PHASE_ENV } from '../launch'
import { expect, leaveBattle, test } from '../app'
import { skipTurn, swapMap } from '../controller'
import { startGame } from '../menu'

/** A map with somebody to fight — the training ground has nobody, so nothing
 * on it is ever the machine's turn. */
const MAP = 'ESTU'

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 002 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

test('the AI process answers, and the battle runs on what it says', async ({ app }) => {
  test.setTimeout(90_000)
  const { page } = app
  await startGame(page)
  expect(await swapMap(page, MAP), `${MAP} did not load`).toBe(true)

  const brain = (): Promise<{ remote: boolean; asked: number; answered: number }> =>
    page.evaluate(() => {
      const pow = (
        window as unknown as {
          pow?: { debug?: { brain(): { remote: boolean; asked: number; answered: number } } }
        }
      ).pow
      if (!pow?.debug) throw new Error('no battle scene is up — window.pow.debug is missing')
      return pow.debug.brain()
    })

  // Side 0 is the player's and it opens (lib/game/muster.ts), so nothing has
  // been asked of the brain yet — nothing has been the machine's.
  expect(await brain(), 'the battle is wired to the process').toMatchObject({
    remote: true,
    asked: 0,
    answered: 0
  })

  // Hand it over. From here the seat asks, the pipe carries it to
  // `out/main/brain.js`, and the order comes back.
  await skipTurn(page)
  await expect
    .poll(async () => (await brain()).answered, {
      message: 'the AI process never answered',
      timeout: 30_000
    })
    .toBeGreaterThan(0)

  const counts = await brain()
  expect(counts.asked, 'every answer belongs to an ask').toBeGreaterThanOrEqual(counts.answered)

  await leaveBattle(page)
})
