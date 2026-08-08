// PHASE 002 (app) — the grenade, end to end: charge the power gauge, let go,
// and knock a dummy down with what lands.
//
// The pure halves are pinned next door; what this covers is the wiring, which
// is where every previous weapon's bug lived — and it earned its keep on the
// first run. `grenades.update` had been spliced into the wrong block (the
// aftermath's, not the frame's), so a grenade left the hand and then hung in
// the air for ever. Nothing but a real throw could have shown that, and the
// position this spec reads is what showed it.
//
// No crate on the training ground carries a grenade, so it comes from the
// console the same way a map does (`pow.give`, ui/battle.ts).

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { beginTurn, press, release, warp } from '../controller'
import { startGame } from '../menu'
import { parsePog } from '../../src/lib/formats/pog'
import { targetsOf } from '../../src/lib/game/targets'
import { GAUGE_SECONDS } from '../../src/lib/game/gauge'
import { BLAST_CORE } from '../../src/lib/game/grenade'
import { AIM_LOB } from '../../src/lib/game/aim'

const CAMP = parsePog(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.POG')))
const GRENADE = 19
/** The one dummy CAMP has standing before the map script does anything. */
const FIRST = targetsOf(CAMP)[0]

type Page = import('@playwright/test').Page

interface Live {
  x: number
  y: number
  z: number
  fuse: number
}

interface Debug {
  holding(): number | null
  aim(): number | null
  charging(): number | null
  grenades(): Live[]
  props(): { at: { name: string }[] }
}

const look = (
  page: Page
): Promise<{
  holding: number | null
  charge: number | null
  aim: number | null
  live: Live[]
  dummies: number
}> =>
  page.evaluate(() => {
    const debug = (window as unknown as { pow: { debug: Debug } }).pow.debug
    return {
      holding: debug.holding(),
      aim: debug.aim(),
      charge: debug.charging(),
      live: debug.grenades(),
      dummies: debug.props().at.filter((one) => /DUMMY/i.test(one.name)).length
    }
  })

const give = (page: Page, skill: number): Promise<boolean> =>
  page.evaluate(
    (s) => (window as unknown as { pow: { give(x: number): boolean } }).pow.give(s),
    skill
  )

/** Stand `backBy` short of the first dummy, holding a grenade, clock running. */
const armed = async (page: Page, backBy: number): Promise<void> => {
  await startGame(page)
  await warp(page, FIRST.x, FIRST.z - backBy, 0)
  await beginTurn(page)
  expect(await give(page, GRENADE)).toBe(true)
  await expect.poll(async () => (await look(page)).holding).toBe(GRENADE)
}

test('the gauge fills while F is held and the throw comes on the release', async ({ app }) => {
  const { page } = app
  await armed(page, 900)

  // The gauge is SHOWN as soon as a weapon that has one is in hand — which is
  // what the original does with it — so this reads 0 rather than null.
  expect((await look(page)).charge).toBe(0)

  // Hold it: 0x50 a frame toward 0xfff (lib/game/gauge.ts).
  await press(page, 'fire')
  await expect
    .poll(async () => (await look(page)).charge ?? 0, { timeout: 4000 })
    .toBeGreaterThan(0.3)
  expect((await look(page)).charge ?? 0).toBeLessThanOrEqual(1)

  // Letting go arms the same ten-frame fuse a gun's press arms, and then it is
  // in the air with about five seconds on it — the row's own 150 frames at the
  // engine's rate, three of arming, and a jitter of up to seven.
  await release(page, 'fire')
  await expect
    .poll(async () => (await look(page)).live.length, { timeout: 4000 })
    .toBeGreaterThan(0)
  const thrown = (await look(page)).live[0]
  expect(thrown.fuse).toBeGreaterThan(4.5)
  expect(thrown.fuse).toBeLessThan(5.5)

  // …and it goes off on its own, without having hit anything.
  await expect.poll(async () => (await look(page)).live.length, { timeout: 12000 }).toBe(0)
})

test('a grenade comes up lobbing, and Q and E move it', async ({ app }) => {
  const { page } = app
  await armed(page, 900)

  // It comes out already pointing up: 45°, which is the 0x200 `ReadyWeapon`
  // writes for everything that is not a gun (lib/game/aim.ts).
  expect((await look(page)).aim).toBe(AIM_LOB)

  // …and the keys move it. This is what was broken: the angle was tracking
  // all along, but `aim()` reported null for anything with no aiming POSE, so
  // nothing on the dashboard ever showed it.
  await press(page, 'aimDown')
  try {
    await expect
      .poll(async () => (await look(page)).aim ?? 0, { timeout: 3000 })
      .toBeLessThan(AIM_LOB - 40)
  } finally {
    await release(page, 'aimDown')
  }
})

test('holding F to the top throws by itself', async ({ app }) => {
  const { page } = app
  await armed(page, 900)

  // The exe throws on the release OR when the charge tops out (0x493b39), so
  // a button held past the fill time does not sit there charging for ever.
  await press(page, 'fire')
  try {
    await expect
      .poll(async () => (await look(page)).live.length, { timeout: (GAUGE_SECONDS + 4) * 1000 })
      .toBeGreaterThan(0)
  } finally {
    await release(page, 'fire')
  }
})

test('what it drops at its feet flattens a dummy inside the blast', async ({ app }) => {
  const { page } = app
  // Inside the blast's own CORE — 512 units, the radius the exe pays full
  // damage over (lib/game/grenade.ts) — and far enough out that this is the
  // BLAST doing it rather than the thing landing on the dummy's head.
  await armed(page, BLAST_CORE - 100)

  // A bare tap charges almost nothing, so `row.speed * charge >> 12` is almost
  // nothing and the thing drops where the pig stands. A HALF-charged level
  // throw sails clean past a target this close and rolls on for a second and a
  // half, which is the first thing this spec measured — worth knowing before
  // anyone calls that a bug.
  const before = (await look(page)).dummies
  await press(page, 'fire')
  await release(page, 'fire')
  await expect
    .poll(async () => (await look(page)).live.length, { timeout: 4000 })
    .toBeGreaterThan(0)

  await expect.poll(async () => (await look(page)).dummies, { timeout: 14000 }).toBe(before - 1)
})
