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
import { DUMMY_MODEL, targetsOf } from '../../src/lib/game/targets'
import { GAUGE_SECONDS } from '../../src/lib/game/gauge'
import { BLAST_CORE } from '../../src/lib/game/grenade'
import { AIM_LOB } from '../../src/lib/game/aim'

const CAMP = parsePog(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.POG')))
const GRENADE = 19
/** The one dummy CAMP has standing before the map script does anything.
 *
 * Filtered by NAME first, because every scenery record on the map is a target
 * now — the house's walls and the 85 firs among them (lib/game/breakable.ts) —
 * and the first of those in file order is a tree. */
const DUMMIES = CAMP.filter((object) => object.name.toUpperCase() === DUMMY_MODEL)
const FIRST = targetsOf(DUMMIES)[0]

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

test('a SECOND press sets it off where it lies', async ({ app }) => {
  const { page } = app
  await armed(page, 900)

  // Throw one, and catch it while it is still live: five seconds of fuse is a
  // long time to be standing next to something.
  await press(page, 'fire')
  await release(page, 'fire')
  await expect
    .poll(async () => (await look(page)).live.length, { timeout: 4000 })
    .toBeGreaterThan(0)
  const left = (await look(page)).live[0].fuse
  expect(left, 'it has seconds to run').toBeGreaterThan(2)

  // Play's own rule — "при повторном нажатии f граната должна взрываться" — and it
  // survived being broken once: ONE BLOW A TURN swallowed the press before the
  // detonator could see it (lib/game/battle.ts), which is exactly the kind of thing
  // that stays broken quietly. Setting off what is already in the air is the END of
  // a blow, not a second one.
  await press(page, 'fire')
  await release(page, 'fire')
  await expect.poll(async () => (await look(page)).live.length, { timeout: 3000 }).toBe(0)

  expect(app.errors()).toEqual([])
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

test('a thrown weapon has a camera of its own, and two of them', async ({ app }) => {
  const { page } = app
  await armed(page, 900)

  // Play: "когда в руки берёшь оружие — меняется камера", and "есть отдельная
  // кнопка, которая меняет вид пока держишь (у нас G)". Both are the exe's own
  // (three/chase.ts): taking a thrown weapon in HAND runs 0x493BB0's dispatch,
  // which asks for camera mode 4 at 3500, and the VIEW KEY gives mode 0x12, the
  // TR cam, at 1700 and close over his back. **The fire button is not part of
  // it**, which is what this spec is really pinning: it was, for one commit,
  // and that was the bug.
  const view = (): Promise<string> =>
    page.evaluate(() => (window as unknown as { pow: { debug: { view(): string } } }).pow.debug.view())
  const eye = (): Promise<{ x: number; y: number; z: number }> =>
    page.evaluate(() =>
      (window as unknown as { pow: { debug: { camera(): { x: number; y: number; z: number } } } })
        .pow.debug.camera()
    )

  // The rig EASES between two views (three/chase.ts), so every reading here is
  // taken once the camera has stopped moving — a position read on the frame the
  // view changed is still the last view's.
  const settled = async (): Promise<{ x: number; y: number; z: number }> => {
    let last = await eye()
    await expect
      .poll(
        async () => {
          const now = await eye()
          const still = Math.hypot(now.x - last.x, now.y - last.y, now.z - last.z) < 1
          last = now
          return still
        },
        { timeout: 5000, message: 'the camera to settle' }
      )
      .toBe(true)
    return last
  }

  // Nothing pressed: the grenade is in his hands and that is enough.
  expect(await view(), 'the weapon in hand changes the view').toBe('lob')
  const aiming = await settled()
  // Where the pig is, to measure both cameras' distance from. Game space is
  // Y-down and the rig is Y-up, hence the z sign in `outFrom` below.
  const subject = await page.evaluate(() =>
    (window as unknown as { pow: { debug: { currentPig(): { x: number; z: number } } } })
      .pow.debug.currentPig()
  )

  await press(page, 'aimMode')
  await expect.poll(view, { timeout: 2000 }).toBe('throw')
  const behind = await settled()
  // The key-held view COMES IN: 1700 against the in-hand view's 3500, which is
  // the two modes' own rows and the sharpest difference between them.
  const outFrom = (at: { x: number; z: number }): number =>
    Math.hypot(at.x - subject.x, at.z + subject.z)
  expect(outFrom(behind), 'the view key brings the camera in').toBeLessThan(
    outFrom(aiming) - 1
  )

  // Letting the key go brings the raised view back — it is HELD, the way the exe
  // holds its own on a pad bit (input/actions.ts).
  await release(page, 'aimMode')
  await expect.poll(view, { timeout: 2000 }).toBe('lob')
  // …and it stands OVER the ordinary chase, which is what "выше, чтобы удобно
  // целиться" asks for. The lift is the remake's and three/chase.ts says why.
  expect(aiming.y, 'the in-hand view is the raised one').toBeGreaterThan(behind.y)

  // **And the CHARGE does not take the view away.** Play: "она отменяется когда
  // нажимаешь f — и вот тут должна переживать пока зарядка идёт." The filling
  // gauge is its own control set and it sits ABOVE the sights in the priority
  // list (lib/game/controls.ts), which is what used to drop the flag; the exe
  // holds its own aim camera on the pad bit alone. Letting go of F throws, so
  // the reading ends there.
  await press(page, 'aimMode')
  await expect.poll(view, { timeout: 2000 }).toBe('throw')
  await press(page, 'fire')
  try {
    await expect
      .poll(async () => (await look(page)).charge ?? 0, { timeout: 4000 })
      .toBeGreaterThan(0.2)
    expect(await view(), 'the charge kept the view').toBe('throw')
  } finally {
    await release(page, 'fire')
    await release(page, 'aimMode')
  }
  expect(app.errors()).toEqual([])
})
