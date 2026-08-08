// PHASE 001 — FIELD CONDITIONS, and the rules it actually imposes.
//
// The screen is the original's (fetext 66 over 297-301) and the spec asserts
// the DATA, like the two beside it. But the point of this one is the LAST
// test: a settings screen whose settings change nothing is a knob wired to
// nothing, and only an end-to-end run can tell the difference. The pure
// specs would pass either way — the same lesson `strike.spec.ts` was written
// for.

import { existsSync } from 'node:fs'
import type { Page } from '@playwright/test'

import { PHASE_ENV } from '../launch'
import { expect, test } from '../app'
import { landed, tap } from '../controller'
import { choose, labels, lightBar, values } from '../menu'
import { maxHealthFor } from '../../src/lib/game/health'
import { scaleHealth } from '../../src/lib/game/conditions'

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 001 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

/** Menu → MULTI-PLAYER → FIELD CONDITIONS, the way a player gets there. */
async function open(page: Page): Promise<void> {
  await choose(page, 'MULTI-PLAYER')
  await expect(page.locator('#multiplayer')).toBeVisible()
  await choose(page, 'FIELD CONDITIONS', 'multiPlayer')
  await expect(page.locator('#conditions')).toBeVisible()
}

test('FIELD CONDITIONS is the match rules, and only those', async ({ app }) => {
  const { page } = app
  await open(page)

  // 297-301 in the file's own order, minus SELECT PIG (302), which is not one
  // of them. The eight knobs at 276-283 shape a GENERATED level and belong to
  // LEVEL SETUP, not here — see ui/fieldConditions.ts.
  await expect
    .poll(() => labels(page, 'conditions'))
    .toEqual(['TURN TIME', 'HEALTH', 'PIGS', 'DEATHMATCH LIMIT', 'SUDDEN DEATH'])

  // Untouched, the clock is the LEVEL's — the remake borrows the game's own
  // word for unchanged (315) — health is NORMAL and a squad caps at five.
  // The two win conditions carry no setting because nothing can obey them.
  expect(await values(page, 'conditions')).toEqual(['NORMAL', 'NORMAL', '5', null, null])

  expect(app.errors()).toEqual([])
})

test('left and right walk a setting, and wrap', async ({ app }) => {
  const { page } = app
  await open(page)

  // Right off "the level's own" lands on the shortest turn the game offers.
  await lightBar(page, 'TURN TIME', 'conditions')
  await tap(page, 'menuRight')
  await expect.poll(async () => (await values(page, 'conditions'))[0]).toBe('10')
  // …and left off the shortest hands the clock back to the level, because
  // that choice sits at the front of the ring.
  await tap(page, 'menuLeft')
  await expect.poll(async () => (await values(page, 'conditions'))[0]).toBe('NORMAL')
  // Left again wraps to the far end — 99, the most the two-window clock can
  // show (lib/game/turns.ts).
  await tap(page, 'menuLeft')
  await expect.poll(async () => (await values(page, 'conditions'))[0]).toBe('99')
  await tap(page, 'menuRight')

  // A DARK bar refuses to move at all.
  await lightBar(page, 'SUDDEN DEATH', 'conditions')
  const before = await values(page, 'conditions')
  await tap(page, 'menuRight')
  expect(await values(page, 'conditions')).toEqual(before)

  expect(app.errors()).toEqual([])
})

test('what the screen says is what the battle gets', async ({ app }) => {
  const { page } = app
  await open(page)

  // Ten-second turns and half health — both away from the default, so
  // neither can pass by accident. The bar is lit by NAME rather than assumed
  // to be at the top: a screen is come back to wherever it was left.
  await lightBar(page, 'TURN TIME', 'conditions')
  await tap(page, 'menuRight')
  await lightBar(page, 'HEALTH', 'conditions')
  await tap(page, 'menuRight')
  expect(await values(page, 'conditions')).toEqual(['10', 'HALF', '5', null, null])

  await tap(page, 'menuBack')
  await expect(page.locator('#multiplayer')).toBeVisible()
  await choose(page, 'DONE', 'multiPlayer')
  await expect(page.locator('#battle')).toBeVisible()
  await landed(page)

  // The clock never had more than ten seconds on it.
  const hud = await page.evaluate(
    () => (window as unknown as { pow: { debug: { hud(): { seconds: number } } } }).pow.debug.hud()
  )
  expect(hud.seconds).toBeLessThanOrEqual(10)

  // And every pig started on half its CLASS's own figure — checked per pig
  // against the class table, not against a list of values. Half of a heavy's
  // 120 is 60, and 60 is another class's full figure, so "is not a full
  // figure" cannot tell the two apart; the class is what makes it exact.
  const [health, squads] = await Promise.all([
    page.evaluate(
      () =>
        (window as unknown as {
          pow: { debug: { health(): { name: string; health: number }[] } }
        }).pow.debug.health()
    ),
    page.evaluate(
      () =>
        (window as unknown as {
          pow: { debug: { squads(): { pigs: { name: string; pigClass: number }[] }[] } }
        }).pow.debug.squads()
    )
  ])
  const fielded = squads.flatMap((squad) => squad.pigs)
  expect(health.length).toBe(fielded.length)
  expect(fielded.length).toBeGreaterThan(0)
  for (let i = 0; i < health.length; i++) {
    const want = scaleHealth(maxHealthFor(fielded[i].pigClass), 'half')
    expect(health[i].health, `${health[i].name}, class ${fielded[i].pigClass}`).toBe(want)
  }

  await page.locator('#battle-leave').click()
  await expect(page.locator('#menu')).toBeVisible()
  expect(app.errors()).toEqual([])
})
