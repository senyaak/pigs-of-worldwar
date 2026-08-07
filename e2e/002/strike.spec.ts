// PHASE 002 (app) — a swing that actually connects, on the real training
// ground: collect the bayonet, take it in hand, walk up to a dummy and knock
// it down.
//
// The pieces of this were each pinned on their own (melee.spec, health.spec,
// objects.spec) and it still did not work in play — "просто машу перед
// манекеном и ничего не происходит". Every one of those specs is pure, and
// the thing that was broken lives between them: where the blade ends up once
// a real bone in a real pose has carried it. So this one drives the whole
// path and reads `pow.debug.strike()`, which reports the miss in numbers.

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { beginTurn, warp } from '../controller'
import { startGame } from '../menu'
import { parsePog } from '../../src/lib/formats/pog'
import { targetsOf } from '../../src/lib/game/targets'
import { pickupsOf } from '../../src/lib/game/pickups'

const CAMP = parsePog(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.POG')))
/** 3 BAYONET — the training ground's first weapon (lib/game/skills.ts). */
const BAYONET = 3

interface Debug {
  carrying(): { skill: number }[]
  holding(): number | null
  swinging(): boolean
  strike(): unknown
  props(): { at: { name: string; x: number; z: number }[] }
}

type Page = import('@playwright/test').Page

/** Everything the spec reads, in one hop — closures do not survive the trip
 * into the page, so this takes no arguments and returns the lot. */
const look = (
  page: Page
): Promise<{
  carrying: number[]
  holding: number | null
  swinging: boolean
  dummies: number
  strike: unknown
}> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { debug?: Debug } }).pow
    if (!pow?.debug) throw new Error('no battle scene is up')
    return {
      carrying: pow.debug.carrying().map((slot) => slot.skill),
      holding: pow.debug.holding(),
      swinging: pow.debug.swinging(),
      dummies: pow.debug.props().at.filter((each) => each.name === 'DUMMY').length,
      strike: pow.debug.strike()
    }
  })

const push = (page: Page, action: string): Promise<void> =>
  page.evaluate((a) => {
    const pow = (window as unknown as { pow: { controller: { press(x: string): void } } }).pow
    pow.controller.press(a)
  }, action)

test('a bayonet swung at a dummy knocks it down', async ({ app }) => {
  const { page } = app
  await startGame(page)

  // The bayonet's crate, straight out of the shipped map.
  const crate = pickupsOf(CAMP).find((pickup) => pickup.skill === BAYONET)
  expect(crate, 'CAMP carries a bayonet crate').toBeDefined()
  await warp(page, crate!.x, crate!.z, 0)
  await expect.poll(async () => (await look(page)).carrying).toContain(BAYONET)

  // Take it in hand the way a player does: R opens the menu, SPACE takes what
  // is under the cursor. The pig carries one skill, so that is the bayonet.
  await push(page, 'skills')
  await push(page, 'jump')
  await expect.poll(async () => (await look(page)).holding).toBe(BAYONET)

  const before = (await look(page)).dummies
  expect(before).toBeGreaterThan(0)

  // Now stand in front of a dummy, facing it, and swing. The blade reaches
  // about 230 from the hand and the hand is barely ahead of the pig, so
  // "within arm's length" is a good deal closer than a pig is wide.
  const dummy = targetsOf(CAMP)[0]
  await warp(page, dummy.x, dummy.z - 220, 0)
  await beginTurn(page)
  await push(page, 'fire')
  // The swing has to START before it can land — split the two, so a failure
  // says which half broke.
  await expect.poll(async () => (await look(page)).swinging, { timeout: 3000 }).toBe(true)
  await expect.poll(async () => (await look(page)).swinging, { timeout: 8000 }).toBe(false)

  // …and if it did not land, say WHY rather than just failing.
  const after = await look(page)
  expect(after.strike, 'the swing never resolved a strike at all').not.toBeNull()
  expect(after.dummies, `no dummy went down — ${JSON.stringify(after.strike)}`).toBe(before - 1)
})
