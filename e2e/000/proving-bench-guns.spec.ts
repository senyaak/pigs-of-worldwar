// PHASE 000 (continued) — THE GUN BENCH: every gun in 6..14 and 18 fired down the
// proving ground at a dummy through the real attack (e2e/bench.ts), its damage,
// reach and knock against the numbers read from the exe.
//
// Three things every case asserts, and where each is read:
//
// - **Reach**: the row's speed (0x4C2030 + kind × 40) times the lifetime the switch
//   at 0x4320D5 gives the kind, weapons/fire/projectile-class.md. The kind comes
//   off the weapon's record, field +0x10.
// - **Damage**: the row's +0x0C (weapons/fire/damage.md) times the hit handler's
//   `edi` (0x478796, 0x47878F, weapons/fire/hit-by-projectile.md).
// - **Knock**: the literal at 0x478A99/0x478A9D, 0x30 for every kind but 0x12, in
//   exe units a frame. That is the SPEED; the throw's 45° is `[play]`, not asserted
//   here (`SHOT_SHOVE`, lib/game/bullets.ts).
//
// **A case that says KNOWN SHORT pins what the remake does today, with what the exe
// does beside it and the issue that owns the gap.** When that issue lands the case
// goes red, and whoever landed it writes the exe's number in.
//
// Run with `npm run e2e:locked -- e2e/000/proving-bench-guns.spec.ts`: it needs the
// installed game and no window.

import { expect, test } from '@playwright/test'

import { benchInstalled, fireAtDummy } from '../bench'
import { GAME_DIR } from '../launch'

const PISTOL = 6
const RIFLE = 7
const RIFLE_BURST = 8
const MACHINE_GUN = 9
const HEAVY_M_GUN = 10
const SNIPER_RIFLE = 11
const SHOTGUN = 12
const SUPER_SHOTGUN = 13
const FLAME_THROWER = 14
const TRANQUILLISER_DART = 18

/** Each throw of the dummy against the exe's: the speeds are floats off a 45°. */
const expectKnock = (knock: number[], exe: number[]): void => {
  expect(knock.map((speed) => Math.round(speed * 1000) / 1000)).toEqual(exe)
}

test.beforeEach(() => {
  test.skip(!benchInstalled(), `no game install at ${GAME_DIR}`)
})

test('6 PISTOL: one round, 6000 of reach, 20 points and a knock of 48', async () => {
  const { rounds, reach, damage, lost, knock } = await fireAtDummy(PISTOL)
  // exe: weapons/fire/shot-and-muzzle.md, 0x47A298: the common shape, one projectile.
  expect(rounds).toBe(1)
  // exe: weapons/fire/projectile-class.md, 0x4320D5: kind 12, speed 300 for 20 frames.
  expect(reach).toBeCloseTo(300 * 20, 3)
  // exe: weapons/fire/damage.md: row +0x0C 2560; 0x478796: kind 0x0C has `edi` 1.
  expect(damage).toEqual([20])
  expect(lost).toBe(20)
  // exe: weapons/fire/hit-by-projectile.md, 0x478A9D: the literal 0x30.
  expectKnock(knock, [48])
})

test('7 RIFLE: one round, 9000 of reach, 20 points and a knock of 48', async () => {
  const { rounds, reach, damage, lost, knock } = await fireAtDummy(RIFLE)
  // exe: weapons/fire/shot-and-muzzle.md, 0x47A298: the common shape, one projectile.
  expect(rounds).toBe(1)
  // exe: weapons/fire/projectile-class.md, 0x4320D5: kind 13, speed 300 for 30 frames.
  expect(reach).toBeCloseTo(300 * 30, 3)
  // exe: weapons/fire/damage.md: row +0x0C 2560; 0x478796: kind 0x0D has `edi` 1.
  expect(damage).toEqual([20])
  expect(lost).toBe(20)
  // exe: weapons/fire/hit-by-projectile.md, 0x478A9D: the literal 0x30.
  expectKnock(knock, [48])
})

test('8 RIFLE BURST: 9000 of reach, 15 points a round and a knock of 48, KNOWN SHORT of its three rounds (#48)', async () => {
  const { rounds, reach, damage, lost, knock } = await fireAtDummy(RIFLE_BURST)
  // KNOWN SHORT, #48: the remake looses one round a press. exe:
  // weapons/fire/burst.md, 0x479C97: three rounds, at frames 0, 10 and 20.
  expect(rounds).toBe(1)
  // exe: weapons/fire/projectile-class.md, 0x4320D5: kind 14, speed 300 for 30 frames.
  expect(reach).toBeCloseTo(300 * 30, 3)
  // exe: weapons/fire/damage.md: row +0x0C 1920; 0x478796: kind 0x0E has `edi` 1,
  // so each round pays its own. KNOWN SHORT, #48: three landing are [15, 15, 15].
  expect(damage).toEqual([15])
  expect(lost).toBe(15)
  // exe: weapons/fire/hit-by-projectile.md, 0x478A9D: the literal 0x30, per round.
  expectKnock(knock, [48])
})

test('9 MACHINE GUN: 7500 of reach and a knock of 48, KNOWN SHORT of its eleven rounds and its first round ×5 (#48)', async () => {
  const { rounds, reach, damage, lost, knock } = await fireAtDummy(MACHINE_GUN)
  // KNOWN SHORT, #48: the remake looses one round a press. exe:
  // weapons/fire/burst.md, 0x479CC7: eleven rounds, frames 20 to 60 every 4.
  expect(rounds).toBe(1)
  // exe: weapons/fire/projectile-class.md, 0x4320D5: kind 16, speed 300 for 25 frames.
  expect(reach).toBeCloseTo(300 * 25, 3)
  // KNOWN SHORT, #48: the row's own 4. exe: weapons/fire/damage.md: row +0x0C 512;
  // weapons/fire/hit-by-projectile.md, 0x47878F: kind 0x10 has `edi` 5, so the first
  // round is 20, the next four are absorbed, and the sixth on pay 4 each.
  expect(damage).toEqual([4])
  expect(lost).toBe(4)
  // exe: weapons/fire/hit-by-projectile.md, 0x478A9D: the literal 0x30, per round.
  expectKnock(knock, [48])
})

test('10 HEAVY M-GUN: 7500 of reach and a knock of 48, KNOWN SHORT of its eleven rounds and its first round ×5 (TODO-ISSUE)', async () => {
  const { rounds, reach, damage, lost, knock } = await fireAtDummy(HEAVY_M_GUN)
  // KNOWN SHORT, TODO-ISSUE: the remake looses one round a press. exe:
  // weapons/fire/burst.md, 0x479CC7: eleven rounds, frames 20 to 60 every 4.
  expect(rounds).toBe(1)
  // exe: weapons/fire/projectile-class.md, 0x4320D5: kind 17, speed 300 for 25 frames.
  expect(reach).toBeCloseTo(300 * 25, 3)
  // KNOWN SHORT, TODO-ISSUE: the row's own 8. exe: weapons/fire/damage.md: row +0x0C
  // 1024; weapons/fire/hit-by-projectile.md, 0x47878F: kind 0x11 has `edi` 5, so the
  // first round is 40, the next four are absorbed, and the sixth on pay 8 each.
  expect(damage).toEqual([8])
  expect(lost).toBe(8)
  // exe: weapons/fire/hit-by-projectile.md, 0x478A9D: the literal 0x30, per round.
  expectKnock(knock, [48])
})

test('11 SNIPER RIFLE: one round, 27000 of reach, 40 points and a knock of 48', async () => {
  const { rounds, reach, damage, lost, knock } = await fireAtDummy(SNIPER_RIFLE)
  // exe: weapons/fire/shot-and-muzzle.md, 0x47A298: the common shape, one projectile.
  expect(rounds).toBe(1)
  // exe: weapons/fire/projectile-class.md, 0x4320D5: kind 15, speed 300 for 90 frames.
  expect(reach).toBeCloseTo(300 * 90, 3)
  // exe: weapons/fire/damage.md: row +0x0C 5120; 0x478796: kind 0x0F has `edi` 1.
  expect(damage).toEqual([40])
  expect(lost).toBe(40)
  // exe: weapons/fire/hit-by-projectile.md, 0x478A9D: the literal 0x30.
  expectKnock(knock, [48])
})

test('12 SHOTGUN: ten pellets, 4500 of reach, 30 points and a knock climbing by 6 to 60', async () => {
  const { rounds, reach, damage, lost, knock } = await fireAtDummy(SHOTGUN)
  // exe: weapons/fire/shotgun.md, 0x47A7B0: a loop of ten projectiles a press.
  expect(rounds).toBe(10)
  // exe: weapons/fire/projectile-class.md, 0x4320D5: kind 18, speed 300 for 15 frames.
  expect(reach).toBeCloseTo(300 * 15, 3)
  // exe: weapons/fire/damage.md: row +0x0C 384; weapons/fire/hit-by-projectile.md,
  // 0x47878F: kind 0x12 has `edi` 5: the first pellet 15, four absorbed, five at 3.
  expect(damage).toEqual([15, 3, 3, 3, 3, 3])
  expect(lost).toBe(30)
  // exe: weapons/fire/hit-by-projectile.md, 0x478A99: 6 for kind 0x12 alone, and
  // 0x4A9260 is an ADD, so ten pellets stack.
  expectKnock(knock, [6, 12, 18, 24, 30, 36, 42, 48, 54, 60])
})

test('13 SUPER SHOTGUN: ten pellets, 4500 of reach and 30 points, its knock DIFFERS from the exe (TODO-ISSUE)', async () => {
  const { rounds, reach, damage, lost, knock } = await fireAtDummy(SUPER_SHOTGUN)
  // exe: weapons/fire/shotgun.md, 0x47A7B0: the one arm of 12 and 13, ten projectiles.
  expect(rounds).toBe(10)
  // exe: weapons/fire/projectile-class.md, 0x4320D5: kind 19, speed 300 for 15 frames.
  expect(reach).toBeCloseTo(300 * 15, 3)
  // exe: weapons/fire/damage.md: row +0x0C 384; weapons/fire/hit-by-projectile.md,
  // 0x47878F: kind 0x13 has `edi` 5: the first pellet 15, four absorbed, five at 3.
  expect(damage).toEqual([15, 3, 3, 3, 3, 3])
  expect(lost).toBe(30)
  // DIFFERS, TODO-ISSUE: the remake's row 13 carries the shotgun's 6 a pellet. exe:
  // weapons/fire/hit-by-projectile.md, 0x478A92: the 6 is for kind 0x12 ALONE, and
  // this is kind 0x13, so each pellet adds the literal 0x30: 48, 96 .. 480.
  expectKnock(knock, [6, 12, 18, 24, 30, 36, 42, 48, 54, 60])
})

test('14 FLAME THROWER: 3000 of reach and a knock of 48, KNOWN SHORT of its seventeen rounds and its first round ×5 (TODO-ISSUE)', async () => {
  const { rounds, reach, damage, lost, knock } = await fireAtDummy(FLAME_THROWER)
  // KNOWN SHORT, TODO-ISSUE: the remake looses one round a press. exe:
  // weapons/fire/burst.md, 0x479CC7: seventeen rounds, frames 20 to 100 every 5.
  expect(rounds).toBe(1)
  // exe: weapons/fire/projectile-class.md, 0x4320D5: kind 23, speed 150 for 20 frames.
  expect(reach).toBeCloseTo(150 * 20, 3)
  // KNOWN SHORT, TODO-ISSUE: the row's own 6. exe: weapons/fire/damage.md: row +0x0C
  // 768; weapons/fire/hit-by-projectile.md, 0x478788: kind 0x17 has `edi` 5, so the
  // first round is 30, the next four are absorbed, and the sixth on pay 6 each.
  expect(damage).toEqual([6])
  expect(lost).toBe(6)
  // exe: weapons/fire/hit-by-projectile.md, 0x478A9D: the literal 0x30, per round.
  expectKnock(knock, [48])
})

test('18 TRANQUILLISER DART: one round, 9000 of reach, 20 points and a knock of 48, its status not built (#49)', async () => {
  const { rounds, reach, damage, lost, knock } = await fireAtDummy(TRANQUILLISER_DART)
  // exe: weapons/fire/shot-and-muzzle.md, 0x47A298: the common shape, one projectile.
  expect(rounds).toBe(1)
  // exe: 0x4320D5, byte map 0x4325E0 to arm 0x4320EE: kind 54 lives 30 frames, at the
  // row's speed 300 (0x4C2030 + 54 × 40), weapons/fire/projectile-class.md.
  expect(reach).toBeCloseTo(300 * 30, 3)
  // exe: weapons/fire/damage.md: row +0x0C 2560; 0x478796: kind 0x36 is past the byte
  // map's bound, so `edi` is 1. Its status (0x47893E) is not asserted: #49 builds it.
  expect(damage).toEqual([20])
  expect(lost).toBe(20)
  // exe: weapons/fire/hit-by-projectile.md, 0x478A9D: the literal 0x30.
  expectKnock(knock, [48])
})
