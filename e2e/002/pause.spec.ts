// PHASE 002 — the PAUSE: ESCAPE stops the mission, and the menu over it.
//
// The rules are pinned pure in `unit/pauseMenu.spec.ts`; what this is for is
// the wiring, which is where a pause can go wrong in ways no rule can see —
// the world still stepping behind the menu, a key still reaching the pig, the
// dashboard still animating over a frozen battle.
//
// Play asked for it and said why: alt-tabbing froze the world and left the
// sergeant talking. So the assertion that matters most here is the FIRST one
// — that nothing moves.

import { expect, test } from '../app'
import { startGame } from '../menu'
import { debugState, hud, press, release, tap } from '../controller'
import type { Page } from '@playwright/test'

/** The menu's own state, or null when the game is running. */
const menu = (
  page: Page
): Promise<{ row: number; confirming: boolean; yes: boolean } | null> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { battle?: { menu(): unknown } } }).pow
    return (pow?.battle?.menu() ?? null) as { row: number; confirming: boolean; yes: boolean } | null
  })

const paused = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { battle?: { paused(): boolean } } }).pow
    return pow?.battle?.paused() ?? false
  })

test('escape freezes the mission, and nothing in it moves', async ({ app }) => {
  const { page } = app
  await startGame(page)

  const before = await debugState(page)
  const clockBefore = (await hud(page)).seconds
  await tap(page, 'pause')
  expect(await paused(page)).toBe(true)
  // The menu opens on its first row with nothing armed.
  expect(await menu(page)).toMatchObject({ row: 0, confirming: false, yes: false })

  // WALK. The key is read — the poll runs in the scene's input pass, which is
  // ahead of the frame the pause stops — and the pig does not take a step,
  // because `engine.update` is never reached.
  await press(page, 'walkForward')
  for (let i = 0; i < 5; i++) await tap(page, 'turnLeft')
  await release(page, 'walkForward')

  const during = await debugState(page)
  expect(during.x).toBeCloseTo(before.x, 3)
  expect(during.z).toBeCloseTo(before.z, 3)
  expect(during.heading).toBeCloseTo(before.heading, 5)
  // …and the turn's clock is a whole reading of the same thing: it is the
  // engine's, and the engine has not stepped.
  expect((await hud(page)).seconds).toBe(clockBefore)

  // ESCAPE again lets it go, and now the same key walks.
  await tap(page, 'pause')
  expect(await paused(page)).toBe(false)
  expect(await menu(page)).toBeNull()
  await press(page, 'walkForward')
  await page.waitForTimeout(200)
  await release(page, 'walkForward')
  const after = await debugState(page)
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(1)
  expect(app.errors()).toEqual([])
})

test('the menu walks its five rows and arms the abort on NO', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await tap(page, 'pause')

  // The walking keys are the cursor's while the pause is up — the same
  // borrowing the skill menu does. UP on the top row is refused.
  await tap(page, 'walkForward')
  expect(await menu(page)).toMatchObject({ row: 0 })
  for (let i = 0; i < 4; i++) await tap(page, 'walkBack')
  expect(await menu(page)).toMatchObject({ row: 4 })
  // …and DOWN on the last one is refused too: it does not wrap.
  await tap(page, 'walkBack')
  expect(await menu(page)).toMatchObject({ row: 4 })

  // FIRE on ABORT asks the question rather than answering it, and the answer
  // it opens on is NO — so a player who presses twice stays in the mission.
  await tap(page, 'fire')
  expect(await menu(page)).toMatchObject({ confirming: true, yes: false })
  await tap(page, 'fire')
  expect(await menu(page)).toMatchObject({ confirming: false })
  expect(await paused(page)).toBe(true)

  // ESCAPE over an armed question takes the question down, not the pause.
  await tap(page, 'fire')
  expect(await menu(page)).toMatchObject({ confirming: true })
  await tap(page, 'pause')
  expect(await menu(page)).toMatchObject({ confirming: false })
  expect(await paused(page)).toBe(true)

  // Out through CONTINUE, which is the row it opened on.
  for (let i = 0; i < 4; i++) await tap(page, 'walkForward')
  expect(await menu(page)).toMatchObject({ row: 0 })
  await tap(page, 'fire')
  expect(await paused(page)).toBe(false)
  expect(app.errors()).toEqual([])
})

test('the volumes step in fives and stop at both ends', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await tap(page, 'pause')
  await tap(page, 'walkBack')

  const level = async (): Promise<{ master: number; sfx: number }> =>
    page.evaluate(() => {
      const pow = (window as unknown as { pow?: { battle?: { menu(): unknown } } }).pow
      return (pow?.battle?.menu() ?? { master: -1, sfx: -1 }) as { master: number; sfx: number }
    })

  expect(await level()).toMatchObject({ master: 100 })
  // The turning keys work a slider, and RIGHT on a full one is refused by the
  // clamp rather than by the key.
  await tap(page, 'turnRight')
  expect(await level()).toMatchObject({ master: 100 })
  await tap(page, 'turnLeft')
  expect(await level()).toMatchObject({ master: 95 })
  // The two sliders are separate: stepping one leaves the other where it was.
  expect(await level()).toMatchObject({ sfx: 100 })
  await tap(page, 'pause')
  expect(app.errors()).toEqual([])
})

test('confirming the abort ends the mission on the LOSS debrief', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await tap(page, 'pause')
  for (let i = 0; i < 4; i++) await tap(page, 'walkBack')
  await tap(page, 'fire')
  expect(await menu(page)).toMatchObject({ confirming: true, yes: false })
  // LEFT arms YES — the confirm reads the way it is drawn.
  await tap(page, 'turnLeft')
  await tap(page, 'fire')

  // AND IT IS THE ORDINARY LOSS PAGE. There is no MISSION ABORTED screen:
  // gtext 189 carries those words and nothing in the exe reads it. The abort
  // writes −2 into the outcome word and falls into the same debrief call the
  // normal end takes, and the page only ever asks `outcome == 0`.
  await expect(page.locator('#debrief')).toBeVisible()
  await expect(page.locator('#battle')).toBeHidden()
  expect(await paused(page)).toBe(false)

  // ESCAPE is EDIT SQUAD, which walks away with the mission still waiting —
  // the exe's own second key on this page.
  await tap(page, 'menuBack')
  await expect(page.locator('#player')).toBeVisible()
  expect(app.errors()).toEqual([])
})
