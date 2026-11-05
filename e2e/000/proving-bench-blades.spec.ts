// PHASE 000 (continued) — THE BLADE BENCH: each of the five skills resolved by contact
// swung at a dummy on the proving ground through the real attack (e2e/bench.ts), the
// real bone carrying the blade, its damage and its throw against the numbers read
// from the exe.
//
// What every case asserts, and where each is read, all weapons/melee.md:
//
// - **The clip**: the attack block's +0x20 in the record at 0x4D7320, read at 0x469696.
// - **Damage**: the five-way switch of `Pig::HitByHandToHand`, 0x4785C0. One hit whatever
//   the clip's strikes come to: clip 21 has three, clip 22 four (0x4733D0), and
//   `[pig+0x1B0]` lets one swing land on a body once (0x475A00).
// - **The throw**: that same switch's knockback, handed to 0x4A9100 at 0x4786C1 as
//   (knockback, 0x200, bearing, 0): that speed in exe units a frame, 45° up, along the
//   bearing the strike came from.
//
// Run with `npm run e2e:locked -- e2e/000/proving-bench-blades.spec.ts`: it needs the
// installed game and no window.

import { expect, test } from '@playwright/test'

import { OFF_THE_LINE_Z, benchInstalled, inHand, openBench, pressFire, standAt, stepUntil } from '../bench'
import { GAME_DIR } from '../launch'
import { fromExeSpeed } from '../../src/lib/game/ballistics'
import { turnBetween } from '../../src/lib/game/melee'

const TROTTER = 1
const KNIFE = 2
const BAYONET = 3
const SWORD = 4
const CATTLE_PROD = 5

/** How far in front of the swinger the dummy stands: the distance the brain itself
 * stands off for a blade (`MELEE_NEAR`, lib/game/evaluate.ts), and inside the reach of
 * all five. What is on trial is what a blow does, not how far each one reaches. */
const ARMS_LENGTH = 180

/** What one swing at a dummy came to. */
interface SwingReport {
  /** The clips the swing put on the swinger. */
  clips: number[]
  /** Each hit's points off the dummy, in the order they landed. */
  damage: number[]
  /** The points the dummy is down the moment it is thrown: `damage` as its health has
   * it, with the ground it comes down on still to come. */
  lost: number
  /** Each throw of the dummy. */
  throws: { vx: number; vy: number; vz: number }[]
  /** The way the swinger was facing, which is the bearing to a dummy stood straight
   * in front of it. */
  bearing: number
  /** How far along that bearing the dummy came to rest. */
  carried: number
}

/** The nearest dummy stood in front of the player's pig, the rest off the strip, and
 * one press of the fire key with this blade in hand. */
async function swingAtDummy(skill: number): Promise<SwingReport> {
  const bench = await openBench()
  const { engine, heard, pig, dummies } = bench
  const [target, ...others] = dummies
  for (const dummy of others) standAt(bench, dummy, dummy.position.x, OFF_THE_LINE_Z)
  const bearing = pig.heading
  const facing = { x: Math.sin(bearing), z: Math.cos(bearing) }
  const stoodAt = {
    x: pig.position.x + facing.x * ARMS_LENGTH,
    z: pig.position.z + facing.z * ARMS_LENGTH
  }
  standAt(bench, target, stoodAt.x, stoodAt.z)
  const healthy = target.health
  const throwsOf = (): Extract<(typeof heard)[number], { kind: 'flung' }>[] =>
    heard.flatMap((event) => (event.kind === 'flung' && event.pig === target.id ? [event] : []))

  inHand(bench, skill)
  const pressedAt = heard.length
  pressFire(bench)
  stepUntil(bench, () => throwsOf().length > 0, `skill ${skill} swings and lands on the dummy`)
  const lost = healthy - target.health
  stepUntil(
    bench,
    () => !engine.snapshot().swinging && engine.tumbles.live() === 0,
    `the swing of skill ${skill} runs out and the dummy comes down`
  )

  return {
    clips: heard
      .slice(pressedAt)
      .flatMap((event) => (event.kind === 'clip' && event.pig === pig.id ? [event.index] : [])),
    damage: heard.flatMap((event) =>
      event.kind === 'damaged' && event.pig === target.id && event.blow === true ? [event.amount] : []
    ),
    lost,
    throws: throwsOf(),
    bearing,
    carried: (target.position.x - stoodAt.x) * facing.x + (target.position.z - stoodAt.z) * facing.z
  }
}

/** One throw of the dummy at this speed in exe units a frame, in the shape 0x4786C1's
 * arguments give every blade, and the body really going. */
const expectThrown = ({ throws, bearing, carried }: SwingReport, speed: number): void => {
  expect(throws).toHaveLength(1)
  const [{ vx, vy, vz }] = throws
  expect(Math.hypot(vx, vy, vz) / fromExeSpeed(1)).toBeCloseTo(speed, 3)
  // exe: weapons/melee.md, 0x4786B9: 0x200 of 4096 is 45° up, and up is −Y here.
  expect(Math.atan2(-vy, Math.hypot(vx, vz))).toBeCloseTo(Math.PI / 4, 5)
  // exe: weapons/melee.md, 0x4786B8: the bearing the strike came from.
  expect(turnBetween(Math.atan2(vx, vz), bearing)).toBeCloseTo(0, 5)
  expect(carried).toBeGreaterThan(0)
}

test.beforeEach(() => {
  test.skip(!benchInstalled(), `no game install at ${GAME_DIR}`)
})

test('1 TROTTER: clip 21, 15 points and a throw of 100', async () => {
  const report = await swingAtDummy(TROTTER)
  // exe: weapons/melee.md, 0x469696: clip 21, "Sword / Knife".
  expect(report.clips).toEqual([21])
  // exe: weapons/melee.md, 0x4785DA: 15 points.
  expect(report.damage).toEqual([15])
  expect(report.lost).toBe(15)
  // exe: weapons/melee.md, 0x4785DF: 0x64.
  expectThrown(report, 100)
})

test('2 KNIFE: clip 21, 15 points and a throw of 125', async () => {
  const report = await swingAtDummy(KNIFE)
  // exe: weapons/melee.md, 0x469696: clip 21, "Sword / Knife".
  expect(report.clips).toEqual([21])
  // exe: weapons/melee.md, 0x4785E6: 15 points.
  expect(report.damage).toEqual([15])
  expect(report.lost).toBe(15)
  // exe: weapons/melee.md, 0x4785EB: 0x7D.
  expectThrown(report, 125)
})

test('3 BAYONET: clip 22, 10 points and a throw of 75', async () => {
  const report = await swingAtDummy(BAYONET)
  // exe: weapons/melee.md, 0x469696: clip 22, "Bayonet".
  expect(report.clips).toEqual([22])
  // exe: weapons/melee.md, 0x4785F2: 10 points.
  expect(report.damage).toEqual([10])
  expect(report.lost).toBe(10)
  // exe: weapons/melee.md, 0x4785F7: 0x4B.
  expectThrown(report, 75)
})

test('4 SWORD: clip 21, 25 points and a throw of 150', async () => {
  const report = await swingAtDummy(SWORD)
  // exe: weapons/melee.md, 0x469696: clip 21, "Sword / Knife".
  expect(report.clips).toEqual([21])
  // exe: weapons/melee.md, 0x4785FE: 25 points.
  expect(report.damage).toEqual([25])
  expect(report.lost).toBe(25)
  // exe: weapons/melee.md, 0x478603: 0x96.
  expectThrown(report, 150)
})

test('5 CATTLE PROD: clip 22, 25 points and a throw of 200', async () => {
  const report = await swingAtDummy(CATTLE_PROD)
  // exe: weapons/melee.md, 0x469696: clip 22, the bayonet's.
  expect(report.clips).toEqual([22])
  // exe: weapons/melee.md, 0x47860A: 25 points.
  expect(report.damage).toEqual([25])
  expect(report.lost).toBe(25)
  // exe: weapons/melee.md, 0x47860F: 0xC8.
  expectThrown(report, 200)
})
