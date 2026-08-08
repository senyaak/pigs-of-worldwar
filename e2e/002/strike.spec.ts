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

import { beginTurn, chooseSkill, warp } from '../controller'
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
  effects(): number
  smoke(): number
  fire(): number
  script(): { absent: number[]; falling: number }
  aftermath(): boolean
  hud(): { seconds: number }
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
  effects: number
}> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { debug?: Debug } }).pow
    if (!pow?.debug) throw new Error('no battle scene is up')
    return {
      carrying: pow.debug.carrying().map((slot) => slot.skill),
      holding: pow.debug.holding(),
      swinging: pow.debug.swinging(),
      dummies: pow.debug.props().at.filter((each) => each.name === 'DUMMY').length,
      strike: pow.debug.strike(),
      effects: pow.debug.effects()
    }
  })

/**
 * Watch the effect rings from INSIDE the page, keeping the highest count seen.
 *
 * They live about half a second and polling from the test misses that window
 * outright — `expect.poll` is at second-long intervals by the time the swing
 * lands. So the page keeps its own high-water mark, once a frame, and the
 * spec reads it afterwards.
 */
interface Peak {
  rings: number
  smoke: number
  fire: number
  falling: number
  /** Whether the beat after the kill was ever seen running. */
  held: boolean
  /** The turn clock on the first and last frames of that beat. They must be
   * the same number: the clock does not run through it. */
  heldFirst: number
  heldLast: number
}

const watchEffects = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const w = window as unknown as { pow: { debug: Debug }; __peak?: Peak }
    w.__peak = { rings: 0, smoke: 0, fire: 0, falling: 0, held: false, heldFirst: 0, heldLast: 0 }
    const tick = (): void => {
      const peak = w.__peak!
      peak.rings = Math.max(peak.rings, w.pow.debug.effects())
      peak.smoke = Math.max(peak.smoke, w.pow.debug.smoke())
      peak.fire = Math.max(peak.fire, w.pow.debug.fire())
      peak.falling = Math.max(peak.falling, w.pow.debug.script().falling)
      if (w.pow.debug.aftermath()) {
        const seconds = w.pow.debug.hud().seconds
        if (!peak.held) peak.heldFirst = seconds
        peak.heldLast = seconds
        peak.held = true
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

const peakEffects = (page: Page): Promise<Peak> =>
  page.evaluate(
    () =>
      (window as unknown as { __peak?: Peak }).__peak ?? {
        rings: 0,
        smoke: 0,
        fire: 0,
        falling: 0,
        held: false,
        heldFirst: 0,
        heldLast: 0
      }
  )

const holding = (page: Page): Promise<boolean> =>
  page.evaluate(() =>
    (window as unknown as { pow: { debug: Debug } }).pow.debug.aftermath()
  )

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

  // Take it in hand the way a player does, through the real menu — and by
  // SKILL rather than by cell, because what else the pig is carrying decides
  // which cell the bayonet lands in (e2e/controller.ts).
  expect(await chooseSkill(page, BAYONET)).toBe(true)
  await expect.poll(async () => (await look(page)).holding).toBe(BAYONET)

  const before = (await look(page)).dummies
  expect(before).toBeGreaterThan(0)

  // Now stand in front of a dummy, facing it, and swing. The blade reaches
  // about 230 from the hand and the hand is barely ahead of the pig, so
  // "within arm's length" is a good deal closer than a pig is wide.
  const dummy = targetsOf(CAMP)[0]
  await warp(page, dummy.x, dummy.z - 220, 0)
  await beginTurn(page)
  await watchEffects(page)
  await push(page, 'fire')
  // The swing has to START before it can land — split the two, so a failure
  // says which half broke.
  await expect.poll(async () => (await look(page)).swinging, { timeout: 3000 }).toBe(true)
  await expect.poll(async () => (await look(page)).swinging, { timeout: 8000 }).toBe(false)

  // Two effects, and they are separate things: the HIT throws the bayonet's
  // own two rings, and the dummy BREAKING throws parameter row 0 off its own
  // handler — three bursts of smoke, fourteen puffs between them, plus the two
  // clouds of seventy the fireball is made of. Neither is something a
  // screenshot can be asserted on — all of it is colour on a transparent quad
  // — so the page keeps the counts.
  const peak = await peakEffects(page)
  expect(peak.rings, 'the hit threw no rings').toBe(2)
  expect(peak.smoke, 'the dummy came apart without smoke').toBe(14)
  expect(peak.fire, 'the dummy came apart without a fireball').toBe(140)

  // …and the bayonet is GONE, which play said before the binary did. Not
  // because it ran out — the ammo pass checks the slot's −1 first and skips
  // the rounds-in-hand counter with it (0x469790), so on the training ground
  // nothing ever runs down. The SCRIPT takes it: breaking this dummy places
  // the next things, and both placement arms call `Pig::ClearInventory` on
  // the acting pig (0x468f50). A tutorial step hands you one weapon and takes
  // it back when the step is done.
  await expect
    .poll(async () => (await look(page)).carrying, { timeout: 5000 })
    .not.toContain(BAYONET)
  expect((await look(page)).holding, 'the script left a weapon in its hands').toBeNull()
  // …and the map's SCRIPT ran: this dummy signals label 2, and a crate of
  // rifles waits on it. A crate is a pickup, so the placer drops it in from
  // 0xC00 up rather than switching it on (lib/game/script.ts).
  expect(peak.falling, 'the first dummy dropped no crate in').toBeGreaterThan(0)

  // …and the game STOPPED to show it. The exe will not hand the turn on until
  // nothing is live, and then not for another fifteen quiet frames, with the
  // camera on whatever was just placed (0x4661a0, lib/game/aftermath.ts).
  expect(peak.held, 'the kill did not hold the turn at all').toBe(true)
  // The clock does not run through it — first frame and last read the same.
  expect(peak.heldLast, 'the turn clock ran while the crate came down').toBe(peak.heldFirst)
  // …and it lets go once the crate is down.
  await expect.poll(async () => holding(page), { timeout: 9000 }).toBe(false)

  // …and if it did not land, say WHY rather than just failing.
  const after = await look(page)
  expect(after.strike, 'the swing never resolved a strike at all').not.toBeNull()
  expect(after.dummies, `no dummy went down — ${JSON.stringify(after.strike)}`).toBe(before - 1)
})
