// PHASE 002 (app) — the rifle, end to end on the real training ground: take
// one in hand, hold the aim view, and put a bullet through a dummy.
//
// The pure halves are pinned on their own (projectile.spec). What this one
// covers is what lives BETWEEN them, which is where the bayonet's first miss
// turned out to be: the muzzle comes off a bone in a real pose, and nothing
// but a real swing through a real scene puts it where it belongs.

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { beginTurn, chooseSkill, nextTurn, warp } from '../controller'
import { startGame } from '../menu'
import { parsePog } from '../../src/lib/formats/pog'
import { targetsOf } from '../../src/lib/game/targets'
import { pickupsOf } from '../../src/lib/game/pickups'
import { createScript } from '../../src/lib/game/script'

const CAMP = parsePog(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.POG')))
/** 3 BAYONET is the first crate; breaking the first dummy drops the RIFLE. */
const BAYONET = 3
const RIFLE = 7

interface Debug {
  carrying(): { skill: number }[]
  holding(): number | null
  shots(): number
  firing(): string | null
  barks(): string[]
  props(): { at: { name: string }[] }
}

type Page = import('@playwright/test').Page

const look = (
  page: Page
): Promise<{
  carrying: number[]
  holding: number | null
  dummies: number
  firing: string | null
  barks: string[]
}> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { debug?: Debug } }).pow
    if (!pow?.debug) throw new Error('no battle scene is up')
    return {
      carrying: pow.debug.carrying().map((slot) => slot.skill),
      holding: pow.debug.holding(),
      dummies: pow.debug.props().at.filter((each) => each.name === 'DUMMY').length,
      firing: pow.debug.firing(),
      barks: pow.debug.barks()
    }
  })

/** Keep the highest bullet count the page ever saw: they cross a dummy in a
 * frame or two and polling from the test would miss it. */
const watchShots = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const w = window as unknown as { pow: { debug: Debug }; __fired?: number }
    w.__fired = 0
    const tick = (): void => {
      w.__fired = Math.max(w.__fired ?? 0, w.pow.debug.shots())
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
const peakShots = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __fired?: number }).__fired ?? 0)

/**
 * A press AND a release. Fire is a HELD action now — the power gauge is what
 * being held means (lib/game/gauge.ts) — so a press on its own is idempotent
 * and a second one would do nothing at all. A gun still goes off on the
 * rising edge; this just gives it both.
 */
const push = (page: Page, action: string): Promise<void> =>
  page.evaluate((a) => {
    const controller = (
      window as unknown as { pow: { controller: { press(x: string): void; release(x: string): void } } }
    ).pow.controller
    controller.press(a)
    controller.release(a)
  }, action)

const release = (page: Page, action: string): Promise<void> =>
  page.evaluate((a) => {
    ;(
      window as unknown as { pow: { controller: { release(x: string): void } } }
    ).pow.controller.release(a)
  }, action)

test('a rifle shot knocks a dummy down from across the yard', async ({ app }) => {
  const { page } = app
  await startGame(page)

  // Collect the bayonet, break the first dummy with it: that is what the map
  // script says drops the rifle in (e2e/002/script.spec.ts).
  const crate = pickupsOf(CAMP).find((pickup) => pickup.skill === BAYONET)!
  await warp(page, crate.x, crate.z, 0)
  await expect.poll(async () => (await look(page)).carrying).toContain(BAYONET)
  expect(await chooseSkill(page, BAYONET)).toBe(true)

  const before = (await look(page)).dummies
  const first = targetsOf(CAMP)[0]
  await warp(page, first.x, first.z - 220, 0)
  await beginTurn(page)
  await push(page, 'fire')
  await expect.poll(async () => (await look(page)).dummies, { timeout: 9000 }).toBe(before - 1)

  // The rifle came down under a canopy; walk into it and take it in hand.
  const rifleCrate = pickupsOf(CAMP).find((pickup) => pickup.skill === RIFLE)!
  await expect
    .poll(async () => (await look(page)).carrying, { timeout: 9000 })
    .not.toContain(RIFLE)
  // …but the bayonet SPENT the turn, and nothing is collected in the beats
  // between two of them (lib/game/spend.ts). So the crate is walked into on the
  // pig's NEXT turn, which is what a player would have to do as well.
  await nextTurn(page)
  await warp(page, rifleCrate.x, rifleCrate.z, 0)
  await expect.poll(async () => (await look(page)).carrying, { timeout: 9000 }).toContain(RIFLE)
  expect(await chooseSkill(page, RIFLE)).toBe(true)

  // Stand well back from another dummy — a rifle reaches 9000 units and this
  // is 1200, which a bayonet could not touch — hold the aim view, and fire.
  //
  // It has to be a dummy the SCRIPT has actually put on the ground: most of
  // CAMP's are not there until something signals for them, and one that is
  // not placed is not a target (lib/game/script.ts). Breaking the first is
  // what placed these.
  const placed = createScript(CAMP).finish(first.id).map((one) => one.id)
  const target = targetsOf(CAMP).find((one) => placed.includes(one.id))!
  expect(target, 'breaking the first dummy placed another to shoot at').toBeDefined()
  const standing = (await look(page)).dummies
  await warp(page, target.x, target.z - 1200, 0)
  await beginTurn(page)
  await watchShots(page)
  await push(page, 'aimMode')
  await push(page, 'fire')

  // Firing is a SEQUENCE and the press is only the start of it: ten frames of
  // fuse, then the bullet, then the camera rides it home (lib/game/shot.ts).
  await expect.poll(async () => (await look(page)).firing, { timeout: 3000 }).toBe('fuse')
  // …and the pig says something as the trigger goes, which is the gun arm of
  // `Pig::Fire`'s other half (audio/pigVoice.ts). It is a file name, so a spec
  // can say WHICH line without hearing it.
  const barks = (await look(page)).barks
  expect(barks, 'the pig fired without a word').toHaveLength(1)
  expect(barks[0]).toMatch(/^Speech\/Sku1\/Pig0\d\/0\dEN0[23]0[1-6]\.wav$/)

  // Leaning on the trigger must NOT loose a second bullet: `Pig::MayAct`
  // refuses for the whole window between the press and the shot (0x467a10),
  // which is what stops a rifle behaving like a machine gun.
  for (let again = 0; again < 5; again++) await push(page, 'fire')
  await expect.poll(async () => peakShots(page), { timeout: 9000 }).toBe(1)
  expect((await look(page)).barks, 'a spammed trigger said more than one line').toHaveLength(1)

  await expect.poll(async () => (await look(page)).dummies, { timeout: 9000 }).toBe(standing - 1)
  // …and the sequence lets go once the bullet is gone.
  await expect.poll(async () => (await look(page)).firing, { timeout: 9000 }).toBeNull()
  await release(page, 'aimMode')
})
