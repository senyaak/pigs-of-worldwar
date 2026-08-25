// PHASE 001 — the PIG MENU (record 19) over the squad, and what its three
// choices do: PROMOTE through the tree, SWAP POSITION whole, RENAME through
// the kind-0 machine. The rules are `lib/game/promotion.ts` and
// `unit/promotion.spec.ts`; this drives the screens.

import fs from 'node:fs'
import path from 'node:path'
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { test } from '../app'
import { SAVE_DIR } from '../launch'
import { FIRST_ARMY, TEST_TEAM, choose, labels, selection, values, nameTeam } from '../menu'
import { tap } from '../controller'
import { newGame, serialise } from '../../src/lib/game/save'
import { newSquad } from '../../src/lib/game/roster'

async function settled(page: Page, screen: 'playerScreen' | 'pigMenu'): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((which) => {
          const pow = (
            window as unknown as {
              pow?: Record<string, { flipping(): boolean } | undefined>
            }
          ).pow
          const hooks = pow?.[which]
          return hooks ? hooks.flipping() : true
        }, screen),
      { message: `${screen} is still driving` }
    )
    .toBe(false)
}

/**
 * A hash of the pixels where the pig menu's plaque stands and NOTHING else
 * does — left of the squad's `pigpro` board (x 232+) and the medallion
 * (x 230+), clear of both overlays' words and icons. CAREER PATH has no
 * backdrop of its own: the plaque must HOLD under it, and this strip is the
 * paint check that it did. A debug read is not a paint check (CLAUDE.md) —
 * the bug this pins showed the board's stale lines through the career words
 * while every state read answered correctly.
 */
const plaqueStrip = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const canvas = document.getElementById('player-screen') as HTMLCanvasElement | null
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return -1
    const pixels = context.getImageData(190, 430, 35, 30).data
    let hash = 0
    for (let i = 0; i < pixels.length; i++) hash = (hash * 31 + pixels[i]) | 0
    return hash
  })

const menuOpen = (page: Page, which: 'pigMenu' | 'careerPath'): Promise<boolean> =>
  page.evaluate((name) => {
    const pow = (window as unknown as { pow?: Record<string, { open(): boolean } | undefined> })
      .pow
    const hooks = pow?.[name]
    if (!hooks) throw new Error(`${name} is not up`)
    return hooks.open()
  }, which)

async function toFreshSquad(page: Page): Promise<void> {
  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await choose(page, 'NEW GAME', 'onePlayer')
  await expect(page.locator('#team')).toBeVisible()
  await choose(page, FIRST_ARMY, 'teamScreen')
  await expect(page.locator('#name')).toBeVisible()
  await nameTeam(page, TEST_TEAM)
  await expect(page.locator('#player')).toBeVisible()
  await settled(page, 'playerScreen')
}

test('the pig menu opens on a pig, refuses a broke promotion, and renames', async ({ app }) => {
  const { page } = app
  await toFreshSquad(page)

  // Down from START MISSION is REPLAY MISSIONS, then the first pig — the
  // list wraps through the two actions.
  await tap(page, 'menuDown')
  await tap(page, 'menuDown')
  expect(await selection(page, 'playerScreen')).toBe(0)
  await tap(page, 'menuSelect')
  await expect.poll(() => menuOpen(page, 'pigMenu')).toBe(true)

  // The three rows, opened on PROMOTE — and a GRUNT's price is one token.
  expect(await labels(page, 'pigMenu')).toEqual(['PROMOTE', 'SWAP POSITION', 'RENAME'])
  expect(await selection(page, 'pigMenu')).toBe(0)
  expect((await values(page, 'pigMenu'))[0]).toBe('1')

  // A fresh campaign has no tokens: PROMOTE is refused and the menu stays.
  await tap(page, 'menuSelect')
  expect(await menuOpen(page, 'pigMenu')).toBe(true)
  expect((await values(page, 'playerScreen'))[0]).toBe('GRUNT')

  // RENAME opens the kind-0 machine with the pig's own title and seven
  // letters, and the accepted name comes back to the squad.
  await tap(page, 'menuDown')
  await tap(page, 'menuDown')
  expect(await selection(page, 'pigMenu')).toBe(2)
  await tap(page, 'menuSelect')
  await expect(page.locator('#name')).toBeVisible()
  await expect.poll(() => labels(page, 'nameScreen')).toEqual(['PLEASE NAME YOUR PIG'])
  await nameTeam(page, 'NAPOLEON')
  await expect(page.locator('#player')).toBeVisible()
  // Seven is the grid's own limit — the eighth letter never went in.
  await expect.poll(() => labels(page, 'playerScreen')).toContain('NAPOLEO')

  // BACK off the squad is the MAIN MENU — play's rule (main.ts, onBack).
  await tap(page, 'menuBack')
  await expect(page.locator('#menu')).toBeVisible()
  expect(app.errors()).toEqual([])
})

test('swap position moves the whole pig, and back disarms', async ({ app }) => {
  const { page } = app
  await toFreshSquad(page)
  const before = (await labels(page, 'playerScreen')).slice(0, 8)

  // Arm a swap on the first pig — two down, through REPLAY MISSIONS.
  await tap(page, 'menuDown')
  await tap(page, 'menuDown')
  await tap(page, 'menuSelect')
  await expect.poll(() => menuOpen(page, 'pigMenu')).toBe(true)
  await tap(page, 'menuDown')
  expect(await selection(page, 'pigMenu')).toBe(1)
  await tap(page, 'menuSelect')
  await expect.poll(() => menuOpen(page, 'pigMenu')).toBe(false)

  // …and complete it on the third: both travel whole.
  await tap(page, 'menuDown')
  await tap(page, 'menuDown')
  expect(await selection(page, 'playerScreen')).toBe(2)
  await tap(page, 'menuSelect')
  await expect
    .poll(async () => (await labels(page, 'playerScreen'))[0])
    .toBe(before[2])
  expect((await labels(page, 'playerScreen'))[2]).toBe(before[0])

  // Arm one more and think better of it: BACK only disarms, the squad stays.
  await tap(page, 'menuSelect')
  await expect.poll(() => menuOpen(page, 'pigMenu')).toBe(true)
  await tap(page, 'menuDown')
  await tap(page, 'menuSelect')
  await expect.poll(() => menuOpen(page, 'pigMenu')).toBe(false)
  await tap(page, 'menuBack')
  await expect(page.locator('#player')).toBeVisible()

  // BACK off the squad is the MAIN MENU — play's rule (main.ts, onBack).
  await tap(page, 'menuBack')
  await expect(page.locator('#menu')).toBeVisible()
  expect(app.errors()).toEqual([])
})

test('a token walks a grunt down the career path, and the next step costs two', async ({
  app
}) => {
  const { page } = app

  // A campaign with tokens in the bank, planted as a save file — the menus
  // never grant one, only a mission does.
  const rich = {
    ...newGame(
      'RICH',
      0,
      newSquad(
        ['JONES', 'DEN', 'BASIL', 'GINGER', 'MONTY', 'SMITH', 'PONSONBY', 'PERCY'],
        [0, 1, 2, 3, 4, 5, 6, 7]
      ),
      new Date().toISOString()
    ),
    tokens: 3
  }
  // The folder holds `<slot>.json` (src/main/saves.ts).
  fs.mkdirSync(SAVE_DIR, { recursive: true })
  fs.writeFileSync(path.join(SAVE_DIR, 'savearmy7.json'), serialise(rich))

  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await choose(page, 'LOAD GAME', 'onePlayer')
  await expect(page.locator('#load')).toBeVisible()
  await choose(page, 'RICH', 'loadScreen')
  await expect(page.locator('#player')).toBeVisible()
  await settled(page, 'playerScreen')

  // PROMOTE on a GRUNT opens CAREER PATH — four careers, the tree's order.
  // Two down: START MISSION → REPLAY MISSIONS → the first pig.
  await tap(page, 'menuDown')
  await tap(page, 'menuDown')
  await tap(page, 'menuSelect')
  await expect.poll(() => menuOpen(page, 'pigMenu')).toBe(true)
  await settled(page, 'pigMenu')
  // The plaque at rest, dim and all — two reads 150 ms apart agreeing. The
  // spacing is the point: expect.poll's first turn is immediate, and two
  // reads off one frame agree about anything, ramping veil included.
  let plaque = await plaqueStrip(page)
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(150)
        const now = await plaqueStrip(page)
        const same = now === plaque
        plaque = now
        return same
      },
      { message: 'the plaque never settled' }
    )
    .toBe(true)
  await tap(page, 'menuSelect')
  await expect.poll(() => menuOpen(page, 'careerPath')).toBe(true)
  expect(await labels(page, 'careerPath')).toEqual([
    'HEAVY WEAPONS',
    'ENGINEER',
    'ESPIONAGE',
    'MEDIC'
  ])
  // The PAINT check: the career words stand on the pig menu's own plaque,
  // which held — not on the squad's board showing through a veil.
  await expect
    .poll(() => plaqueStrip(page), { message: 'the plaque left with the menu' })
    .toBe(plaque)

  // BACK hands the plaque back to the pig menu, rows and all — then PROMOTE
  // opens the career path again.
  await tap(page, 'menuBack')
  await expect.poll(() => menuOpen(page, 'careerPath')).toBe(false)
  expect(await menuOpen(page, 'pigMenu')).toBe(true)
  expect(await selection(page, 'pigMenu')).toBe(0)
  await tap(page, 'menuSelect')
  await expect.poll(() => menuOpen(page, 'careerPath')).toBe(true)

  // ENGINEER's first step is the SAPPER, for the one token.
  await tap(page, 'menuDown')
  expect(await selection(page, 'careerPath')).toBe(1)
  await tap(page, 'menuSelect')
  await expect.poll(() => menuOpen(page, 'careerPath')).toBe(false)
  await expect.poll(async () => (await values(page, 'playerScreen'))[0]).toBe('SAPPER')
  // The plaque the career screen stood on leaves AFTER the choice — wait it
  // out, or the next select lands on a leaving menu and is swallowed.
  await expect.poll(() => menuOpen(page, 'pigMenu')).toBe(false)

  // The same pig's next step is single — no career screen, two tokens, paid
  // on the spot.
  await tap(page, 'menuSelect')
  await expect.poll(() => menuOpen(page, 'pigMenu')).toBe(true)
  expect((await values(page, 'pigMenu'))[0]).toBe('2')
  await tap(page, 'menuSelect')
  await expect.poll(() => menuOpen(page, 'pigMenu')).toBe(false)
  await expect.poll(async () => (await values(page, 'playerScreen'))[0]).toBe('ENGINEER')

  // Three minus one minus two: the next PROMOTE is a refusal.
  await tap(page, 'menuSelect')
  await expect.poll(() => menuOpen(page, 'pigMenu')).toBe(true)
  await tap(page, 'menuSelect')
  expect(await menuOpen(page, 'pigMenu')).toBe(true)
  expect((await values(page, 'playerScreen'))[0]).toBe('ENGINEER')
  await tap(page, 'menuBack')
  await expect.poll(() => menuOpen(page, 'pigMenu')).toBe(false)

  // BACK off the squad is the MAIN MENU — play's rule (main.ts, onBack).
  await tap(page, 'menuBack')
  await expect(page.locator('#menu')).toBeVisible()
  expect(app.errors()).toEqual([])
})
