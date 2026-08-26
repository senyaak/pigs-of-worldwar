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
 * How many LETTER pixels stand in the board's second line — the band the
 * squad's `pigpro` writes the lit pig's NAME across (y 358), which is also
 * the gap CAREER PATH leaves between its title (y 339) and its career name
 * (y 373). The career screen has no backdrop of its own: it writes ON the
 * board, and the board's own lines make way while it is up.
 *
 * A debug read is not a paint check (CLAUDE.md) — the bug this pins showed
 * the lit pig's stale lines under the career words while every state read
 * answered correctly. It counts BRIGHTNESS rather than hashing the band,
 * and that is not a detail: hashing measures the DIM VEIL, which ramps 10
 * ticks of 40 ms behind an overlay, so two captures a keypress apart differ
 * by the shade alone (it cost a run, and a full-canvas pixel diff showed
 * the band itself identical both times). A letter is written in the light
 * shade and stays far over 100 through a veil that only takes a third.
 */
const bandLetters = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const canvas = document.getElementById('player-screen') as HTMLCanvasElement | null
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return -1
    const pixels = context.getImageData(240, 356, 180, 15).data
    let lit = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if ((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 > 100) lit++
    }
    return lit
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

  // Two down: START MISSION → REPLAY MISSIONS → the first pig. With the pig
  // LIT and no overlay up, the board writes its name across the band — which
  // is what gives the check below its teeth: the words really are painted
  // there, and the career screen has to clear them.
  await tap(page, 'menuDown')
  await tap(page, 'menuDown')
  await expect
    .poll(() => bandLetters(page), { message: "the board never wrote the pig's name" })
    .toBeGreaterThan(0)

  // PROMOTE on a GRUNT opens CAREER PATH — four careers, the tree's order.
  await tap(page, 'menuSelect')
  await expect.poll(() => menuOpen(page, 'pigMenu')).toBe(true)
  await tap(page, 'menuSelect')
  await expect.poll(() => menuOpen(page, 'careerPath')).toBe(true)
  expect(await labels(page, 'careerPath')).toEqual([
    'HEAVY WEAPONS',
    'ENGINEER',
    'ESPIONAGE',
    'MEDIC'
  ])

  // THE PAINT CHECK: the band between the career title and the career name
  // is bare. The board's own line stood there a moment ago and the career
  // screen is drawn ON the board, so a leaked line is exactly the bug play
  // reported — stale words showing under the career words.
  await expect
    .poll(() => bandLetters(page), { message: 'the board leaked under the career words' })
    .toBe(0)

  // ENGINEER's first step is the SAPPER, for the one token — the carousel
  // walks RIGHT, play's rule: "кнопки в лево в право, а не в верх в низ".
  await tap(page, 'menuRight')
  expect(await selection(page, 'careerPath')).toBe(1)
  await tap(page, 'menuSelect')
  await expect.poll(() => menuOpen(page, 'careerPath')).toBe(false)
  await expect.poll(async () => (await values(page, 'playerScreen'))[0]).toBe('SAPPER')

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
